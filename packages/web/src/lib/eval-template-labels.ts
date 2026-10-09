/**
 * Plain labels for eval battery template keys, and the wording of the "apply template" result (AM-FEAT-019 P5).
 * The keys are the API's logical keys (packages/api/services/eval-report/template-keys.ts).
 */
import type { ApplyEvalTemplateResult, EvalTemplateMetric } from "@/hooks/use-eval-report";

export const TEMPLATE_KEY_LABELS: Record<string, string> = {
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
  BODY_HEIGHT: "Height",
  BODY_WEIGHT: "Weight",
  HANDS_FREE_JUMP: "Hands-free jump height",
  RSI_LEFT: "Single-leg reactive strength (left)",
  RSI_RIGHT: "Single-leg reactive strength (right)",
  STRENGTH_SQUAT: "Squat strength",
  STRENGTH_BENCH: "Bench strength",
  STRENGTH_DEADLIFT: "Deadlift strength",
  STRENGTH_OHP: "Overhead press strength",
  PATTERN_LIN_ACCEL: "Movement: linear acceleration",
  PATTERN_MAX_VELO: "Movement: max velocity",
  PATTERN_DECEL: "Movement: deceleration",
  PATTERN_SHUFFLE: "Movement: lateral shuffle",
  PATTERN_LATRUN: "Movement: lateral run",
  PATTERN_HIPTURN: "Movement: hip turn",
  PATTERN_BACKPEDAL: "Movement: backpedal",
  PATTERN_JUMP: "Movement: jump",
  TRANSITION_DECEL_CUT: "Transition: decel to lateral cut",
  TRANSITION_GAS_BRAKE: "Transition: gas and brake",
  TRANSITION_BACKPEDAL_TURN: "Transition: backpedal, hip turn, sprint",
  TRANSITION_LAT_LINEAR: "Transition: lateral to linear",
};

/** The two single-leg jump sides: a template allows one of them per event (the API answers 400 for both) */
export const SINGLE_LEG_CMJ_KEYS = ["CMJ_SL_LEFT", "CMJ_SL_RIGHT"] as const;

function humanize(key: string): string {
  const words = key.toLowerCase().replace(/_/g, " ");
  return words.charAt(0).toUpperCase() + words.slice(1);
}

export function templateKeyLabel(key: string, customLabel?: string): string {
  return customLabel ?? TEMPLATE_KEY_LABELS[key] ?? humanize(key);
}

export function templateMetricLabel(metric: EvalTemplateMetric): string {
  return templateKeyLabel(metric.metricKey, metric.customLabel);
}

/** Toast wording for the result of applying a template to a new event */
export function describeTemplateResult(result: ApplyEvalTemplateResult): { title: string; description: string } {
  const added = result.added.length;
  const parts = [`${added} ${added === 1 ? "metric" : "metrics"} added`];
  if (result.alreadyPresent.length > 0) parts.push(`${result.alreadyPresent.length} already on the event`);
  let description = `${parts.join(", ")}.`;
  if (result.skipped.length > 0) {
    description += ` Not available yet: ${result.skipped.map((key) => templateKeyLabel(key)).join(", ")}.`;
  }
  return { title: "Template applied", description };
}

/** Toast title when the event was created but its template could not be applied */
export function templateFailureTitle(isDraft: boolean): string {
  return isDraft ? "Draft saved, template not applied" : "Event created, template not applied";
}
