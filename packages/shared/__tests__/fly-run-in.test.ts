import { describe, it, expect } from 'vitest';
import {
  FLY10_RUN_IN_YD,
  assertFlyInDistanceMatches,
  assertFlyInDistanceOnUpdate,
  parseFlyInInput,
  formatFlyInDistance,
} from '../fly-run-in';
import { MeasurementValueValidationError } from '../measurement-value-validation';

describe('FLY10_RUN_IN_YD', () => {
  it('maps the five fly codes to their run-in in yards', () => {
    expect(FLY10_RUN_IN_YD).toEqual({
      FLY10_TIME_RI5: 5,
      FLY10_TIME_RI10: 10,
      FLY10_TIME_RI15: 15,
      FLY10_TIME: 20,
      FLY10_TIME_RI30: 30,
    });
  });
});

describe('assertFlyInDistanceMatches', () => {
  it.each([null, undefined])('accepts %s on a fly code', (v) => {
    expect(() => assertFlyInDistanceMatches('FLY10_TIME_RI10', v)).not.toThrow();
  });

  it.each([
    ['FLY10_TIME_RI10', 10],
    ['FLY10_TIME_RI10', '10'],
    ['FLY10_TIME_RI10', '10.000000'],
    ['FLY10_TIME', 20],
  ])('accepts %s with %s', (metric, v) => {
    expect(() => assertFlyInDistanceMatches(metric, v)).not.toThrow();
  });

  it('rejects a mismatch with a field-level error', () => {
    try {
      assertFlyInDistanceMatches('FLY10_TIME', 10);
      throw new Error('should have thrown');
    } catch (e) {
      expect(e).toBeInstanceOf(MeasurementValueValidationError);
      expect((e as MeasurementValueValidationError).field).toBe('flyInDistance');
      expect((e as Error).message).toMatch(/20/);
    }
  });

  it('compares numerically (7.5 is not 7)', () => {
    expect(() => assertFlyInDistanceMatches('FLY10_TIME_RI5', 7.5)).toThrow(MeasurementValueValidationError);
    expect(() => assertFlyInDistanceMatches('FLY10_TIME_RI5', '5.0')).not.toThrow();
  });

  it('treats an unparseable value as a mismatch', () => {
    expect(() => assertFlyInDistanceMatches('FLY10_TIME', 'abc')).toThrow(MeasurementValueValidationError);
  });

  it.each(['20abc', '20.4', NaN, Infinity, '1e1x', ' x '])('rejects garbage/non-finite %s on a fly code', (v) => {
    expect(() => assertFlyInDistanceMatches('FLY10_TIME', v as any)).toThrow(MeasurementValueValidationError);
  });

  it('never checks non-fly codes, including FLY10M_TIME', () => {
    expect(() => assertFlyInDistanceMatches('FLY10M_TIME', 10)).not.toThrow();
    expect(() => assertFlyInDistanceMatches('VERTICAL_JUMP', 99)).not.toThrow();
  });
});

describe('assertFlyInDistanceOnUpdate', () => {
  const legacy = { metric: 'FLY10_TIME', flyInDistance: '10.000000' };

  it('lets a value-only edit of a legacy row (stored 10 on FLY10_TIME) through', () => {
    expect(() => assertFlyInDistanceOnUpdate(legacy, {})).not.toThrow();
  });

  it('lets an unchanged flyInDistance through', () => {
    expect(() => assertFlyInDistanceOnUpdate(legacy, { flyInDistance: 10 })).not.toThrow();
  });

  it('rejects a changed, mismatching flyInDistance', () => {
    expect(() => assertFlyInDistanceOnUpdate(legacy, { flyInDistance: 15 })).toThrow(MeasurementValueValidationError);
  });

  it('accepts a matching changed flyInDistance and clearing to null', () => {
    expect(() => assertFlyInDistanceOnUpdate(legacy, { flyInDistance: 20 })).not.toThrow();
    expect(() => assertFlyInDistanceOnUpdate(legacy, { flyInDistance: null })).not.toThrow();
  });

  it('rejects changing the metric to one whose run-in disagrees with the stored value', () => {
    expect(() => assertFlyInDistanceOnUpdate(legacy, { metric: 'FLY10_TIME_RI5' })).toThrow(MeasurementValueValidationError);
  });

  it('accepts changing the metric when the stored value agrees or is null', () => {
    expect(() => assertFlyInDistanceOnUpdate(legacy, { metric: 'FLY10_TIME_RI10' })).not.toThrow();
    expect(() => assertFlyInDistanceOnUpdate({ metric: 'VERTICAL_JUMP', flyInDistance: null }, { metric: 'FLY10_TIME_RI5' })).not.toThrow();
  });

  it('does not reject an unchanged metric sent alongside an unchanged legacy value', () => {
    expect(() => assertFlyInDistanceOnUpdate(legacy, { metric: 'FLY10_TIME', flyInDistance: '10' })).not.toThrow();
  });
});

describe('parseFlyInInput (route input -> value for the checker)', () => {
  it.each(['', '   ', null, undefined])('treats blank %j as not supplied', (v) => {
    expect(parseFlyInInput('FLY10_TIME', v as any)).toBeUndefined();
  });

  it('parses numbers and numeric strings without truncating', () => {
    expect(parseFlyInInput('FLY10_TIME', '20')).toBe(20);
    expect(parseFlyInInput('FLY10_TIME', 20)).toBe(20);
    expect(parseFlyInInput('FLY10_TIME', '20.4')).toBe(20.4);
  });

  it('yields NaN for garbage on a fly code so the checker rejects it', () => {
    const v = parseFlyInInput('FLY10_TIME', '20abc');
    expect(Number.isNaN(v)).toBe(true);
    expect(() => assertFlyInDistanceMatches('FLY10_TIME', v)).toThrow(MeasurementValueValidationError);
    expect(() => assertFlyInDistanceMatches('FLY10_TIME', parseFlyInInput('FLY10_TIME', '20.4'))).toThrow();
  });

  it('drops garbage on non-fly codes (never stores NaN)', () => {
    expect(parseFlyInInput('VERTICAL_JUMP', '20abc')).toBeUndefined();
    expect(parseFlyInInput('FLY10M_TIME', 'x')).toBeUndefined();
  });
});

describe('formatFlyInDistance (display)', () => {
  it('shows the code run-in for fly codes, ignoring a stale stored value', () => {
    expect(formatFlyInDistance('FLY10_TIME', '10.000')).toBe('20yd');
    expect(formatFlyInDistance('FLY10_TIME_RI15', null)).toBe('15yd');
  });

  it('shows the stored value for other codes, or a dash when absent', () => {
    expect(formatFlyInDistance('FLY10M_TIME', '10')).toBe('10yd');
    expect(formatFlyInDistance('VERTICAL_JUMP', null)).toBe('-');
    expect(formatFlyInDistance('VERTICAL_JUMP', '')).toBe('-');
  });
});
