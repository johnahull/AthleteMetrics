/**
 * Eval battery templates and per-organization eval report settings (AM-FEAT-019 P2).
 *
 * Authorization rule: the organization always comes from the ROW (template.organizationId,
 * event.organizationId) or the URL organization, never from the session's primary organization.
 * Every "not yours" case returns null so the route answers 404 (no probing of other orgs' ids).
 */
import { and, asc, eq, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { auditLogs, evalBatteryTemplates, eventMetrics, orgEvalReportSettings, organizations } from "@shared/schema";
import type { EvalBatteryTemplate, OrgEvalReportSettings, UserOrganization } from "@shared/schema";
import type { EvalTemplateMetric, EvalReportSettingsInput } from "@shared/eval-template-schemas";
import { getOrgRole, isMeasurementWriterRole } from "../permissions/measurement-helpers";
import { isSiteAdmin } from "../permissions/helpers";
import { EventMetricsFrozenError } from "./event-metrics-service";
import { bulkAddEventMetrics } from "./event-metrics-bulk";
import { fetchEligibilityRows, ineligibleReason, type IneligibleReason } from "./event-metric-eligibility";
import { keyForCode, resolveTemplateKey } from "./eval-report/template-keys";

export type Actor = { id: string; isSiteAdmin?: boolean; role?: string };

export class TemplateConflictError extends Error {}
export class EventFrozenError extends Error {}
export class EmptyEventError extends Error {}
/** A 404: the template vanished between the authorization check and the write. */
export class TemplateNotFoundError extends Error {
  constructor() {
    super("Template not found");
  }
}
/** A 409: archived templates are read-only. */
export class TemplateArchivedError extends Error {
  constructor() {
    super("Template is archived");
  }
}
/** A 400: the message says what is wrong with the request. */
export class TemplateValidationError extends Error {}

/** Coach / org_admin of THIS organization, or a site admin. */
export async function isOrgWriter(user: Actor, organizationId: string | null | undefined): Promise<boolean> {
  return isMeasurementWriterRole(await getOrgRole(user, organizationId));
}

async function isWriterAnywhere(user: Actor): Promise<boolean> {
  if (isSiteAdmin(user)) return true;
  const memberships: Pick<UserOrganization, "role">[] = (await storage.getUserOrganizations(user.id)) ?? [];
  return memberships.some((m) => isMeasurementWriterRole(m.role));
}

function hasCode(v: unknown, code: string): boolean {
  return typeof v === "object" && v !== null && (v as { code?: unknown }).code === code;
}

function isUniqueViolation(e: unknown): boolean {
  return hasCode(e, "23505") || (typeof e === "object" && e !== null && hasCode((e as { cause?: unknown }).cause, "23505"));
}

/** The template if the user may see it (own-org writer, or any writer for the global default), else null. */
export async function getVisibleTemplate(user: Actor, id: string): Promise<EvalBatteryTemplate | null> {
  const [row] = await db.select().from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, id));
  if (!row) return null;
  const allowed = row.organizationId ? await isOrgWriter(user, row.organizationId) : await isWriterAnywhere(user);
  return allowed ? row : null;
}

/** Editing the global default is for site admins only; an org template for that org's writers (or a site admin). */
export async function canEditTemplate(user: Actor, template: Pick<EvalBatteryTemplate, "organizationId">): Promise<boolean> {
  return template.organizationId ? isOrgWriter(user, template.organizationId) : isSiteAdmin(user);
}

export async function listTemplates(organizationId: string): Promise<EvalBatteryTemplate[]> {
  return db
    .select()
    .from(evalBatteryTemplates)
    .where(and(isNull(evalBatteryTemplates.archivedAt), or(eq(evalBatteryTemplates.organizationId, organizationId), isNull(evalBatteryTemplates.organizationId))))
    .orderBy(asc(evalBatteryTemplates.name));
}

export async function organizationExists(organizationId: string): Promise<boolean> {
  const [row] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId));
  return !!row;
}

const SINGLE_LEG_CMJ = ["CMJ_SL_LEFT", "CMJ_SL_RIGHT"];

const REJECTED: Record<IneligibleReason, string> = {
  unknown: "Unknown metrics",
  derived: "Calculated metrics cannot be template tests",
  inactive: "Inactive metrics",
  unavailable: "Metrics not offered to this organization's type",
};

