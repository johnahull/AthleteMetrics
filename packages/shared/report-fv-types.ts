// packages/shared/report-fv-types.ts
import type { SprintFvAnalysisJson } from './schema/tables/sprint-fv-profiles';

/**
 * Compact sprint Force-Velocity payload embedded in an individual report when
 * the fvProfile chart is selected (and the sprint-FV feature flag is on).
 * Frozen verbatim into public report snapshots, so it stays deliberately slim:
 * no split times, fit residuals, or provenance ids from the full DB row.
 * Decimal columns keep their string serialization, matching how the web
 * sprint-fv components already consume profiles.
 */
export interface ReportFvProfile {
  profileId: string;
  date: string;              // session date, YYYY-MM-DD (inside the report window)
  distanceUnit: string;      // 'yards' | 'meters'
  f0Rel: string | null;      // relative theoretical max force (N/kg), decimal string
  v0: string | null;         // theoretical max velocity (m/s), decimal string
  pmaxRel: string | null;    // relative max power (W/kg), decimal string
  fvSlope: string | null;    // F-V slope, decimal string
  fitR2: string | null;      // model fit R², decimal string
  analysisJson: SprintFvAnalysisJson | null; // classification + optimal gap etc.
}
