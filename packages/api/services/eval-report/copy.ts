import { MQI_BANDS } from "@shared/mqi-band";
import type { EvalMetricKey } from "./metric-key-map";

/**
 * Template-generated family-facing text (AM-FEAT-019 Part 7): gender-neutral, no pricing, no injury or
 * medical wording. The coach's free-text note is not part of this and is never checked.
 */
export const METRIC_LABELS: Record<EvalMetricKey, string> = {
  DASH_10: "10-yard dash",
  DASH_20: "20-yard dash",
  DASH_30: "30-yard dash",
  DASH_40: "40-yard dash",
  FLY_10: "Fly 10",
  CMJ_HOH: "Jump height",
  SQUAT_JUMP: "Squat jump height",
  EUR: "Elastic use ratio",
  RSI_BILATERAL: "Reactive strength",
  CMJ_SL_LEFT: "Single-leg jump height (left)",
  CMJ_SL_RIGHT: "Single-leg jump height (right)",
  CMJ_SL_ASYM: "Single-leg jump difference",
  "505": "5-0-5 agility (faster leg)",
  "505_LEFT": "5-0-5 agility (left turn)",
  "505_RIGHT": "5-0-5 agility (right turn)",
  "505_LSI": "Left-right balance",
  COD_DEFICIT: "Change-of-direction cost",
  T_TEST: "T-test agility",
  MOMENTUM: "Momentum",
  MQI: "Movement",
};

/** Measured metrics outside the logical key map, offered as plain-labelled extras. */
export const OTHER_METRIC_LABELS: Record<string, string> = {
  VERTICAL_JUMP: "Hands-free jump height",
  JUMP_BROAD: "Broad jump",
  TOP_SPEED: "Top speed",
  TOP_SPEED_MPH: "Top speed",
  HEIGHT: "Height",
  WEIGHT: "Weight",
  WEIGHT_LBS: "Weight",
  AGILITY_5105: "5-10-5 agility",
  FLY10_TIME_RI5: "Fly 10 (5-yard run-in)",
  FLY10_TIME_RI10: "Fly 10 (10-yard run-in)",
  FLY10_TIME_RI15: "Fly 10 (15-yard run-in)",
  FLY10_TIME_RI30: "Fly 10 (30-yard run-in)",
};

export const SECTION_TITLES = {
  headline: "How your athlete compares for their age",
  collegeStandard: "College standard",
  freshAndHealthy: "Fresh & Healthy",
  coachNote: "What we saw",
  strengths: "Strengths",
  developmentAreas: "Areas to develop",
  retestTrend: "Since the last evaluation",
} as const;

export const FRESH_AND_HEALTHY_LABELS = {
  load: "Load",
  balance: "Balance",
  movement: "Movement",
} as const;

export const LOAD_LABELS = {
  light: "Light week",
  medium: "Medium week",
  heavy: "Heavy week",
} as const;

export const BALANCE_LABELS = {
  balanced: "Balanced",
  keep_an_eye: "Keep an eye on it",
  worth_working_on: "Worth working on",
  neutral: "Left-right balance",
} as const;

export const NO_TIER_NOTE = "An age-group comparison is not available for this measurement yet.";

export function metricLabel(key: EvalMetricKey): string {
  return METRIC_LABELS[key];
}

export function formatValue(value: number, unit: string): string {
  const text = String(Math.round(value * 100) / 100);
  return unit === "%" ? `${text}%` : `${text} ${unit}`;
}

/** Every template string, for the copy lint test. */
export function templateStrings(): string[] {
  return [
    ...Object.values(METRIC_LABELS),
    ...Object.values(OTHER_METRIC_LABELS),
    ...Object.values(SECTION_TITLES),
    ...Object.values(FRESH_AND_HEALTHY_LABELS),
    ...Object.values(LOAD_LABELS),
    ...Object.values(BALANCE_LABELS),
    ...MQI_BANDS.map((band) => band.label),
    NO_TIER_NOTE,
  ];
}