/** The stored form of a key: the logical key when the code has one (FLY10_TIME -> FLY_10), else the literal code. */
function normalizeKey(metricKey: string): string {
  try {
    return keyForCode(resolveTemplateKey(metricKey));
  } catch (e) {
    throw new TemplateValidationError((e as Error).message);
  }
}

/**
 * Normalizes every key to its stored form and checks the list; returns the list to store.
 * - No two keys may resolve to the same code.
 * - A derived metric is always rejected.
 * - A missing, inactive or (with `orgType`) not-offered metric is rejected only when it is NEW, i.e. its code is not
 *   among `previous` (the template's stored entries), so an older template whose metric went stale can still be saved.
 * - The two single-leg CMJ sides can not both be required (an event uses one side per athlete).
 */
async function validateMetrics(metrics: EvalTemplateMetric[], orgType: string | null, previous: EvalTemplateMetric[] = []): Promise<EvalTemplateMetric[]> {
  const normalized = metrics.map((m) => ({ ...m, metricKey: normalizeKey(m.metricKey) }));
  const codes = normalized.map((m) => resolveTemplateKey(m.metricKey));
  const duplicated = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (duplicated.length > 0) {
    throw new TemplateValidationError(`Metrics resolve to the same code: ${[...new Set(duplicated)].join(", ")}`);
  }
  const previousCodes = new Set(previous.map((m) => resolveTemplateKey(m.metricKey)));
  const byCode = await fetchEligibilityRows(codes);
  const rejected = new Map<IneligibleReason, string[]>();
  metrics.forEach((m, i) => {
    const reason = ineligibleReason(byCode.get(codes[i]), orgType);
    if (reason === null || (reason !== "derived" && previousCodes.has(codes[i]))) return;
    rejected.set(reason, [...(rejected.get(reason) ?? []), m.metricKey]);
  });
  if (rejected.size > 0) {
    throw new TemplateValidationError([...rejected].map(([reason, keys]) => `${REJECTED[reason]}: ${keys.join(", ")}`).join("; "));
  }
  if (SINGLE_LEG_CMJ.every((k) => normalized.some((m) => m.metricKey === k && m.isRequired))) {
    throw new TemplateValidationError("Only one single-leg CMJ side can be required; make one optional");
  }
  return normalized;
}

/** Audit rows are best effort: a failed write is logged, never fails the change it describes. */
async function writeTemplateAudit(userId: string, action: "eval_template_updated" | "eval_template_deleted", templateId: string, details: Record<string, unknown>) {
  try {
    await db.insert(auditLogs).values({ userId, action, resourceType: "eval_template", resourceId: templateId, details: JSON.stringify(details) });
  } catch (e) {
    console.error(`Failed to write ${action} audit log for template ${templateId}:`, e);
  }
}

async function insertTemplate(values: typeof evalBatteryTemplates.$inferInsert): Promise<EvalBatteryTemplate> {
  try {
    const [row] = await db.insert(evalBatteryTemplates).values(values).returning();
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new TemplateConflictError("A template with this name already exists");
    throw e;
  }
}

export async function createTemplate(
  organizationId: string,
  userId: string,
  input: { name: string; sport: string; description?: string; metrics: EvalTemplateMetric[] }
) {
  // Every key of a new template is new: the organization's type applies to all of them
  const metrics = await validateMetrics(input.metrics, await orgTypeOf(organizationId));
  // Explicit fields only: nothing else from the request body reaches the row
  const { name, sport, description } = input;
  return insertTemplate({ name, sport, description, metrics, organizationId, createdBy: userId });
}

/** Save an event's current metric set as a template for the event's organization. */
export async function createTemplateFromEvent(
  event: { id: string; organizationId: string },
  userId: string,
  input: { name: string; sport: string; description?: string }
) {
  const rows = await db.select().from(eventMetrics).where(eq(eventMetrics.eventId, event.id)).orderBy(asc(eventMetrics.displayOrder));
  if (rows.length === 0) throw new EmptyEventError("The event has no metrics to save");
  let metrics: EvalTemplateMetric[];
  try {
    metrics = rows.map((r) => ({
    metricKey: keyForCode(r.metricCode),
    isRequired: r.isRequired,
    displayOrder: r.displayOrder,
    ...(r.customLabel ? { customLabel: r.customLabel } : {}),
    }));
  } catch (e) {
    throw new TemplateValidationError((e as Error).message);
  }
  return createTemplate(event.organizationId, userId, { ...input, metrics });
}

