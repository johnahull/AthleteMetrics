import { EVAL_REPORT_TYPE } from "@shared/eval-report-config";
import { getOrgRole, isMeasurementWriterRole } from "../permissions/measurement-helpers";

type EvalAccessUser = { id: string; isSiteAdmin?: boolean; role?: string };
/** organizationId is nullable in the type so a missing org fails closed instead of reaching getOrgRole. */
type EvalAccessRow = { reportType: string; organizationId: string | null };

/**
 * AM-FEAT-019: eval reports hold one athlete's frozen model, coach note and age. Org membership is not enough:
 * the caller must be coach / org_admin / site admin in the REPORT's own organization (never the session role).
 * Every other report type passes here and keeps its existing membership check. An eval row without an
 * organization is never accessible (fail closed).
 */
export async function canAccessEvalRow(user: EvalAccessUser, report: EvalAccessRow): Promise<boolean> {
  if (report.reportType !== EVAL_REPORT_TYPE) return true;
  if (report.organizationId === null) return false;
  return isMeasurementWriterRole(await getOrgRole(user, report.organizationId));
}

/** True when any of these rows is an eval the caller may not see or change (a null-organization eval counts as inaccessible). */
export async function hasInaccessibleEval(user: EvalAccessUser, rows: EvalAccessRow[]): Promise<boolean> {
  const evalRows = rows.filter((r) => r.reportType === EVAL_REPORT_TYPE);
  if (evalRows.some((r) => r.organizationId === null)) return true;
  // One role lookup per distinct organization (not per row)
  const orgIds = [...new Set(evalRows.map((r) => r.organizationId as string))];
  const roles = await Promise.all(orgIds.map((orgId) => getOrgRole(user, orgId)));
  return roles.some((role) => !isMeasurementWriterRole(role));
}
