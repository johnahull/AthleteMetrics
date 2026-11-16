/**
 * coachNotes is coach-authored context about a child: only writers (coach / org_admin / site admin) of the
 * report row's own organization may read it. Every route that returns a reports row goes through here.
 */
import { storage } from "../storage";
import { getOrgRole, isMeasurementWriterRole } from "../permissions/measurement-helpers";
import { isSiteAdmin } from "../permissions/helpers";

type Viewer = Parameters<typeof getOrgRole>[0];

export function omitCoachNotes<T extends { coachNotes?: unknown }>(report: T): Omit<T, 'coachNotes'> {
  const { coachNotes: _omitted, ...rest } = report;
  return rest;
}

/** The organizations (among orgIds) where the viewer is a writer. Memberships are loaded once; same rules as getOrgRole. */
export async function writerOrgIds(user: Viewer, orgIds: string[]): Promise<Set<string>> {
  const unique = [...new Set(orgIds)];
  if (unique.length === 0) return new Set();
  if (isSiteAdmin(user)) return new Set(unique);
  const memberships = (await storage.getUserOrganizations(user.id)) ?? [];
  return new Set(
    unique.filter((id) => isMeasurementWriterRole(memberships.find((m) => m.organizationId === id)?.role)),
  );
}

/** Strip coachNotes from every row whose organization the viewer does not write in. */
export async function stripCoachNotesForViewer<T extends { organizationId: string; coachNotes?: unknown }>(
  user: Viewer,
  rows: T[],
): Promise<Array<T | Omit<T, 'coachNotes'>>> {
  const writers = await writerOrgIds(user, rows.map((r) => r.organizationId));
  return rows.map((r) => (writers.has(r.organizationId) ? r : omitCoachNotes(r)));
}

export async function forViewer<T extends { organizationId: string; coachNotes?: unknown }>(user: Viewer, report: T) {
  return (await stripCoachNotesForViewer(user, [report]))[0];
}
