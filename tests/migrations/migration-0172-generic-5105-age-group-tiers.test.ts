/**
 * Migration 0172: generic (sport-less) 5-10-5 age-group tiers per sex. Adds 40 tier rows (id prefix b5105g-) and
 * 2 template sets, and DEACTIVATES (never deletes) the 200 sport-specific b5105-% rows and the 10 set-5105-% sets
 * that 0170 seeded. Live checks run in a rolled-back transaction and only on a disposable test DB.
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
const NAME = '0172_generic_5105_age_group_tiers';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);
const UP_0170 = read('0170_seed_5105_tier_benchmarks.sql');

const BANDS = [
  { sex: 'Male', lcode: 'd1', level: 'D1', age: [19, null], cuts: [4.1, 4.25, 4.4] },
  { sex: 'Male', lcode: 'var', level: 'HS', age: [16, 18], cuts: [4.3, 4.5, 4.75] },
  { sex: 'Male', lcode: 'jv', level: 'HS', age: [14, 15], cuts: [4.5, 4.7, 4.95] },
  { sex: 'Male', lcode: 'ms8', level: 'HS', age: [13, 13], cuts: [4.7, 4.95, 5.25] },
  { sex: 'Male', lcode: 'ms67', level: 'HS', age: [11, 12], cuts: [4.9, 5.2, 5.55] },
  { sex: 'Female', lcode: 'd1', level: 'D1', age: [19, null], cuts: [4.45, 4.65, 4.85] },
  { sex: 'Female', lcode: 'var', level: 'HS', age: [16, 18], cuts: [4.7, 4.95, 5.2] },
  { sex: 'Female', lcode: 'jv', level: 'HS', age: [14, 15], cuts: [4.9, 5.15, 5.4] },
  { sex: 'Female', lcode: 'ms8', level: 'HS', age: [13, 13], cuts: [5.1, 5.35, 5.65] },
  { sex: 'Female', lcode: 'ms67', level: 'HS', age: [11, 12], cuts: [5.3, 5.6, 6.0] },
] as const;

/** 0129 rows (Female SOCCER / VOLLEYBALL single Average) that the eval report keeps using */
const AVG_0129 = [
  ['hs-ms-soc-agi5105', 'SOCCER', 11, 13],
  ['hs-jv-soc-agi5105', 'SOCCER', 14, 15],
  ['hs-var-soc-agi5105', 'SOCCER', 16, 18],
  ['hs-ms-vb-agi5105', 'VOLLEYBALL', 11, 13],
  ['hs-jv-vb-agi5105', 'VOLLEYBALL', 14, 15],
  ['hs-var-vb-agi5105', 'VOLLEYBALL', 16, 18],
] as const;

