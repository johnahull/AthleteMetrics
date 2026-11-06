import { describe, it, expect } from 'vitest';
import { isMqiMetricCode, isMqiRequiredPreset, MQI_REQUIRED_PRESET_KEYS } from '../mqi-required';

describe('MQI required in the Foundation and Performance presets (AM-FEAT-024)', () => {
  it('locks the eight pattern scores and the total, not the optional transition scores', () => {
    for (const code of ['MQ_LIN_ACCEL', 'MQ_MAX_VELO', 'MQ_DECEL', 'MQ_SHUFFLE', 'MQ_LATRUN', 'MQ_HIPTURN', 'MQ_BACKPEDAL', 'MQ_JUMP', 'MQI_TOTAL']) {
      expect(isMqiMetricCode(code), code).toBe(true);
    }
    for (const code of ['MQ_TRANS_DECEL_CUT', 'MQ_TRANSITION_TOTAL', 'DASH_10YD', 'JUMP_BROAD']) {
      expect(isMqiMetricCode(code), code).toBe(false);
    }
  });

  it('identifies the presets by their stable key, never by the live name', () => {
    expect([...MQI_REQUIRED_PRESET_KEYS].sort()).toEqual(['foundation', 'performance']);
    expect(isMqiRequiredPreset({ presetKey: 'foundation' })).toBe(true);
    expect(isMqiRequiredPreset({ presetKey: 'performance' })).toBe(true);
  });

  it('a template without a preset key is not a preset, whatever it is called', () => {
    expect(isMqiRequiredPreset({ presetKey: null })).toBe(false);
    expect(isMqiRequiredPreset({ presetKey: 'something-else' })).toBe(false);
    expect(isMqiRequiredPreset({ presetKey: undefined })).toBe(false);
  });
});
