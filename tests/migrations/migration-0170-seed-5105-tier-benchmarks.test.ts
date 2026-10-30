/**
 * Migration 0170: seed 5-10-5 (AGILITY_5105) tier benchmarks, one 4-tier group per sex x sport x level
 * (200 rows, 10 sets). The 0129 Female SOCCER / VOLLEYBALL Average rows stay active (eval keeps using them).
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { deriveTierGroupName } from '../../packages/shared/benchmark-utils';
import { evaluateTierBenchmark, selectTierGroup } from '../../packages/api/services/benchmark-tiers';
import { matchTierGroup, type TierCandidateRow } from '../../packages/api/services/eval-report/tier-match';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0170_seed_5105_tier_benchmarks';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

/** Source table, electronic timing: the three cutoffs between the four tiers (Elite < c1 <= Competitive <= c2 < Average <= c3 < Developing). */
const BANDS = [
  { sex: 'Male', level: 'D1', age: [19, null], cuts: [4.1, 4.25, 4.4] },
  { sex: 'Male', level: 'HS', age: [16, 18], cuts: [4.3, 4.5, 4.75] },
  { sex: 'Male', level: 'HS', age: [14, 15], cuts: [4.5, 4.7, 4.95] },
  { sex: 'Male', level: 'HS', age: [13, 13], cuts: [4.7, 4.95, 5.25] },
  { sex: 'Male', level: 'HS', age: [11, 12], cuts: [4.9, 5.2, 5.55] },
  { sex: 'Female', level: 'D1', age: [19, null], cuts: [4.45, 4.65, 4.85] },
  { sex: 'Female', level: 'HS', age: [16, 18], cuts: [4.7, 4.95, 5.2] },
  { sex: 'Female', level: 'HS', age: [14, 15], cuts: [4.9, 5.15, 5.4] },
  { sex: 'Female', level: 'HS', age: [13, 13], cuts: [5.1, 5.35, 5.65] },
  { sex: 'Female', level: 'HS', age: [11, 12], cuts: [5.3, 5.6, 6.0] },
] as const;

const SPORTS = {
  Male: ['FOOTBALL', 'SOCCER', 'BASKETBALL', 'BASEBALL', 'LACROSSE'],
  Female: ['SOCCER', 'BASKETBALL', 'VOLLEYBALL', 'SOFTBALL', 'LACROSSE'],
} as const;

/** 0129 rows that the new tiers replace */
const SUPERSEDED = [
  ['hs-ms-soc-agi5105', 'SOCCER', 11, 13],
  ['hs-jv-soc-agi5105', 'SOCCER', 14, 15],
  ['hs-var-soc-agi5105', 'SOCCER', 16, 18],
  ['hs-ms-vb-agi5105', 'VOLLEYBALL', 11, 13],
  ['hs-jv-vb-agi5105', 'VOLLEYBALL', 14, 15],
  ['hs-var-vb-agi5105', 'VOLLEYBALL', 16, 18],
] as const;

