// packages/api/services/report-fv.ts
import type { SprintFvProfile } from '@shared/schema';
import type { ReportFvProfile } from '@shared/report-fv-types';

/**
 * Most recent profile whose session date falls inside [startDate, endDate]
 * (inclusive, YYYY-MM-DD strings). Pure: no DB access. Stable on ties so the
 * caller's ordering (query is date-desc) decides between same-day profiles.
 */
export function pickLatestInWindow<T extends { date: string }>(
  profiles: T[],
  startDate: string,
  endDate: string,
): T | undefined {
  let latest: T | undefined;
  for (const profile of profiles) {
    if (profile.date < startDate || profile.date > endDate) continue;
    if (!latest || profile.date > latest.date) latest = profile;
  }
  return latest;
}

/**
 * Slim a stored sprint F-V profile row down to the report payload: the fitted
 * KPIs and analysis narrative, without split times, residuals, or provenance
 * ids (the payload is frozen verbatim into public report snapshots).
 */
export function toReportFvProfile(row: SprintFvProfile): ReportFvProfile {
  return {
    profileId: row.id,
    date: row.date,
    distanceUnit: row.distanceUnit,
    f0Rel: row.f0Rel,
    v0: row.v0,
    pmaxRel: row.pmaxRel,
    fvSlope: row.fvSlope,
    fitR2: row.fitR2,
    analysisJson: row.analysisJson,
  };
}
