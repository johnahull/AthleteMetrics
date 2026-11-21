/**
 * Eval battery template revisions (AM-FEAT-024). A revision is one published battery; it is append-only.
 * This module only ever INSERTs revisions: migration 0180 adds a trigger that refuses UPDATE and DELETE, but a
 * db:push database has no trigger, so the rule is kept here too (a test covers it).
 */
import { desc, eq, sql } from "drizzle-orm";
import { db } from "../db";
import { evalBatteryTemplateRevisions, evalBatteryTemplates, events } from "@shared/schema";
import type { EvalBatteryTemplate, EvalBatteryTemplateRevision } from "@shared/schema";
import type { EvalTemplateMetric } from "@shared/eval-template-schemas";
import type { EvalReportModel } from "./eval-report/model";
import { isMqiMetricCode, isMqiRequiredPreset } from "./eval-report/mqi-required";

export type Tx = Parameters<Parameters<typeof db.transaction>[0]>[0];
type Executor = Pick<typeof db, "select">;

const metricsKey = (list: EvalTemplateMetric[]) => JSON.stringify(list.map((m) => [m.metricKey, m.isRequired, m.displayOrder, m.customLabel ?? null]));
export const sameMetrics = (a: EvalTemplateMetric[], b: EvalTemplateMetric[]) => metricsKey(a) === metricsKey(b);

/** The row array of a `tx.execute()` result: node-postgres-style `{ rows }` or a plain array (postgres-js). */
function rowsOf(result: unknown): unknown[] {
  if (Array.isArray(result)) return result;
  const rows = (result as { rows?: unknown } | null)?.rows;
  return Array.isArray(rows) ? rows : [];
}

/** A 404: the template vanished (deleted between the authorization check and the write). */
export class TemplateNotFoundError extends Error {
  constructor() {
    super("Template not found");
  }
}

/** A 409: the metric is one the applied Foundation / Performance preset requires. */
export class RequiredMetricError extends Error {}

/**
 * Publish `metrics` as the template's next revision and make it current. The template row is locked first, so two
 * concurrent saves get revisions n and n+1 (never a duplicate). Returns the new revision.
 */
export async function publishRevision(tx: Tx, templateId: string, metrics: EvalTemplateMetric[], userId: string | null): Promise<EvalBatteryTemplateRevision> {
  await tx.select({ id: evalBatteryTemplates.id }).from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, templateId)).for("update");
  const [latest] = await tx
    .select({ revision: evalBatteryTemplateRevisions.revision })
    .from(evalBatteryTemplateRevisions)
    .where(eq(evalBatteryTemplateRevisions.templateId, templateId))
    .orderBy(desc(evalBatteryTemplateRevisions.revision))
    .limit(1);
  const [row] = await tx
    .insert(evalBatteryTemplateRevisions)
    .values({ templateId, revision: (latest?.revision ?? 0) + 1, metrics, createdBy: userId })
    .returning();
  await tx.update(evalBatteryTemplates).set({ currentRevisionId: row.id }).where(eq(evalBatteryTemplates.id, templateId));
  return row;
}

/**
 * The revision to apply: the current one, provided it still matches the template's stored tests. When it does not
 * (a template saved before revisions existed, or a direct SQL edit of eval_battery_templates.metrics such as the older
 * migrations did) the stored tests are published as a new revision first, under the template row lock, so the event
 * applies what the picker shows and the old revision stays untouched.
 */
export async function currentRevisionOf(template: EvalBatteryTemplate, userId: string): Promise<EvalBatteryTemplateRevision> {
  const matching = async (ex: Executor, t: Pick<EvalBatteryTemplate, "currentRevisionId" | "metrics">) => {
    if (!t.currentRevisionId) return null;
    const [row] = await ex.select().from(evalBatteryTemplateRevisions).where(eq(evalBatteryTemplateRevisions.id, t.currentRevisionId));
    return row && sameMetrics(row.metrics, t.metrics) ? row : null;
  };
  const fast = await matching(db, template);
  if (fast) return fast;
  return db.transaction(async (tx) => {
    // Re-read under the lock: another request may have published meanwhile
    const [locked] = await tx.select().from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, template.id)).for("update");
    if (!locked) throw new TemplateNotFoundError();
    const current = locked;
    return (await matching(tx, current)) ?? publishRevision(tx, template.id, current.metrics, userId);
  });
}

