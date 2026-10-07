/**
 * AM-FEAT-016: the SQL decline-direction code list must treat both 5-0-5 protocols
 * and both COD deficit metrics as lower-is-better (otherwise a rising time is
 * reported as an improvement). It derives from the shared single source of truth.
 */
import { describe, it, expect, vi } from 'vitest';
import { PgDialect } from 'drizzle-orm/pg-core';

const execute = vi.hoisted(() => vi.fn());
vi.mock('../../db', () => ({
  db: {
    select: () => ({ from: () => ({ where: async () => [] }) }),
    execute,
  },
}));
vi.mock('../../utils/athlete-filters', () => ({
  getAthleteIdsForScope: vi.fn().mockResolvedValue(['a1']),
}));

import { AnalyticsService, LOWER_IS_BETTER_SQL_CODES } from '../analytics-service';
import { LOWER_IS_BETTER_METRICS } from '@shared/analytics-types';

// The list this constant held before it was derived from the shared one.
const PREVIOUS_SQL_LIST = [
  'FLY10_TIME',
  'AGILITY_505_M',
  'AGILITY_505_YD',
  'AGILITY_COD_DEFICIT_M',
  'AGILITY_COD_DEFICIT_YD',
  'AGILITY_5105',
  'T_TEST',
  'DASH_40YD',
];

describe('LOWER_IS_BETTER_SQL_CODES', () => {
  it('is derived from the shared LOWER_IS_BETTER_METRICS (single source of truth)', () => {
    expect([...LOWER_IS_BETTER_SQL_CODES]).toEqual([...LOWER_IS_BETTER_METRICS]);
  });

  it('is a superset of the previous SQL list and drops the retired code', () => {
    for (const code of PREVIOUS_SQL_LIST) {
      expect(LOWER_IS_BETTER_SQL_CODES as readonly string[]).toContain(code);
    }
    expect(LOWER_IS_BETTER_SQL_CODES as readonly string[]).not.toContain('AGILITY_505');
  });

  it('now includes DASH_10YD (intended fix: correct decline sign for DASH_10YD)', () => {
    expect(LOWER_IS_BETTER_SQL_CODES as readonly string[]).toContain('DASH_10YD');
  });

  it('only contains plain metric codes', () => {
    for (const code of LOWER_IS_BETTER_SQL_CODES) {
      expect(code).toMatch(/^[A-Z0-9_]+$/);
    }
  });

  it('is passed to the decline-detection SQL as bound parameters, not interpolated text', async () => {
    execute.mockResolvedValue([]);
    await new AnalyticsService().getAtRiskAthletes('org-1');

    const { sql: decliningSql, params } = new PgDialect().sqlToQuery(execute.mock.calls[0][0]);
    for (const code of LOWER_IS_BETTER_SQL_CODES) {
      expect(params).toContain(code);
      expect(decliningSql).not.toContain(`'${code}'`);
    }
    expect(decliningSql).toMatch(/metric IN \(\$\d+(, \$\d+)+\)/);
  });
});
