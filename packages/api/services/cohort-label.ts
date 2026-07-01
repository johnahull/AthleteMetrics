// packages/api/services/cohort-label.ts

/**
 * Build a human-readable label for the peer cohort an individual report compares
 * against, from the report's filters. Used by the "Where You Stand" caption so a
 * viewer knows who "the group" is (e.g. "Varsity (Male, WR)").
 *
 * Returns undefined when no filter narrows the cohort (org-wide) — callers then
 * fall back to a generic phrase like "your group".
 */
export function buildCohortLabel(
  teamNames: string[],
  gender?: string,
  positions?: string[],
): string | undefined {
  const teamPart = teamNames.filter(Boolean).join(', ');
  const demoPart = [gender, ...(positions ?? [])].filter(Boolean).join(', ');

  if (!teamPart && !demoPart) return undefined;
  if (teamPart && demoPart) return `${teamPart} (${demoPart})`;
  return teamPart || demoPart;
}
