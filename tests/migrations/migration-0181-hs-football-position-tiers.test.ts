/**
 * Migration 0181: HS football position tiers (McKay et al. 2020). 180 rows (9 positions x 4 metrics x 5 tiers),
 * 36 tier groups, one template set. Live checks run in a rolled-back transaction, only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import {
  evaluateTierBenchmark,
  filterTierRowsForAthlete,
  selectTierGroup,
} from '../../packages/api/services/benchmark-tiers';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0181_seed_hs_football_position_tiers';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

describe('Migration 0181: static analysis', () => {
  it('has no transaction control; down forgets its manual_migrations row (guarded)', () => {
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(DOWN).toMatch(/to_regclass\('manual_migrations'\)/);
    expect(DOWN).toContain(`migration_name = '${NAME}'`);
  });
});

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

type Tx = postgres.TransactionSql;
type Row = {
  metric_code: string; comparison_operator: string; position: string; tier_group_id: string; tier_order: number;
  tier_name: string; benchmark_value: string; display_order: number; [k: string]: unknown;
};

// CI test DBs are db:push + default seed with no site_metrics rows, so the test creates the four metrics it needs.
describe.skipIf(!isDisposableTestDb)('Migration 0181: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1 });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  const rollbackable = async (fn: (tx: Tx) => Promise<void>) => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        // The real DB has varchar(36) ids: seeded ids must fit.
        await tx`ALTER TABLE site_benchmarks ALTER COLUMN id TYPE varchar(36)`;
        await tx`ALTER TABLE benchmark_set_items ALTER COLUMN id TYPE varchar(36)`;
        for (const [code, type, unit] of [
          ['DASH_40YD', 'lower_is_better', 's'], ['AGILITY_5105', 'lower_is_better', 's'],
          ['VERTICAL_JUMP', 'higher_is_better', 'in'], ['JUMP_BROAD', 'higher_is_better', 'in'],
        ]) {
          await tx`INSERT INTO site_metrics (code, label, metric_type, unit) VALUES (${code}, ${code}, ${type}, ${unit}) ON CONFLICT (code) DO NOTHING`;
        }
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  };
  const seeded = (tx: Tx) => tx<Row[]>`SELECT * FROM site_benchmarks WHERE id LIKE 'mckay2020-%' ORDER BY id`;

  it('seeds 180 rows in 36 groups, 180 set items; twice is idempotent', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      const rows = await seeded(tx);
      expect(rows).toHaveLength(180);
      expect(new Set(rows.map((r) => r.tier_group_id)).size).toBe(36);
      const items = await tx`SELECT count(*)::int AS n FROM benchmark_set_items WHERE set_id = 'set-hs-football-position-mckay2020'`;
      expect(items[0].n).toBe(180);
    });
  });

  it('cutoffs get looser tier by tier (lte rise, gte fall)', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const groups = new Map<string, Row[]>();
      for (const r of await seeded(tx)) groups.set(r.tier_group_id, [...(groups.get(r.tier_group_id) ?? []), r]);
      for (const g of groups.values()) {
        const sorted = g.sort((a, b) => a.tier_order - b.tier_order).map((r) => Number(r.benchmark_value));
        for (let i = 1; i < sorted.length; i++) {
          if (g[0].comparison_operator === 'lte') expect(sorted[i]).toBeGreaterThan(sorted[i - 1]);
          else expect(sorted[i]).toBeLessThan(sorted[i - 1]);
        }
      }
    });
  });

  it('a WR is graded on the WR group and an OL on the OL group (paper P80 WR 4.88 s; OL P60 5.75, P40 5.95)', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const rows = (await seeded(tx)).filter((r) => r.metric_code === 'DASH_40YD').map((r) => ({
        ...r, tierGroupId: r.tier_group_id, tierOrder: r.tier_order, tierName: r.tier_name,
        benchmarkValue: r.benchmark_value, comparisonOperator: r.comparison_operator, displayOrder: r.display_order,
        _source: 'site',
      }));
      const grade = (positions: string[], value: number) =>
        evaluateTierBenchmark(
          value, true,
          selectTierGroup(filterTierRowsForAthlete(rows, { gender: 'Male', age: 16, positions })),
        )?.tierName;
      expect(grade(['WR'], 4.85)).toBe('Excellent');
      expect(grade(['OL'], 5.85)).toBe('Average');
      expect(grade([], 4.85)).toBeUndefined();
    });
  });

  it('down removes everything', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      // An organization that enabled a seeded benchmark and the seeded set: DOWN must remove those links too
      const [org] = await tx`INSERT INTO organizations (name, is_active) VALUES (${`m0181-down-${Date.now()}`}, true) RETURNING id`;
      const [first] = await seeded(tx);
      await tx`INSERT INTO organization_benchmarks (organization_id, benchmark_type, benchmark_id, is_enabled) VALUES (${org.id}, 'site', ${first.id as string}, true)`;
      await tx`INSERT INTO organization_benchmark_sets (organization_id, site_set_id) VALUES (${org.id}, 'set-hs-football-position-mckay2020')`;
      await tx.unsafe(DOWN);
      expect((await seeded(tx)).length).toBe(0);
      expect((await tx`SELECT count(*)::int AS n FROM organization_benchmarks WHERE organization_id = ${org.id}`)[0].n).toBe(0);
      expect((await tx`SELECT count(*)::int AS n FROM organization_benchmark_sets WHERE organization_id = ${org.id}`)[0].n).toBe(0);
      const sets = await tx`SELECT count(*)::int AS n FROM benchmark_sets WHERE id = 'set-hs-football-position-mckay2020'`;
      expect(sets[0].n).toBe(0);
    });
  });
});
