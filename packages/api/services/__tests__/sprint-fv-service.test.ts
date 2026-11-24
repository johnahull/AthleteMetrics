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

  describe('device runs (calculationMetadata.runId)', () => {
    const run = (id: string, metric: string, value: number, runId: string): SplitMeasurementInput => ({
      ...mk(id, metric, value),
      calculationMetadata: { runId },
    });

    it('takes every split from one run, never the fastest split of each run', () => {
      // Run A has the faster 30 yd, run B the faster 10 and 20 yd
      const rows = [
        run('a10', 'DASH_10YD', 1.73, 'A'),
        run('a20', 'DASH_20YD', 2.95, 'A'),
        run('a30', 'DASH_30YD', 4.05, 'A'),
        run('b10', 'DASH_10YD', 1.69, 'B'),
        run('b20', 'DASH_20YD', 2.85, 'B'),
        run('b30', 'DASH_30YD', 4.15, 'B'),
      ];

      const result = resolveSplitsFromMeasurements(rows);

      expect(result.splitTimes).toEqual({ '10': 1.73, '20': 2.95, '30': 4.05 });
      expect(result.usedMeasurementIds).toEqual({ '10': 'a10', '20': 'a20', '30': 'a30' });
    });

    it('ranks runs by the full sprint time first, then the shorter splits', () => {
      // A is faster over 30 yd although every earlier split of B is faster; listed second so order cannot decide
      const rows = [
        run('b10', 'DASH_10YD', 1.6, 'B'),
        run('b20', 'DASH_20YD', 2.8, 'B'),
        run('b30', 'DASH_30YD', 4.2, 'B'),
        run('a10', 'DASH_10YD', 1.75, 'A'),
        run('a20', 'DASH_20YD', 2.98, 'A'),
        run('a30', 'DASH_30YD', 4.05, 'A'),
        // Same 30 yd: the faster 20 yd decides
        run('c10', 'DASH_10YD', 1.7, 'C'),
        run('c20', 'DASH_20YD', 2.9, 'C'),
        run('c30', 'DASH_30YD', 4.05, 'C'),
      ];

      expect(resolveSplitsFromMeasurements(rows).usedMeasurementIds).toEqual({ '10': 'c10', '20': 'c20', '30': 'c30' });
      expect(resolveSplitsFromMeasurements(rows.slice(0, 6)).usedMeasurementIds).toEqual({ '10': 'a10', '20': 'a20', '30': 'a30' });
    });

    it('prefers the run with the most splits', () => {
      const rows = [
        run('a10', 'DASH_10YD', 1.65, 'A'),
        run('a20', 'DASH_20YD', 2.8, 'A'),
        run('a30', 'DASH_30YD', 4.0, 'A'),
        run('b10', 'DASH_10YD', 1.7, 'B'),
        run('b20', 'DASH_20YD', 2.9, 'B'),
        run('b30', 'DASH_30YD', 4.1, 'B'),
        run('b40', 'DASH_40YD', 5.2, 'B'),
      ];

      expect(resolveSplitsFromMeasurements(rows).usedMeasurementIds).toEqual({ '10': 'b10', '20': 'b20', '30': 'b30', '40': 'b40' });
    });

    it('throws when no single run has 3 splits, even if the runs together do', () => {
      const rows = [
        run('a10', 'DASH_10YD', 1.7, 'A'),
        run('a20', 'DASH_20YD', 2.9, 'A'),
        run('b30', 'DASH_30YD', 4.1, 'B'),
        run('b40', 'DASH_40YD', 5.2, 'B'),
      ];

      expect(() => resolveSplitsFromMeasurements(rows)).toThrow(/at least 3/i);
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