/**
 * Record the revision an event applied, inside the caller's transaction. A preset link is never overwritten by a
 * non-preset template (a coach adding their own battery on top of Foundation keeps the Foundation lock and label).
 */
export async function linkEventRevision(tx: Tx, eventId: string, revisionId: string, isPreset: boolean): Promise<void> {
  // Shared lock on the template row: deleteTemplate takes it FOR UPDATE, so the two serialize. A template deleted
  // meanwhile (its revisions went with it) fails the whole transaction cleanly instead of an FK error or a lost link.
  const locked = await tx.execute(sql`SELECT t.id FROM eval_battery_templates t JOIN eval_battery_template_revisions r ON r.template_id = t.id WHERE r.id = ${revisionId} FOR SHARE OF t`);
  if (rowsOf(locked).length === 0) throw new TemplateNotFoundError();
  const notPresetLinked = sql`(${events.evalTemplateRevisionId} IS NULL OR ${events.evalTemplateRevisionId} NOT IN (
    SELECT r.id FROM eval_battery_template_revisions r JOIN eval_battery_templates t ON t.id = r.template_id WHERE t.preset_key IS NOT NULL))`;
  await tx
    .update(events)
    .set({ evalTemplateRevisionId: revisionId })
    .where(isPreset ? eq(events.id, eventId) : sql`${events.id} = ${eventId} AND ${notPresetLinked}`);
}

/** What a report freezes about the template the event used; null when the event applied none. */
export interface TemplateRevisionRef {
  templateId: string;
  revision: number;
  name: string;
}

export async function templateRevisionRefForEvent(eventId: string, executor: Executor = db): Promise<TemplateRevisionRef | null> {
  const [row] = await executor
    .select({ templateId: evalBatteryTemplates.id, revision: evalBatteryTemplateRevisions.revision, name: evalBatteryTemplates.name })
    .from(events)
    .innerJoin(evalBatteryTemplateRevisions, eq(evalBatteryTemplateRevisions.id, events.evalTemplateRevisionId))
    .innerJoin(evalBatteryTemplates, eq(evalBatteryTemplates.id, evalBatteryTemplateRevisions.templateId))
    .where(eq(events.id, eventId));
  return row ?? null;
}

/** Freeze the template revision the event applied into the model's selection; an event with none adds nothing. */
export async function freezeTemplateRevision(model: EvalReportModel, eventId: string): Promise<void> {
  const ref = await templateRevisionRefForEvent(eventId);
  if (ref) model.selection.template = ref;
}

/**
 * Movement (MQI) is required in the Foundation and Performance presets: throws RequiredMetricError when `code` is an
 * MQI metric of an event whose applied revision is one of those presets. Any other event or metric passes.
 */
export async function assertMetricRemovable(eventId: string, code: string): Promise<void> {
  if (!isMqiMetricCode(code)) return;
  const [row] = await db
    .select({ presetKey: evalBatteryTemplates.presetKey, name: evalBatteryTemplates.name })
    .from(events)
    .innerJoin(evalBatteryTemplateRevisions, eq(evalBatteryTemplateRevisions.id, events.evalTemplateRevisionId))
    .innerJoin(evalBatteryTemplates, eq(evalBatteryTemplates.id, evalBatteryTemplateRevisions.templateId))
    .where(eq(events.id, eventId));
  if (!row || !isMqiRequiredPreset(row)) return;
  throw new RequiredMetricError(`Movement (MQI) is required in the ${row.name} assessment and cannot be removed or made optional. An athlete can still be marked Not tested.`);
}
