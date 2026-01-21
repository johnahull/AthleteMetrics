/**
 * Benchmark Sport and Position Filtering Tests
 *
 * Tests for sport and position fields on site and custom benchmarks.
 * Requirements:
 * - sport field accepts valid sport codes (optional)
 * - position field accepts valid position names (optional)
 * - position requires sport when set (validation constraint)
 * - both fields can be null
 */

import { describe, it, expect } from 'vitest';
import { insertSiteBenchmarkSchema, insertCustomBenchmarkSchema } from '../schema/validation';

describe('Benchmark Sport and Position Validation', () => {
  describe('Site Benchmark Schema', () => {
    const baseValidBenchmark = {
      metricCode: 'FLY10_TIME',
      name: 'Elite 10-Yard Fly Time',
      benchmarkValue: 1.5,
      comparisonOperator: 'lte' as const,
    };

    describe('sport field', () => {
      it('accepts benchmark without sport (sport is optional)', () => {
        const result = insertSiteBenchmarkSchema.safeParse(baseValidBenchmark);
        expect(result.success).toBe(true);
      });

      it('accepts benchmark with valid sport code', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: 'SOCCER',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.sport).toBe('SOCCER');
        }
      });

      it('accepts various valid sport codes', () => {
        const sportCodes = ['SOCCER', 'BASKETBALL', 'FOOTBALL', 'BASEBALL'];
        sportCodes.forEach(sportCode => {
          const result = insertSiteBenchmarkSchema.safeParse({
            ...baseValidBenchmark,
            sport: sportCode,
          });
          expect(result.success).toBe(true);
        });
      });

      it('accepts null sport', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: null,
        });
        expect(result.success).toBe(true);
      });

      it('accepts undefined sport', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: undefined,
        });
        expect(result.success).toBe(true);
      });

      it('rejects empty string sport', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: '',
        });
        expect(result.success).toBe(false);
      });

      it('rejects sport exceeding max length', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: 'A'.repeat(51), // Max is 50
        });
        expect(result.success).toBe(false);
      });
    });

    describe('position field', () => {
      it('accepts benchmark without position (position is optional)', () => {
        const result = insertSiteBenchmarkSchema.safeParse(baseValidBenchmark);
        expect(result.success).toBe(true);
      });

      it('accepts null position', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          position: null,
        });
        expect(result.success).toBe(true);
      });

      it('accepts undefined position', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          position: undefined,
        });
        expect(result.success).toBe(true);
      });

      it('rejects empty string position', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          position: '',
        });
        expect(result.success).toBe(false);
      });

      it('rejects position exceeding max length', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          position: 'A'.repeat(51), // Max is 50
        });
        expect(result.success).toBe(false);
      });
    });

    describe('sport and position combination validation', () => {
      it('accepts benchmark with both sport and position', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: 'SOCCER',
          position: 'Forward',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.sport).toBe('SOCCER');
          expect(result.data.position).toBe('Forward');
        }
      });

      it('rejects position without sport (validation constraint)', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          position: 'Forward',
          // sport is not provided
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          const positionError = result.error.issues.find(
            issue => issue.path.includes('position')
          );
          expect(positionError).toBeDefined();
          expect(positionError?.message).toContain('sport');
        }
      });

      it('rejects position with null sport', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: null,
          position: 'Forward',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          const positionError = result.error.issues.find(
            issue => issue.path.includes('position')
          );
          expect(positionError).toBeDefined();
          expect(positionError?.message).toContain('sport');
        }
      });

      it('rejects position with undefined sport', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: undefined,
          position: 'Forward',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          const positionError = result.error.issues.find(
            issue => issue.path.includes('position')
          );
          expect(positionError).toBeDefined();
        }
      });

      it('accepts sport without position', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: 'SOCCER',
          // position is not provided
        });
        expect(result.success).toBe(true);
      });

      it('accepts sport with null position', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: 'SOCCER',
          position: null,
        });
        expect(result.success).toBe(true);
      });

      it('accepts both fields as null', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: null,
          position: null,
        });
        expect(result.success).toBe(true);
      });

      it('accepts various sport-position combinations', () => {
        const combinations = [
          { sport: 'SOCCER', position: 'Forward' },
          { sport: 'SOCCER', position: 'Midfielder' },
          { sport: 'SOCCER', position: 'Defender' },
          { sport: 'BASKETBALL', position: 'Guard' },
          { sport: 'BASKETBALL', position: 'Forward' },
          { sport: 'FOOTBALL', position: 'Quarterback' },
          { sport: 'FOOTBALL', position: 'Wide Receiver' },
        ];

        combinations.forEach(({ sport, position }) => {
          const result = insertSiteBenchmarkSchema.safeParse({
            ...baseValidBenchmark,
            sport,
            position,
          });
          expect(result.success).toBe(true);
        });
      });
    });

    describe('integration with existing filters', () => {
      it('accepts sport/position with gender filter', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: 'SOCCER',
          position: 'Forward',
          gender: 'Male',
        });
        expect(result.success).toBe(true);
      });

      it('accepts sport/position with age range', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: 'BASKETBALL',
          position: 'Guard',
          ageMin: 14,
          ageMax: 18,
        });
        expect(result.success).toBe(true);
      });

      it('accepts sport/position with level filter', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: 'FOOTBALL',
          position: 'Quarterback',
          level: 'Varsity',
        });
        expect(result.success).toBe(true);
      });

      it('accepts all filters combined', () => {
        const result = insertSiteBenchmarkSchema.safeParse({
          ...baseValidBenchmark,
          sport: 'SOCCER',
          position: 'Forward',
          gender: 'Female',
          ageMin: 16,
          ageMax: 19,
          level: 'Varsity',
        });
        expect(result.success).toBe(true);
      });
    });
  });

  describe('Custom Benchmark Schema', () => {
    const baseValidCustomBenchmark = {
      organizationId: '123e4567-e89b-12d3-a456-426614174000',
      metricCode: 'FLY10_TIME',
      name: 'Team Elite 10-Yard Fly Time',
      benchmarkValue: 1.4,
      comparisonOperator: 'lte' as const,
    };

    describe('sport field', () => {
      it('accepts custom benchmark without sport', () => {
        const result = insertCustomBenchmarkSchema.safeParse(baseValidCustomBenchmark);
        expect(result.success).toBe(true);
      });

      it('accepts custom benchmark with valid sport code', () => {
        const result = insertCustomBenchmarkSchema.safeParse({
          ...baseValidCustomBenchmark,
          sport: 'SOCCER',
        });
        expect(result.success).toBe(true);
        if (result.success) {
          expect(result.data.sport).toBe('SOCCER');
        }
      });

      it('rejects empty string sport', () => {
        const result = insertCustomBenchmarkSchema.safeParse({
          ...baseValidCustomBenchmark,
          sport: '',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('position field', () => {
      it('accepts custom benchmark without position', () => {
        const result = insertCustomBenchmarkSchema.safeParse(baseValidCustomBenchmark);
        expect(result.success).toBe(true);
      });

      it('rejects empty string position', () => {
        const result = insertCustomBenchmarkSchema.safeParse({
          ...baseValidCustomBenchmark,
          position: '',
        });
        expect(result.success).toBe(false);
      });
    });

    describe('sport and position combination validation', () => {
      it('accepts custom benchmark with both sport and position', () => {
        const result = insertCustomBenchmarkSchema.safeParse({
          ...baseValidCustomBenchmark,
          sport: 'SOCCER',
          position: 'Midfielder',
        });
        expect(result.success).toBe(true);
      });

      it('rejects position without sport', () => {
        const result = insertCustomBenchmarkSchema.safeParse({
          ...baseValidCustomBenchmark,
          position: 'Midfielder',
        });
        expect(result.success).toBe(false);
        if (!result.success) {
          const positionError = result.error.issues.find(
            issue => issue.path.includes('position')
          );
          expect(positionError).toBeDefined();
          expect(positionError?.message).toContain('sport');
        }
      });

      it('accepts sport without position', () => {
        const result = insertCustomBenchmarkSchema.safeParse({
          ...baseValidCustomBenchmark,
          sport: 'BASKETBALL',
        });
        expect(result.success).toBe(true);
      });
    });

    describe('integration with existing filters', () => {
      it('accepts sport/position with all custom benchmark filters', () => {
        const result = insertCustomBenchmarkSchema.safeParse({
          ...baseValidCustomBenchmark,
          sport: 'SOCCER',
          position: 'Forward',
          gender: 'Male',
          ageMin: 14,
          ageMax: 18,
          level: 'Varsity',
        });
        expect(result.success).toBe(true);
      });
    });
  });
});
