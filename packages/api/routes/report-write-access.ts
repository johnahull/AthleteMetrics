/**
 * Who may share, snapshot or bulk-change a report: a writer (coach / org_admin / site admin) in the report's OWN
 * organization. requireRole('coach') only sees the session's primary organization, and validateOrganizationAccess
 * only checks membership, so neither alone stops an athlete (or a coach of some other organization).
 */
import { getOrgRole, isMeasurementWriterRole } from "../permissions/measurement-helpers";

type Viewer = Parameters<typeof getOrgRole>[0];

export async function isOrgWriter(user: Viewer, organizationId: string): Promise<boolean> {
  return isMeasurementWriterRole(await getOrgRole(user, organizationId));
}
