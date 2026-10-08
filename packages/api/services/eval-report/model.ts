import type { MqiBandLabel } from "@shared/mqi-band";
import type { BalanceLine } from "./balance";
import type { EvalMetricKey } from "./metric-key-map";
import type { RetestTrend } from "./retest";
import type { AgeGroupMatch, AverageComparison } from "./tier-match";

/**
 * The pure eval report model (AM-FEAT-019). A renderer draws it; nothing here reads the database.
 * It carries no pre-test survey data of any kind: those answers are private to the athlete and coach
 * (model-guard.ts fails the type check if such a field is ever added).
 */
export type EvalPreset = "middle_school" | "high_school" | "senior";

export type LoadLevel = "light" | "medium" | "heavy";

export interface EvalSelection {
  preset: EvalPreset;
  metricKeys: EvalMetricKey[];
  collegeGauge: boolean;
  headline: boolean;
  freshAndHealthy: boolean;
  coachNote: boolean;
  strengths: boolean;
  retestTrend: boolean;
}

export interface EvalMetricResult {
  key: EvalMetricKey;
  code: string;
  label: string;
  value: number;
  unit: string;
  /** Age-group comparison; null = no set for this athlete: show value and unit with no gauge */
  comparison: AgeGroupMatch | null;
  /** D1 Average comparison; null when there is no D1 row for the athlete's sex and sport */
  collegeStandard: AverageComparison | null;
  /** Per-metric college gauge switch; the report-wide switch is selection.collegeGauge */
  collegeGauge: boolean;
  trend: RetestTrend | null;
}

export interface EvalReportModel {
  athlete: {
    name: string;
    /** Age at the event date, not today */
    age: number | null;
    graduationYear: number | null;
    sport: string | null;
    team: string | null;
  };
  /** Event calendar date, YYYY-MM-DD */
  eventDate: string;
  metrics: EvalMetricResult[];
  freshAndHealthy: {
    load?: LoadLevel;
    balance?: BalanceLine;
    movement?: MqiBandLabel;
  };
  strengths: EvalMetricKey[];
  developmentAreas: EvalMetricKey[];
  limiter: EvalMetricKey | null;
  coachNote: string | null;
  selection: EvalSelection;
}