describe('Migration 0170: static analysis', () => {
  it('has no transaction control and a guarded manual_migrations delete in down', () => {
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(DOWN).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(DOWN).toContain("to_regclass('manual_migrations')");
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });

  it('carries each cutoff triple on its own sex / level row of the source table', () => {
    BANDS.forEach(({ sex, level, age, cuts }) => {
      const lord = BANDS.filter((b) => b.sex === sex).findIndex((b) => b.age[0] === age[0]) + 1;
      const row = new RegExp(`\\('${sex}',\\s+${lord},\\s+'[a-z0-9]+',\\s+'[^']+',\\s+'${level}',\\s+${age[0]},\\s+(NULL::int|${age[1]}),\\s+${cuts.map((c) => c.toFixed(2)).join(',\\s+')}\\)`);
      expect(UP).toMatch(row);
    });
  });

  it('leaves the 0129 rows alone and never switches the upsert back on', () => {
    for (const [id] of SUPERSEDED) {
      expect(UP).not.toContain(`'${id}'`);
      expect(DOWN).not.toContain(`'${id}'`);
    }
    const upsert = UP.slice(UP.indexOf('ON CONFLICT (metric_code, name)'));
    expect(upsert.slice(0, upsert.indexOf(';'))).not.toMatch(/is_active\s*=/);
  });
});

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe.skipIf(!isDisposableTestDb)('Migration 0170: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1 });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  const rollbackable = async (fn: (tx: any) => Promise<void>) => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        // The real column limit; a CI db:push DB has no seeded metrics, so create the metric
        await tx`ALTER TABLE site_benchmarks ALTER COLUMN id TYPE varchar(36)`;
        await tx`INSERT INTO site_metrics (code, label, metric_type, unit) VALUES ('AGILITY_5105', '5-10-5 Agility', 'lower_is_better', 's') ON CONFLICT (code) DO NOTHING`;
        // The state 0129 leaves behind
        for (const [id, sport, ageMin, ageMax] of SUPERSEDED) {
          await tx`INSERT INTO site_benchmarks (id, metric_code, name, comparison_operator, benchmark_value, tier_name, gender, sport, level, age_min, age_max, is_active)
                   VALUES (${id}, 'AGILITY_5105', ${'old-' + id}, 'lte', 5.25, 'Average', 'Female', ${sport}, 'HS', ${ageMin}, ${ageMax}, true)
                   ON CONFLICT DO NOTHING`;
        }
        // A DB that already ran 0129 has these rows; make sure they are active
        await tx`UPDATE site_benchmarks SET is_active = true WHERE id = ANY(${SUPERSEDED.map(([id]) => id)})`;
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  };
  const tierRows = (tx: any) =>
    tx`SELECT * FROM site_benchmarks WHERE metric_code = 'AGILITY_5105' AND tier_group_id IS NOT NULL ORDER BY id`;
  const toCandidates = (rows: any[]): TierCandidateRow[] =>
    rows.map((r) => ({
      ...r,
      metricCode: r.metric_code,
      tierGroupId: r.tier_group_id,
      tierOrder: r.tier_order,
      tierName: r.tier_name,
      benchmarkValue: r.benchmark_value,
      minValue: r.min_value,
      maxValue: r.max_value,
      comparisonOperator: r.comparison_operator,
      displayOrder: r.display_order,
      ageMin: r.age_min,
      ageMax: r.age_max,
      _source: 'site',
    }));

  it('seeds 200 active rows (id <= 36 chars), 10 sets, 200 set items; twice is idempotent', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      const rows = await tierRows(tx);
      expect(rows).toHaveLength(200);
      expect(rows.every((r: any) => r.is_active && r.id.length <= 36 && r.name.length <= 100)).toBe(true);
      const [sets] = await tx`SELECT count(*)::int AS n FROM benchmark_sets WHERE id LIKE 'set-5105-%'`;
      const [items] = await tx`SELECT count(*)::int AS n FROM benchmark_set_items WHERE set_id LIKE 'set-5105-%'`;
      expect(sets.n).toBe(10);
      expect(items.n).toBe(200);
    });
  });

  it('seeds the right sports per sex and one group label per sex x sport x level', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const rows = await tierRows(tx);
      for (const sex of ['Male', 'Female'] as const) {
        const sports = [...new Set(rows.filter((r: any) => r.gender === sex).map((r: any) => r.sport))].sort();
        expect(sports).toEqual([...SPORTS[sex]].sort());
      }
      const groups = new Map<string, any[]>();
      for (const r of rows) groups.set(r.tier_group_id, [...(groups.get(r.tier_group_id) ?? []), r]);
      expect(groups.size).toBe(50);
      for (const g of groups.values()) {
        expect(g).toHaveLength(4);
        expect(new Set(g.map((r) => deriveTierGroupName(r.name))).size).toBe(1);
        expect(g.map((r) => r.tier_name).sort()).toEqual(['Average', 'Competitive', 'Developing', 'Elite']);
      }
    });
  });

  it('bands are contiguous, gap-free and match the source cutoffs', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const rows = await tierRows(tx);
      for (const b of BANDS) {
        const g = rows
          .filter((r: any) => r.gender === b.sex && r.sport === 'SOCCER' && r.age_min === b.age[0] && r.age_max === b.age[1])
          .sort((x: any, y: any) => x.tier_order - y.tier_order);
        expect(g).toHaveLength(4);
        const [c1, c2, c3] = b.cuts;
        const range = g.map((r: any) => [Number(r.min_value), Number(r.max_value)]);
        expect(range).toEqual([
          [0, +(c1 - 0.001).toFixed(3)],
          [c1, c2],
          [+(c2 + 0.001).toFixed(3), c3],
          [+(c3 + 0.001).toFixed(3), 10],
        ]);
        expect(g[0].level).toBe(b.level);
      }
    });
  });

  it('leaves the six 0129 rows active; down removes the tiers, sets and items and keeps them', async () => {
    await rollbackable(async (tx) => {
      const ids = SUPERSEDED.map(([id]) => id);
      await tx.unsafe(UP);
      expect(await tx`SELECT id FROM site_benchmarks WHERE id = ANY(${ids}) AND is_active = true`).toHaveLength(6);
      await tx.unsafe(DOWN);
      expect(await tx`SELECT id FROM site_benchmarks WHERE id = ANY(${ids}) AND is_active = true`).toHaveLength(6);
      expect(await tierRows(tx)).toHaveLength(0);
      const [sets] = await tx`SELECT count(*)::int AS n FROM benchmark_sets WHERE id LIKE 'set-5105-%'`;
      const [items] = await tx`SELECT count(*)::int AS n FROM benchmark_set_items WHERE set_id LIKE 'set-5105-%'`;
      expect(sets.n + items.n).toBe(0);
    });
  });

  it('scores a Male Varsity time into the right tier (boundaries favour the stated band)', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const rows = await tx`SELECT * FROM site_benchmarks WHERE id LIKE 'b5105-m-bsk-var-%' ORDER BY tier_order`;
      const tiers = rows.map((r: any) => ({
        tierOrder: r.tier_order, tierName: r.tier_name, minValue: r.min_value, maxValue: r.max_value,
        benchmarkValue: r.benchmark_value, comparisonOperator: r.comparison_operator, tierColor: r.tier_color,
      }));
      const tierOf = (v: number) => (evaluateTierBenchmark(v, true, tiers as any) as any)?.tierName;
      expect([tierOf(4.29), tierOf(4.3), tierOf(4.6), tierOf(4.8)]).toEqual(['Elite', 'Competitive', 'Average', 'Developing']);
    });
  });

  it('eval matching: stays on the single Average row, never the new tier groups', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const old = await tx`SELECT * FROM site_benchmarks WHERE id = ANY(${SUPERSEDED.map(([id]) => id)})`;
      const candidates = toCandidates([...(await tierRows(tx)), ...old]);
      const match = (gender: string, sport: string, birthDate: string, value: number) =>
        matchTierGroup({
          metricCode: 'AGILITY_5105', value, lowerIsBetter: true, eventDate: '2026-06-01',
          athlete: { gender, sport, birthDate }, candidates,
        });
      // 16-year-old female soccer: the 0129 Varsity Average (5.25 s), not the tier group
      expect(match('Female', 'SOCCER', '2009-09-01', 5.0)).toMatchObject({ kind: 'average', status: 'at_or_better' });
      // No Average row for male basketball: value only, even though a tier group exists
      expect(match('Male', 'BASKETBALL', '2011-03-01', 4.6)).toBeNull();
      expect(selectTierGroup(candidates.filter((c) => c.gender === 'Male' && c.sport === 'BASKETBALL' && c.ageMin === 16))).toHaveLength(4);
    });
  });
});
