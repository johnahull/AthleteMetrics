/**
 * Schema/migration alignment: benchmark range edges must keep three decimals.
 *
 * Migration-built databases (production) have numeric(10,3) for min_value /
 * max_value on site_benchmarks and custom_benchmarks. A `drizzle-kit push`-built
 * database must match, otherwise 94.999 is stored as 95.00 and 2.102 as 2.10.
 *
 * Requires DATABASE_URL (PostgreSQL).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import { eq, sql } from 'drizzle-orm';
import { db } from '../../packages/api/db';
import { siteMetrics, siteBenchmarks, customBenchmarks, organizations } from '@shared/schema';

const suffix = Date.now();
const metricCode = `SCALE_TEST_${suffix}`;
let orgId = '';

describe('benchmark min_value/max_value numeric scale', () => {
  beforeAll(async () => {
    await db.insert(siteMetrics).values({ code: metricCode, label: 'Scale test' });
    const [org] = await db.insert(organizations).values({ name: `Scale Org ${suffix}` }).returning();
    orgId = org.id;
  });

  afterAll(async () => {
    if (orgId) {
      await db.delete(customBenchmarks).where(eq(customBenchmarks.organizationId, orgId));
      await db.delete(organizations).where(eq(organizations.id, orgId));
    }
    await db.delete(siteBenchmarks).where(eq(siteBenchmarks.metricCode, metricCode));
    await db.delete(siteMetrics).where(eq(siteMetrics.code, metricCode));
  });

  it('declares numeric(10,3) for min_value and max_value on both benchmark tables', async () => {
    const result = await db.execute(sql`
      SELECT table_name, column_name, numeric_precision, numeric_scale
      FROM information_schema.columns
      WHERE table_schema = 'public'
        AND table_name IN ('site_benchmarks', 'custom_benchmarks')
        AND column_name IN ('min_value', 'max_value')
    `);
    const rows = [...result] as any[];
    expect(rows).toHaveLength(4);
    for (const row of rows) {
      expect(Number(row.numeric_precision)).toBe(10);
      expect(Number(row.numeric_scale)).toBe(3);
    }
  });

  it('round-trips three-decimal site benchmark edges without rounding', async () => {
    const [row] = await db.insert(siteBenchmarks).values({
      metricCode,
      name: 'Scale tier',
      comparisonOperator: 'range',
      minValue: '2.102',
      maxValue: '94.999',
    }).returning();
    expect(row.minValue).toBe('2.102');
    expect(row.maxValue).toBe('94.999');
  });

  it('round-trips three-decimal custom benchmark edges without rounding', async () => {
    const [row] = await db.insert(customBenchmarks).values({
      organizationId: orgId,
      metricCode,
      name: 'Scale tier',
      comparisonOperator: 'range',
      minValue: '2.102',
      maxValue: '94.999',
    }).returning();
    expect(row.minValue).toBe('2.102');
    expect(row.maxValue).toBe('94.999');
  });
});