describe('Migration 0172: static analysis', () => {
  it('has no transaction control; down forgets its manual_migrations row (guarded)', () => {
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(DOWN).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(DOWN).toContain("to_regclass('manual_migrations')");
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });

  it('carries each cutoff triple on its own sex / level row', () => {
    BANDS.forEach(({ sex, lcode, level, age, cuts }) => {
      const lord = BANDS.filter((b) => b.sex === sex).findIndex((b) => b.lcode === lcode) + 1;
      const row = new RegExp(`\\('${sex}',\\s+${lord},\\s+'${lcode}',\\s+'[^']+',\\s+'${level}',\\s+${age[0]},\\s+(NULL::int|${age[1]}),\\s+${cuts.map((c) => c.toFixed(2)).join(',\\s+')}\\)`);
      expect(UP).toMatch(row);
    });
  });

  it('deactivates rather than deletes the sport-specific rows, and never re-enables on upsert', () => {
    expect(UP).not.toMatch(/DELETE\s+FROM/i);
    expect(UP).toMatch(/UPDATE site_benchmarks\s+SET is_active = false/);
    expect(UP).toMatch(/UPDATE benchmark_sets\s+SET is_active = false/);
    for (const [id] of AVG_0129) expect(UP).not.toContain(`'${id}'`);
    for (const m of UP.matchAll(/ON CONFLICT[^;]*?DO UPDATE SET([^;]*);/g)) expect(m[1]).not.toMatch(/is_active\s*=/);
  });
});

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe.skipIf(!isDisposableTestDb)('Migration 0172: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1 });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  /** Production state: 0129 rows + 0170 applied; then fn runs inside a transaction that is rolled back. */
  const rollbackable = async (fn: (tx: any) => Promise<void>) => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        await tx`ALTER TABLE site_benchmarks ALTER COLUMN id TYPE varchar(36)`;
        await tx`INSERT INTO site_metrics (code, label, metric_type, unit) VALUES ('AGILITY_5105', '5-10-5 Agility', 'lower_is_better', 's') ON CONFLICT (code) DO NOTHING`;
        for (const [id, sport, ageMin, ageMax] of AVG_0129) {
          await tx`INSERT INTO site_benchmarks (id, metric_code, name, comparison_operator, benchmark_value, tier_name, gender, sport, level, age_min, age_max, is_active)
                   VALUES (${id}, 'AGILITY_5105', ${'old-' + id}, 'lte', 5.25, 'Average', 'Female', ${sport}, 'HS', ${ageMin}, ${ageMax}, true)
                   ON CONFLICT DO NOTHING`;
        }
        await tx`UPDATE site_benchmarks SET is_active = true WHERE id = ANY(${AVG_0129.map(([id]) => id)})`;
        await tx.unsafe(UP_0170);
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  };
  const generic = (tx: any) =>
    tx`SELECT * FROM site_benchmarks WHERE metric_code = 'AGILITY_5105' AND id LIKE 'b5105g-%' ORDER BY id`;
  const count = async (tx: any, q: string) => (await tx.unsafe(q))[0].n as number;
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

  it('seeds 40 active sport-less rows in 10 groups, 2 template sets with 20 items each; twice is idempotent', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      const rows = await generic(tx);
      expect(rows).toHaveLength(40);
      expect(rows.every((r: any) => r.is_active && r.sport === null && r.id.length <= 36 && r.name.length <= 100)).toBe(true);
      const groups = new Map<string, any[]>();
      for (const r of rows) groups.set(r.tier_group_id, [...(groups.get(r.tier_group_id) ?? []), r]);
      expect(groups.size).toBe(10);
      for (const g of groups.values()) {
        expect(g).toHaveLength(4);
        expect(new Set(g.map((r) => deriveTierGroupName(r.name))).size).toBe(1);
        expect(g.map((r) => r.tier_name).sort()).toEqual(['Average', 'Competitive', 'Developing', 'Elite']);
        expect(g.sort((a, b) => a.tier_order - b.tier_order).map((r) => r.tier_color)).toEqual(['green', 'blue', 'gray', 'yellow']);
      }
      expect(rows[0].name).toMatch(/^5-10-5 (Male|Female) /);
      const sets = await tx`SELECT * FROM benchmark_sets WHERE id LIKE 'set-5105g-%' ORDER BY name`;
      expect(sets.map((s: any) => [s.name, s.gender, s.sport, s.is_template, s.is_active])).toEqual([
        ['5-10-5 Tiers - Female', 'Female', null, true, true],
        ['5-10-5 Tiers - Male', 'Male', null, true, true],
      ]);
      for (const s of sets) {
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM benchmark_set_items WHERE set_id = ${s.id}`;
        expect(n).toBe(20);
      }
      expect(await count(tx, `SELECT count(*)::int AS n FROM benchmark_set_items WHERE set_id LIKE 'set-5105g-%'`)).toBe(40);
    });
  });

  it('bands match the source cutoffs, contiguous with 0.001 stepping', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const rows = await generic(tx);
      for (const b of BANDS) {
        const g = rows
          .filter((r: any) => r.gender === b.sex && r.age_min === b.age[0] && r.age_max === b.age[1])
          .sort((x: any, y: any) => x.tier_order - y.tier_order);
        expect(g).toHaveLength(4);
        const [c1, c2, c3] = b.cuts;
        expect(g.map((r: any) => [Number(r.min_value), Number(r.max_value)])).toEqual([
          [0, +(c1 - 0.001).toFixed(3)],
          [c1, c2],
          [+(c2 + 0.001).toFixed(3), c3],
          [+(c3 + 0.001).toFixed(3), 10],
        ]);
        expect(g[0].level).toBe(b.level);
        expect(g[0].name).toContain(`5-10-5 ${b.sex} `);
      }
    });
  });

  it('deactivates exactly the 200 b5105-% rows and 10 set-5105-% sets, deleting nothing; 0129 rows stay active', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      expect(await count(tx, `SELECT count(*)::int AS n FROM site_benchmarks WHERE id LIKE 'b5105-%'`)).toBe(200);
      expect(await count(tx, `SELECT count(*)::int AS n FROM site_benchmarks WHERE id LIKE 'b5105-%' AND is_active`)).toBe(0);
      expect(await count(tx, `SELECT count(*)::int AS n FROM benchmark_sets WHERE id LIKE 'set-5105-%'`)).toBe(10);
      expect(await count(tx, `SELECT count(*)::int AS n FROM benchmark_sets WHERE id LIKE 'set-5105-%' AND is_active`)).toBe(0);
      expect(await count(tx, `SELECT count(*)::int AS n FROM benchmark_set_items WHERE set_id LIKE 'set-5105-%'`)).toBe(200);
      const ids = AVG_0129.map(([id]) => id);
      expect(await tx`SELECT id FROM site_benchmarks WHERE id = ANY(${ids}) AND is_active = true`).toHaveLength(6);
      // the only active 5-10-5 tier rows are the generic ones
      expect(
        await count(tx, `SELECT count(*)::int AS n FROM site_benchmarks WHERE metric_code='AGILITY_5105' AND tier_group_id IS NOT NULL AND is_active AND id NOT LIKE 'b5105g-%'`),
      ).toBe(0);
    });
  });

  it('re-run does not re-enable a generic row an admin switched off', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      await tx`UPDATE site_benchmarks SET is_active = false WHERE id = 'b5105g-m-var-elite'`;
      await tx`UPDATE benchmark_sets SET is_active = false WHERE id = 'set-5105g-m'`;
      await tx.unsafe(UP);
      expect((await tx`SELECT is_active FROM site_benchmarks WHERE id = 'b5105g-m-var-elite'`)[0].is_active).toBe(false);
      expect((await tx`SELECT is_active FROM benchmark_sets WHERE id = 'set-5105g-m'`)[0].is_active).toBe(false);
    });
  });

  it('down removes the generic rows/sets/items and reactivates the old ones', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      await tx.unsafe(DOWN);
      expect(await generic(tx)).toHaveLength(0);
      expect(await count(tx, `SELECT count(*)::int AS n FROM benchmark_sets WHERE id LIKE 'set-5105g-%'`)).toBe(0);
      expect(await count(tx, `SELECT count(*)::int AS n FROM benchmark_set_items WHERE set_id LIKE 'set-5105g-%'`)).toBe(0);
      expect(await count(tx, `SELECT count(*)::int AS n FROM site_benchmarks WHERE id LIKE 'b5105-%' AND is_active`)).toBe(200);
      expect(await count(tx, `SELECT count(*)::int AS n FROM benchmark_sets WHERE id LIKE 'set-5105-%' AND is_active`)).toBe(10);
      await tx.unsafe(UP); // forward again after down
      expect(await generic(tx)).toHaveLength(40);
    });
  });

  it('scores boundaries into the stated band (Male Varsity and Female D1)', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const tiersFor = async (prefix: string) =>
        (await tx`SELECT * FROM site_benchmarks WHERE id LIKE ${prefix} ORDER BY tier_order`).map((r: any) => ({
          tierOrder: r.tier_order, tierName: r.tier_name, minValue: r.min_value, maxValue: r.max_value,
          benchmarkValue: r.benchmark_value, comparisonOperator: r.comparison_operator, tierColor: r.tier_color,
        }));
      const male = await tiersFor('b5105g-m-var-%');
      const tierOf = (t: any[], v: number) => (evaluateTierBenchmark(v, true, t as any) as any)?.tierName;
      expect([4.29, 4.3, 4.5, 4.501, 4.75, 4.751].map((v) => tierOf(male, v))).toEqual([
        'Elite', 'Competitive', 'Competitive', 'Average', 'Average', 'Developing',
      ]);
      const fem = await tiersFor('b5105g-f-d1-%');
      expect([4.44, 4.45, 4.85, 4.86].map((v) => tierOf(fem, v))).toEqual(['Elite', 'Competitive', 'Average', 'Developing']);
    });
  });

  it('eval matching is unchanged: NULL-sport tiers never match, the 0129 Average rows still do', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const old = await tx`SELECT * FROM site_benchmarks WHERE id = ANY(${AVG_0129.map(([id]) => id)})`;
      const candidates = toCandidates([...(await generic(tx)), ...old]);
      const match = (gender: string, sport: string, birthDate: string, value: number) =>
        matchTierGroup({
          metricCode: 'AGILITY_5105', value, lowerIsBetter: true, eventDate: '2026-06-01',
          athlete: { gender, sport, birthDate }, candidates,
        });
      expect(match('Female', 'SOCCER', '2009-09-01', 5.0)).toMatchObject({ kind: 'average', status: 'at_or_better' });
      expect(match('Female', 'VOLLEYBALL', '2009-09-01', 5.5)).toMatchObject({ kind: 'average', status: 'below' });
      expect(match('Male', 'BASKETBALL', '2009-09-01', 4.6)).toBeNull();
      expect(selectTierGroup(candidates.filter((c) => c.gender === 'Male' && c.ageMin === 16))).toHaveLength(4);
    });
  });
});