/** The update matched no active row: the template is gone (404) or archived (409). */
async function throwNotFoundOrArchived(id: string): Promise<never> {
  const [row] = await db.select({ archivedAt: evalBatteryTemplates.archivedAt }).from(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, id));
  if (row?.archivedAt) throw new TemplateArchivedError();
  throw new TemplateNotFoundError();
}

/**
 * Partial update of `template` (the row the route authorized). The organization type comes from the template's own
 * organization (none for the global default); the eligibility rule compares with the template's stored metrics.
 * Last write wins: there is no version check, so of two concurrent saves the later one is kept.
 */
export async function updateTemplate(
  template: Pick<EvalBatteryTemplate, "id" | "organizationId" | "metrics">,
  patch: { name?: string; sport?: string; description?: string | null; metrics?: EvalTemplateMetric[] },
  userId: string
) {
  const metrics = patch.metrics ? await validateMetrics(patch.metrics, await orgTypeOf(template.organizationId), template.metrics) : undefined;
  const { name, sport, description } = patch;
  let row: EvalBatteryTemplate | undefined;
  try {
    // Drizzle's .set() skips undefined fields, which is what makes this a partial update
    // (null, by contrast, is written, so description: null clears it).
    [row] = await db
      .update(evalBatteryTemplates)
      .set({ name, sport, description, metrics, updatedAt: new Date() })
      .where(and(eq(evalBatteryTemplates.id, template.id), isNull(evalBatteryTemplates.archivedAt)))
      .returning();
  } catch (e) {
    if (isUniqueViolation(e)) throw new TemplateConflictError("A template with this name already exists");
    throw e;
  }
  if (!row) return await throwNotFoundOrArchived(template.id);
  const changedFields = (["name", "sport", "description", "metrics"] as const).filter((f) => patch[f] !== undefined);
  await writeTemplateAudit(userId, "eval_template_updated", row.id, { name: row.name, organizationId: row.organizationId, changedFields, metricCount: row.metrics.length });
  return row;
}

export async function archiveTemplate(id: string) {
  const [row] = await db
    .update(evalBatteryTemplates)
    .set({ archivedAt: new Date(), updatedAt: new Date() })
    .where(and(eq(evalBatteryTemplates.id, id), isNull(evalBatteryTemplates.archivedAt)))
    .returning();
  if (!row) return await throwNotFoundOrArchived(id);
  return row;
}

/** Hard delete. Events keep their copied tests (nothing stores a template id); the audit row keeps the full template. */
export async function deleteTemplate(id: string, userId: string) {
  const [row] = await db.delete(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, id)).returning();
  if (!row) return;
  await writeTemplateAudit(userId, "eval_template_deleted", row.id, {
    name: row.name,
    organizationId: row.organizationId,
    sport: row.sport,
    description: row.description,
    metrics: row.metrics,
  });
}

/**
 * 'derived': the metric is computed, never entered, so it can not be an event metric.
 * 'inactive': switched off by a site admin. 'missing': no site_metrics row for the key's code.
 * 'unavailable': the metric is not offered to the organization's type.
 */
export type ResolvedMetricStatus = "available" | "missing" | "inactive" | "derived" | "unavailable";

export interface ResolvedTemplateMetric {
  metricKey: string;
  code: string;
  /** site_metrics label, null when the metric is missing */
  label: string | null;
  unit: string | null;
  category: string | null;
  customLabel?: string;
  isRequired: boolean;
  displayOrder: number;
  status: ResolvedMetricStatus;
}

/** The organization's type (for the availability rule), or null when there is none or the org is unknown */
export async function orgTypeOf(organizationId: string | null | undefined): Promise<string | null> {
  if (!organizationId) return null;
  const [row] = await db.select({ orgType: organizations.orgType }).from(organizations).where(eq(organizations.id, organizationId));
  return row?.orgType ?? null;
}

/**
 * Every entry of the template resolved to its site_metrics code and status, in displayOrder (ONE query).
 * With `orgType`, a metric not offered to that organization type is 'unavailable'.
 */
