import { EVAL_METRIC_CODES } from "./metric-key-map";

/**
 * Template metrics store LOGICAL keys so a code rename only changes this map. The report's protocol-aware
 * map (EVAL_METRIC_CODES) is extended with the battery-only keys. Template-only keys are never spelled like
 * the code they resolve to. A key outside the map is a literal site_metrics code (a coach-saved custom code).
 */
export const TEMPLATE_METRIC_CODES: Readonly<Record<string, string>> = {
  ...EVAL_METRIC_CODES,
  BODY_HEIGHT: "HEIGHT",
  BODY_WEIGHT: "WEIGHT",
  HANDS_FREE_JUMP: "VERTICAL_JUMP",
  RSI_LEFT: "RSI_L",
  RSI_RIGHT: "RSI_R",
  STRENGTH_SQUAT: "SQUAT_1RM",
  STRENGTH_BENCH: "BENCH_1RM",
  STRENGTH_DEADLIFT: "DEADLIFT_1RM",
  STRENGTH_OHP: "OHP_1RM",
  PATTERN_LIN_ACCEL: "MQ_LIN_ACCEL",
  PATTERN_MAX_VELO: "MQ_MAX_VELO",
  PATTERN_DECEL: "MQ_DECEL",
  PATTERN_SHUFFLE: "MQ_SHUFFLE",
  PATTERN_LATRUN: "MQ_LATRUN",
  PATTERN_HIPTURN: "MQ_HIPTURN",
  PATTERN_BACKPEDAL: "MQ_BACKPEDAL",
  PATTERN_JUMP: "MQ_JUMP",
  TRANSITION_DECEL_CUT: "MQ_TRANS_DECEL_CUT",
  TRANSITION_GAS_BRAKE: "MQ_TRANS_GAS_BRAKE",
  TRANSITION_BACKPEDAL_TURN: "MQ_TRANS_BACKPEDAL_TURN",
  TRANSITION_LAT_LINEAR: "MQ_TRANS_LAT_LINEAR",
};

export function isLogicalKey(key: string): boolean {
  return Object.prototype.hasOwnProperty.call(TEMPLATE_METRIC_CODES, key);
}

export function resolveTemplateKey(key: string): string {
  return isLogicalKey(key) ? TEMPLATE_METRIC_CODES[key] : key;
}

const KEY_BY_CODE = new Map<string, string>(Object.entries(TEMPLATE_METRIC_CODES).map(([key, code]) => [code, key]));

/** Reverse of resolveTemplateKey, used when saving an event's metric set as a template. */
export function keyForCode(code: string): string {
  const key = KEY_BY_CODE.get(code);
  if (key) return key;
  if (isLogicalKey(code)) throw new Error(`Metric code '${code}' collides with a logical template key of the same name`);
  return code;
}
