import { describe, it, expect } from 'vitest';
import {
  resolveSplitsFromMeasurements,
  SprintFvValidationError,
  SPLIT_METRICS_YARDS,
  SPLIT_METRICS_METERS,
  type SplitMeasurementInput,
} from '../sprint-fv-service';
import { MetricType, VALID_METRICS } from '@shared/schema/constants';

/**
 * Unit tests for the pure split-resolution logic used by SprintFvService.
 *
 * The service separates the DB-free algorithm (choose a unit, pick the fastest
 * time per distance, detect mixed units) from the drizzle query that supplies
 * measurement rows — these tests exercise the algorithm in isolation.
 */

function mk(id: string, metric: string, value: string | number): SplitMeasurementInput {
  return { id, metric, value: String(value) };
}

describe('resolveSplitsFromMeasurements', () => {
  describe('yards (new 10/20/30/40 protocol)', () => {
    it('resolves a full yards session to the yards unit and 4 splits', () => {
      const rows = [
        mk('a', 'DASH_10YD', 1.70),
        mk('b', 'DASH_20YD', 2.95),
        mk('c', 'DASH_30YD', 4.18),
        mk('d', 'DASH_40YD', 5.30),
      ];

      const result = resolveSplitsFromMeasurements(rows);

      expect(result.distanceUnit).toBe('yards');
      expect(result.splitTimes).toEqual({ '10': 1.70, '20': 2.95, '30': 4.18, '40': 5.30 });
      expect(result.usedMeasurementIds).toEqual({ '10': 'a', '20': 'b', '30': 'c', '40': 'd' });
    });

    it('accepts 3 of 4 splits (minimum protocol)', () => {
      const rows = [
        mk('a', 'DASH_10YD', 1.70),
        mk('c', 'DASH_30YD', 4.18),
        mk('d', 'DASH_40YD', 5.30),
      ];

      const result = resolveSplitsFromMeasurements(rows);

      expect(result.distanceUnit).toBe('yards');
      expect(Object.keys(result.splitTimes)).toHaveLength(3);
    });

    it('picks the fastest time when a distance has duplicate trials', () => {
      const rows = [
        mk('a', 'DASH_10YD', 1.85),
        mk('a2', 'DASH_10YD', 1.70), // fastest
        mk('b', 'DASH_20YD', 2.95),
        mk('c', 'DASH_30YD', 4.18),
        mk('d', 'DASH_40YD', 5.30),
      ];

      const result = resolveSplitsFromMeasurements(rows);

      expect(result.splitTimes['10']).toBe(1.70);
      expect(result.usedMeasurementIds['10']).toBe('a2');
    });
  });

  describe('meters (new DASH_*M metric types)', () => {
    it('resolves a full meters session to the meters unit', () => {
      const rows = [
        mk('a', 'DASH_10M', 1.85),
        mk('b', 'DASH_20M', 3.20),
        mk('c', 'DASH_30M', 4.55),
        mk('d', 'DASH_40M', 5.80),
      ];

      const result = resolveSplitsFromMeasurements(rows);

      expect(result.distanceUnit).toBe('meters');
      expect(result.splitTimes).toEqual({ '10': 1.85, '20': 3.20, '30': 4.55, '40': 5.80 });
    });
  });

  describe('mixed units (error)', () => {
    it('throws SprintFvValidationError when both yards and meters have enough splits', () => {
      const rows = [
        // Three yards splits
        mk('y1', 'DASH_10YD', 1.70),
        mk('y2', 'DASH_20YD', 2.95),
        mk('y3', 'DASH_30YD', 4.18),
        // Three meters splits
        mk('m1', 'DASH_10M', 1.85),
        mk('m2', 'DASH_20M', 3.20),
        mk('m3', 'DASH_30M', 4.55),
      ];

      expect(() => resolveSplitsFromMeasurements(rows)).toThrow(SprintFvValidationError);
      expect(() => resolveSplitsFromMeasurements(rows)).toThrow(/mixed/i);
    });

    it('prefers the yards unit when meters has <3 splits', () => {
      const rows = [
        mk('y1', 'DASH_10YD', 1.70),
        mk('y2', 'DASH_20YD', 2.95),
        mk('y3', 'DASH_30YD', 4.18),
        mk('m1', 'DASH_10M', 1.85), // stray meters measurement
      ];

      const result = resolveSplitsFromMeasurements(rows);
      expect(result.distanceUnit).toBe('yards');
      expect(Object.keys(result.splitTimes)).toEqual(['10', '20', '30']);
    });
  });

  describe('insufficient data', () => {
    it('throws when neither unit has 3 splits', () => {
      const rows = [
        mk('y1', 'DASH_10YD', 1.70),
        mk('y2', 'DASH_20YD', 2.95),
      ];

      expect(() => resolveSplitsFromMeasurements(rows)).toThrow(SprintFvValidationError);
      expect(() => resolveSplitsFromMeasurements(rows)).toThrow(/at least 3/i);
    });

    it('ignores non-finite / non-positive times when counting', () => {
      const rows = [
        mk('a', 'DASH_10YD', 1.70),
        mk('b', 'DASH_20YD', 0), // invalid
        mk('c', 'DASH_30YD', 4.18),
        mk('d', 'DASH_40YD', 'not-a-number'),
      ];

      expect(() => resolveSplitsFromMeasurements(rows)).toThrow(/at least 3/i);
    });
  });

  describe('metric-code tables', () => {
    it('exports a yards-only split metric map for the 10/20/30/40 protocol', () => {
      expect(SPLIT_METRICS_YARDS).toEqual({
        DASH_10YD: 10,
        DASH_20YD: 20,
        DASH_30YD: 30,
        DASH_40YD: 40,
      });
    });

    it('exports a meters-only split metric map for the 10/20/30/40 protocol', () => {
      expect(SPLIT_METRICS_METERS).toEqual({
        DASH_10M: 10,
        DASH_20M: 20,
        DASH_30M: 30,
        DASH_40M: 40,
      });
    });
  });

  describe('MetricType / VALID_METRICS cohesion with split-code maps', () => {
    it('registers every yards split distance in MetricType', () => {
      for (const code of Object.keys(SPLIT_METRICS_YARDS)) {
        expect((MetricType as Record<string, string>)[code]).toBe(code);
      }
    });

    it('registers every meters split distance in MetricType', () => {
      for (const code of Object.keys(SPLIT_METRICS_METERS)) {
        expect((MetricType as Record<string, string>)[code]).toBe(code);
      }
    });

    it('includes FLY10_TIME and FLY10M_TIME in MetricType', () => {
      expect((MetricType as Record<string, string>).FLY10_TIME).toBe('FLY10_TIME');
      expect((MetricType as Record<string, string>).FLY10M_TIME).toBe('FLY10M_TIME');
    });

    it('lists every split metric in VALID_METRICS as lower_is_better', () => {
      const validKeys = new Map(VALID_METRICS.map(m => [m.key, m.metricType]));
      for (const code of [...Object.keys(SPLIT_METRICS_YARDS), ...Object.keys(SPLIT_METRICS_METERS)]) {
        expect(validKeys.get(code)).toBe('lower_is_better');
      }
      expect(validKeys.get('FLY10M_TIME')).toBe('lower_is_better');
    });
  });
});