export async function resolveTemplateMetrics(template: Pick<EvalBatteryTemplate, "metrics">, orgType: string | null = null): Promise<ResolvedTemplateMetric[]> {
  const entries = [...template.metrics].sort((a, b) => a.displayOrder - b.displayOrder).map((m) => ({ ...m, code: resolveTemplateKey(m.metricKey) }));
  const byCode = await fetchEligibilityRows(entries.map((m) => m.code));
  return entries.map((m) => {
    const row = byCode.get(m.code);
    const reason = ineligibleReason(row, orgType);
    return {
      metricKey: m.metricKey,
      code: m.code,
      label: row?.label ?? null,
      unit: row?.unit ?? null,
      category: row?.category ?? null,
      ...(m.customLabel ? { customLabel: m.customLabel } : {}),
      isRequired: m.isRequired,
      displayOrder: m.displayOrder,
      status: reason === null ? "available" : reason === "unknown" ? "missing" : reason,
    };
  });
}

/**
 * Pre-load the event's metrics from a template: the required ones, plus the optional ones named in
 * `includeOptional` (at most one single-leg CMJ). Keys whose metric is missing, inactive, derived or not offered
 * to the event's organization type are skipped and returned in `skipped`; metrics already on the event are left
 * alone (`alreadyPresent`). The write is the atomic bulkAddEventMetrics (frozen check, insert and audit log in one transaction).
 */
export async function applyTemplateToEvent(eventId: string, userId: string, template: EvalBatteryTemplate, organizationId: string | null, includeOptional: string[] = []) {
  const optionalKeys = new Set(template.metrics.filter((m) => !m.isRequired).map((m) => m.metricKey));
  const notOptional = includeOptional.filter((k) => !optionalKeys.has(k));
  if (notOptional.length > 0) throw new TemplateValidationError(`Not optional metrics of this template: ${notOptional.join(", ")}`);
  if (SINGLE_LEG_CMJ.every((k) => includeOptional.includes(k))) {
    throw new TemplateValidationError("Use one single-leg CMJ per athlete, not both");
  }

  const chosen = (await resolveTemplateMetrics(template, await orgTypeOf(organizationId))).filter((m) => m.isRequired || includeOptional.includes(m.metricKey));
  if (chosen.length === 0) return { added: [], skipped: [], alreadyPresent: [] };

  const usable = chosen.filter((m) => m.status === "available");
  const skipped = chosen.filter((m) => m.status !== "available").map((m) => m.metricKey);
  try {
    const result = await bulkAddEventMetrics(
      eventId,
      userId,
      usable.map((m) => ({ metricCode: m.code, displayOrder: m.displayOrder, isRequired: m.isRequired, customLabel: m.customLabel }))
    );
    return { added: result.added, skipped, alreadyPresent: result.alreadyPresent };
  } catch (e) {
    if (e instanceof EventMetricsFrozenError) throw new EventFrozenError(e.message);
    throw e;
  }
}

/** What GET returns: a stored row, or the synthetic default when none exists yet (no timestamps or author). */
export type EvalReportSettingsView = Pick<OrgEvalReportSettings, "organizationId" | "presets" | "lastSelection"> &
  Partial<Omit<OrgEvalReportSettings, "organizationId" | "presets" | "lastSelection">>;

export async function getSettings(organizationId: string): Promise<EvalReportSettingsView> {
  const [row] = await db.select().from(orgEvalReportSettings).where(eq(orgEvalReportSettings.organizationId, organizationId));
  return row ?? { organizationId, presets: {}, lastSelection: null };
}

/** Upsert; only the fields sent are changed. */
export async function putSettings(organizationId: string, userId: string, input: EvalReportSettingsInput): Promise<OrgEvalReportSettings> {
  const changes = {
    ...(input.presets !== undefined ? { presets: input.presets as OrgEvalReportSettings["presets"] } : {}),
    ...(input.lastSelection !== undefined ? { lastSelection: input.lastSelection } : {}),
    updatedAt: new Date(),
    updatedBy: userId,
  };
  const [row] = await db
    .insert(orgEvalReportSettings)
    .values({ organizationId, ...changes })
    .onConflictDoUpdate({ target: orgEvalReportSettings.organizationId, set: changes })
    .returning();
  return row;
}
