/**
 * Eval battery templates and per-organization eval report settings (AM-FEAT-019 P2).
 *
 * Authorization rule: the organization always comes from the ROW (template.organizationId,
 * event.organizationId) or the URL organization, never from the session's primary organization.
 * Every "not yours" case returns null so the route answers 404 (no probing of other orgs' ids).
 */
import { and, asc, eq, inArray, isNull, or } from "drizzle-orm";
import { db } from "../db";
import { storage } from "../storage";
import { evalBatteryTemplates, eventMetrics, orgEvalReportSettings, organizations, siteMetrics } from "@shared/schema";
import type { EvalBatteryTemplate, OrgEvalReportSettings, UserOrganization } from "@shared/schema";
import type { EvalTemplateMetric, EvalReportSettingsInput } from "@shared/eval-template-schemas";
import { getOrgRole, isMeasurementWriterRole } from "../permissions/measurement-helpers";
import { isSiteAdmin } from "../permissions/helpers";
import { EventMetricsFrozenError } from "./event-metrics-service";
import { bulkAddEventMetrics } from "./event-metrics-bulk";
import { fetchEligibilityRows, ineligibleReason } from "./event-metric-eligibility";
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

/** Every key must resolve to an existing site_metrics code, and no two keys may resolve to the same code. */
async function validateMetrics(metrics: EvalTemplateMetric[]): Promise<void> {
  const codes = metrics.map((m) => resolveTemplateKey(m.metricKey));
  const duplicated = codes.filter((c, i) => codes.indexOf(c) !== i);
  if (duplicated.length > 0) {
    throw new TemplateValidationError(`Metrics resolve to the same code: ${[...new Set(duplicated)].join(", ")}`);
  }
  const known = new Set((await db.select({ code: siteMetrics.code }).from(siteMetrics).where(inArray(siteMetrics.code, codes))).map((r) => r.code));
  const unknown = metrics.filter((_, i) => !known.has(codes[i])).map((m) => m.metricKey);
  if (unknown.length > 0) throw new TemplateValidationError(`Unknown metrics: ${unknown.join(", ")}`);
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
  await validateMetrics(input.metrics);
  // Explicit fields only: nothing else from the request body reaches the row
  const { name, sport, description, metrics } = input;
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

export async function updateTemplate(
  id: string,
  patch: { name?: string; sport?: string; description?: string | null; metrics?: EvalTemplateMetric[] }
) {
  if (patch.metrics) await validateMetrics(patch.metrics);
  const { name, sport, description, metrics } = patch;
  try {
    // Drizzle's .set() skips undefined fields, which is what makes this a partial update
    // (null, by contrast, is written, so description: null clears it).
    const [row] = await db
      .update(evalBatteryTemplates)
      .set({ name, sport, description, metrics, updatedAt: new Date() })
      .where(and(eq(evalBatteryTemplates.id, id), isNull(evalBatteryTemplates.archivedAt)))
      .returning();
    if (!row) return await throwNotFoundOrArchived(id);
    return row;
  } catch (e) {
    if (isUniqueViolation(e)) throw new TemplateConflictError("A template with this name already exists");
    throw e;
  }
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

export async function deleteTemplate(id: string) {
  await db.delete(evalBatteryTemplates).where(eq(evalBatteryTemplates.id, id));
}

const SINGLE_LEG_CMJ = ["CMJ_SL_LEFT", "CMJ_SL_RIGHT"];

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
