import { MQI_PATTERNS } from "@shared/mqi-entry-schema";

/**
 * AM-FEAT-024: Movement (MQI) is required in the two global presets. "Required" means the coach cannot remove the
 * MQI metrics from an event that applied one of them; an athlete may still be "Not tested".
 * Presets are identified by eval_battery_templates.preset_key (set by migration 0180), never by the live name, so
 * renaming or recreating a template neither removes nor inherits the lock.
 */
export const MQI_REQUIRED_PRESET_KEYS: readonly string[] = ["foundation", "performance"];

const MQI_CODES: ReadonlySet<string> = new Set([...MQI_PATTERNS.map((p) => p.code), "MQI_TOTAL"]);

/** The 8 pattern scores and the derived total. The optional MQ_TRANS_* scores are not part of MQI and stay removable. */
export function isMqiMetricCode(code: string): boolean {
  return MQI_CODES.has(code);
}

export function isMqiRequiredPreset(template: { presetKey?: string | null }): boolean {
  return !!template.presetKey && MQI_REQUIRED_PRESET_KEYS.includes(template.presetKey);
}
