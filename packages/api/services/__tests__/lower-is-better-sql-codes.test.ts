/**
 * Decline detection decides "rising is worse" from each measurement's own metric row: site_metrics, else the
 * custom org metric of the measurement's organization. It used to bind a hard-coded list of codes, which missed
 * custom org metrics and ignored admin edits of a built-in metric's type. The DB-backed behaviour is covered by
 * tests/integration/at-risk-decline-direction.test.ts; this checks the shape of the SQL.
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

import * as analyticsService from '../analytics-service';

async function declineSql(): Promise<string> {
  execute.mockResolvedValue([]);
  await new analyticsService.AnalyticsService().getAtRiskAthletes('org-1');
  return new PgDialect().sqlToQuery(execute.mock.calls[0][0]).sql;
}

describe('decline detection direction', () => {
  it('no longer exports a hard-coded list of lower-is-better codes', () => {
    expect(analyticsService).not.toHaveProperty('LOWER_IS_BETTER_SQL_CODES');
  });

  it('resolves the direction per row from site_metrics, then the row organization\'s custom metric', async () => {
    const sqlText = (await declineSql()).replace(/\s+/g, ' ');
    expect(sqlText).toContain('LEFT JOIN site_metrics sm ON sm.code = m.metric');
    expect(sqlText).toContain(
      'LEFT JOIN custom_org_metrics com ON com.code = m.metric AND com.organization_id = m.organization_id',
    );
    expect(sqlText).toContain("COALESCE(sm.metric_type, com.metric_type) = 'lower_is_better'");
  });

  it('binds no list of metric codes', async () => {
    expect(await declineSql()).not.toMatch(/metric IN \(/);
  });
});
