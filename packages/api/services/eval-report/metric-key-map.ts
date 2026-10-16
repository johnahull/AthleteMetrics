/**
 * Logical eval-report keys -> protocol-aware metric codes (AM-FEAT-019). Sprints are yard splits; the 5-0-5
 * is the meter protocol for every organization (AM-FEAT-016 Revision 2026-10-13), and the COD deficit is the
 * meter 5-0-5 minus a 10 m time interpolated from the 10 and 20 yd splits. No 5-0-5 key maps to a yard code.
 * Saved selections and templates store the logical keys, so a code rename only changes this map.
 */
export const EVAL_METRIC_CODES = {
  DASH_10: "DASH_10YD",
  DASH_20: "DASH_20YD",
  DASH_30: "DASH_30YD",
  DASH_40: "DASH_40YD",
  FLY_10: "FLY10_TIME",
  CMJ_HOH: "JUMP_CMJ_HOH",
  SQUAT_JUMP: "JUMP_SJ_HEIGHT",
  EUR: "POWER_EUR",
  RSI_BILATERAL: "RSI_105",
  CMJ_SL_LEFT: "JUMP_CMJ_SL_L",
  CMJ_SL_RIGHT: "JUMP_CMJ_SL_R",
  CMJ_SL_ASYM: "JUMP_CMJ_SL_ASYM",
  "505": "AGILITY_505_M",
  "505_LEFT": "AGILITY_505_M_L",
  "505_RIGHT": "AGILITY_505_M_R",
  "505_LSI": "AGILITY_505_M_LSI",
  COD_DEFICIT: "AGILITY_COD_DEFICIT_M_INTERP",
  T_TEST: "T_TEST",
  MOMENTUM: "MOMENTUM",
  MQI: "MQI_TOTAL",
} as const;

export type EvalMetricKey = keyof typeof EVAL_METRIC_CODES;

export function metricCode(key: EvalMetricKey): string {
  return EVAL_METRIC_CODES[key];
}
