/**
 * Migration 0168: seed a 5-tier HS boys DASH_40YD tier group (OVR Performance data, rolling start)
 * and a site benchmark set holding it.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { deriveTierGroupName } from '../../packages/shared/benchmark-utils';
import { evaluateTierBenchmark } from '../../packages/api/services/benchmark-tiers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0168_seed_hs_boys_40yd_tiers';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

const TIER_GROUP_ID = 'b0400000-0168-4000-8000-000000000040';
const SET_ID = 'set-hs-boys-40yd-ovr';
/** [id, tier order, tier name, cutoff] */
const TIERS = [
  ['bench-hs-boys-40yd-elite', 1, 'Elite', '4.60'],
  ['bench-hs-boys-40yd-excellent', 2, 'Excellent', '4.80'],
  ['bench-hs-boys-40yd-above-avg', 3, 'Above Average', '5.00'],
  ['bench-hs-boys-40yd-average', 4, 'Average', '5.20'],
  ['bench-hs-boys-40yd-below-avg', 5, 'Below Average', '5.50'],
] as const;
const IDS = TIERS.map(([id]) => id);

describe('Migration 0168: static analysis', () => {
  it('seeds the 5 tiers with their cutoffs in one tier group, boys HS, lte', () => {
    for (const [id, order, tierName, cutoff] of TIERS) {
      // (?:(?!\n\n)[\s\S])*? stays inside one VALUES tuple (tuples are blank-line separated)
      const inTuple = '(?:(?!\\n\\n)[\\s\\S])*?';
      expect(UP).toMatch(new RegExp(`'${id}'${inTuple}'lte', ${cutoff},${inTuple}'${TIER_GROUP_ID}'::uuid, ${order}, '${tierName}'`));
    }
    expect(UP.match(new RegExp(`'${TIER_GROUP_ID}'::uuid, \\d,`, 'g'))).toHaveLength(5);
    expect(UP.match(/'Male', 'HS'/g)).toHaveLength(5);
    expect(UP).toMatch(/'set-hs-boys-40yd-ovr',\s*NULL,[\s\S]*?'HS',\s*'Male'/);
  });
  it('every tier name derives the group label "HS Boys 40 yd"', () => {
    const names = UP.match(/'HS Boys 40 yd - [^']+'/g) ?? [];
    expect(names).toHaveLength(5);
    for (const n of names) expect(deriveTierGroupName(n.slice(1, -1))).toBe('HS Boys 40 yd');
  });
  it('is idempotent and has no transaction control', () => {
    expect(UP).toMatch(/ON CONFLICT \(metric_code, name\) DO UPDATE/);
    expect(UP).toMatch(/ON CONFLICT \(id\) DO UPDATE/);
    expect(UP).toMatch(/ON CONFLICT \(set_id, benchmark_id, benchmark_type\) DO UPDATE/);
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(DOWN).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('down forgets its manual_migrations row only when that table exists', () => {
    expect(DOWN).toMatch(/to_regclass\('manual_migrations'\)/);
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });
});

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe.skipIf(!isDisposableTestDb)('Migration 0168: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1 });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  // Everything the test creates is discarded by the rollback.
  const rollbackable = async (fn: (tx: any) => Promise<void>) => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        // CI seeds no metrics
        await tx`INSERT INTO site_metrics (code, label, metric_type, unit) VALUES ('DASH_40YD', '40-Yard Dash', 'lower_is_better', 's') ON CONFLICT (code) DO NOTHING`;
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  };
  const counts = async (tx: any) => {
    const [b] = await tx`SELECT COUNT(*)::int AS n FROM site_benchmarks WHERE id = ANY(${IDS})`;
    const [s] = await tx`SELECT COUNT(*)::int AS n FROM benchmark_sets WHERE id = ${SET_ID}`;
    const [i] = await tx`SELECT COUNT(*)::int AS n FROM benchmark_set_items WHERE set_id = ${SET_ID}`;
    return { benchmarks: b.n, sets: s.n, items: i.n };
  };

  it('seeds 5 tiers, the set and 5 items; twice is a no-op', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      expect(await counts(tx)).toEqual({ benchmarks: 5, sets: 1, items: 5 });
    });
  });

  it('grades times through the tier evaluator (slower than 5.50 falls back to the worst tier)', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const rows = await tx`
        SELECT name, tier_name AS "tierName", tier_color AS "tierColor", tier_order AS "tierOrder",
               min_value AS "minValue", max_value AS "maxValue", benchmark_value AS "benchmarkValue",
               comparison_operator AS "comparisonOperator", tier_group_id AS "tierGroupId"
          FROM site_benchmarks WHERE tier_group_id = ${TIER_GROUP_ID} ORDER BY tier_order`;
      const tierFor = (t: number) => evaluateTierBenchmark(t, true, rows)?.tierName;
      expect(tierFor(4.6)).toBe('Elite');
      expect(tierFor(4.95)).toBe('Above Average');
      expect(tierFor(5.8)).toBe('Below Average');
      // every cutoff is inclusive: a time equal to a tier's max stays in that tier
      for (const r of rows) expect(tierFor(Number(r.benchmarkValue))).toBe(r.tierName);
      expect(evaluateTierBenchmark(4.95, true, rows)?.tierGroupName).toBe('HS Boys 40 yd');
    });
  });

  it('down removes the tiers, the set and its items', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      await tx.unsafe(DOWN);
      expect(await counts(tx)).toEqual({ benchmarks: 0, sets: 0, items: 0 });
    });
  });
});
