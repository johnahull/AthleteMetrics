import { describe, it, expect } from 'vitest';
import { resolveTemplateKey, keyForCode, isLogicalKey, TEMPLATE_METRIC_CODES } from '../template-keys';

describe('template key resolution', () => {
  it('resolves a logical key through the protocol-aware map', () => {
    expect(resolveTemplateKey('505')).toBe('AGILITY_505_YD');
    expect(resolveTemplateKey('FLY_10')).toBe('FLY10_TIME');
    expect(resolveTemplateKey('505_LEFT')).toBe('AGILITY_505_YD_L');
  });
  it('resolves the template-only logical keys', () => {
    expect(resolveTemplateKey('BODY_HEIGHT')).toBe('HEIGHT_IN');
    expect(resolveTemplateKey('BODY_WEIGHT')).toBe('WEIGHT_LBS');
    expect(resolveTemplateKey('HANDS_FREE_JUMP')).toBe('VERTICAL_JUMP');
    expect(resolveTemplateKey('PATTERN_LIN_ACCEL')).toBe('MQ_LIN_ACCEL');
    expect(resolveTemplateKey('TRANSITION_LAT_LINEAR')).toBe('MQ_TRANS_LAT_LINEAR');
    expect(resolveTemplateKey('STRENGTH_SQUAT')).toBe('SQUAT_1RM');
    expect(resolveTemplateKey('RSI_LEFT')).toBe('RSI_L');
  });
  it('passes an unknown key through as a literal code (coach-saved custom codes)', () => {
    expect(resolveTemplateKey('CUSTOM_ORG_METRIC')).toBe('CUSTOM_ORG_METRIC');
    expect(isLogicalKey('CUSTOM_ORG_METRIC')).toBe(false);
    expect(isLogicalKey('FLY_10')).toBe(true);
  });
  it('every template-only logical key is visibly distinct from the code it resolves to', () => {
    for (const [key, code] of Object.entries(TEMPLATE_METRIC_CODES)) {
      if (key === 'MOMENTUM' || key === 'T_TEST') continue; // P1 keys that predate this rule
      expect(key, key).not.toBe(code);
    }
  });
  it('keyForCode is the reverse: mapped codes give the logical key, others stay literal', () => {
    expect(keyForCode('AGILITY_505_YD')).toBe('505');
    expect(keyForCode('MQ_LIN_ACCEL')).toBe('PATTERN_LIN_ACCEL');
    expect(keyForCode('SOMETHING_ELSE')).toBe('SOMETHING_ELSE');
  });
  it('keyForCode rejects a literal code that collides with a logical key name', () => {
    expect(() => keyForCode('DASH_10')).toThrow(/collides/);
  });
});
