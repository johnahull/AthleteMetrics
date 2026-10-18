/**
 * Report templates: org-wide saved metrics, benchmark sets / picks and chart choices for the report wizard.
 * The organization always comes from the ROW (template.organizationId) or the URL organization, never from
 * the session. Every "not yours" case answers 404 at the route (no probing of other orgs' ids).
 */
import { asc, eq } from "drizzle-orm";
import { db } from "../db";
import { organizations, reportTemplates } from "@shared/schema";
import type { ReportTemplate } from "@shared/schema";
import type { CreateReportTemplateInput, UpdateReportTemplateInput } from "@shared/report-template-schemas";
import { getOrgRole, isMeasurementWriterRole } from "../permissions/measurement-helpers";
import { getPgErrorCode, PG_UNIQUE_VIOLATION } from "../lib/pg-error";
import type { SessionUser } from "../utils/auth-helpers";

/** A 409: another template of the organization already has this name. */
export class TemplateConflictError extends Error {
  constructor() {
    super("A report template with this name already exists");
  }
}

/** Coach / org_admin of THIS organization, or a site admin. */
export async function isOrgWriter(user: SessionUser, organizationId: string): Promise<boolean> {
  return isMeasurementWriterRole(await getOrgRole(user, organizationId));
}

export async function organizationExists(organizationId: string): Promise<boolean> {
  const [row] = await db.select({ id: organizations.id }).from(organizations).where(eq(organizations.id, organizationId));
  return !!row;
}

export async function listTemplates(organizationId: string): Promise<ReportTemplate[]> {
  return db.select().from(reportTemplates).where(eq(reportTemplates.organizationId, organizationId)).orderBy(asc(reportTemplates.name));
}

/** The template if the user writes in the template's own organization, else null. */
export async function getWritableTemplate(user: SessionUser, id: string): Promise<ReportTemplate | null> {
  const [row] = await db.select().from(reportTemplates).where(eq(reportTemplates.id, id));
  return row && (await isOrgWriter(user, row.organizationId)) ? row : null;
}

async function writing<T>(op: () => Promise<T>): Promise<T> {
  try {
    return await op();
  } catch (e) {
    if (getPgErrorCode(e) === PG_UNIQUE_VIOLATION) throw new TemplateConflictError();
    throw e;
  }
}

export async function createTemplate(organizationId: string, userId: string, input: CreateReportTemplateInput): Promise<ReportTemplate> {
  const [row] = await writing(() => db.insert(reportTemplates).values({ ...input, organizationId, createdBy: userId }).returning());
  return row;
}

export async function updateTemplate(id: string, input: UpdateReportTemplateInput): Promise<ReportTemplate | null> {
  const [row] = await writing(() => db.update(reportTemplates).set({ ...input, updatedAt: new Date() }).where(eq(reportTemplates.id, id)).returning());
  return row ?? null;
}

export async function deleteTemplate(id: string): Promise<void> {
  await db.delete(reportTemplates).where(eq(reportTemplates.id, id));
}
