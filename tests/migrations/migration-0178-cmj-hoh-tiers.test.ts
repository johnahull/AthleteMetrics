/**
 * Migration 0178: age-group tiers for JUMP_CMJ_HOH (counter-movement jump, hands on hips, inches) per sex.
 * 32 tier rows (2 sexes x 4 levels x 4 tiers, id prefix cmjhoh-), 2 template sets, auto-enabled for every organization.
 * Source: OVR Performance "CMJ Height Normative Data". Live checks run in a rolled-back transaction and only on a
 * disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { deriveTierGroupName } from '../../packages/shared/benchmark-utils';
import {
  evaluateTierBenchmark,
  filterTierRowsForAthlete,
  selectTierGroup,
} from '../../packages/api/services/benchmark-tiers';
import { matchTierGroup, type TierCandidateRow } from '../../packages/api/services/eval-report/tier-match';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0178_seed_cmj_hoh_tiers';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

/** [Good, Advanced, Elite] lower bounds, inches. Average is everything below Good. */
const BANDS = [
  { sex: 'Male', lcode: 'ms', level: 'MS', age: [11, 13], cuts: [14.9, 17.0, 19.2] },
  { sex: 'Male', lcode: 'hs', level: 'HS', age: [14, 18], cuts: [19.2, 21.3, 22.4] },
  { sex: 'Male', lcode: 'col', level: 'College', age: [19, 22], cuts: [20.4, 22.4, 23.5] },
  { sex: 'Male', lcode: 'pro', level: 'Pro', age: [23, null], cuts: [21.3, 23.5, 24.5] },
  { sex: 'Female', lcode: 'ms', level: 'MS', age: [11, 13], cuts: [11.7, 13.8, 16.0] },
  { sex: 'Female', lcode: 'hs', level: 'HS', age: [14, 18], cuts: [14.9, 17.0, 18.1] },
  { sex: 'Female', lcode: 'col', level: 'College', age: [19, 22], cuts: [16.0, 18.1, 19.2] },
  { sex: 'Female', lcode: 'pro', level: 'Pro', age: [23, null], cuts: [17.0, 19.2, 20.2] },
] as const;

describe('Migration 0178: static analysis', () => {
  it('has no transaction control; down forgets its manual_migrations row (guarded)', () => {
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(DOWN).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(DOWN).toContain("to_regclass('manual_migrations')");
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });

  it('carries each cutoff triple on its own sex / level row', () => {
    BANDS.forEach(({ sex, lcode, level, age, cuts }, i) => {
      const lord = (i % 4) + 1;
      const row = new RegExp(
        `\\('${sex}',\\s+${lord},\\s+'${lcode}',\\s+'[^']+',\\s+'${level}',\\s+${age[0]},\\s+(NULL::int|${age[1]}),\\s+${cuts.map((c) => c.toFixed(1)).join(',\\s+')}\\)`,
      );
      expect(UP).toMatch(row);
    });
  });

  it('never deletes and never re-enables on upsert', () => {
    expect(UP).not.toMatch(/DELETE\s+FROM/i);
    for (const m of UP.matchAll(/ON CONFLICT[^;]*?DO UPDATE SET([^;]*);/g)) expect(m[1]).not.toMatch(/is_active\s*=/);
  });
});

type Row = {
  id: string; name: string; sport: string | null; is_active: boolean; gender: string; level: string;
  age_min: number | null; age_max: number | null; tier_order: number; tier_group_id: string; tier_name: string;
  tier_color: string; min_value: string; max_value: string; display_order: number; [k: string]: unknown;
};
type Tx = postgres.TransactionSql;

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

// DB-backed block: only under vitest.integration.config.ts (npm run test:integration), NODE_ENV=test and a localhost
// DATABASE_URL or CI=true. CI test DBs are db:push + default seed, so the test creates its own site_metrics row.
describe.skipIf(!isDisposableTestDb)('Migration 0178: against a disposable DB (rolled back)', () => {
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
        await tx`ALTER TABLE site_benchmarks ALTER COLUMN id TYPE varchar(36)`;
        await tx`INSERT INTO site_metrics (code, label, metric_type, unit) VALUES ('JUMP_CMJ_HOH', 'CMJ HOH', 'higher_is_better', 'in') ON CONFLICT (code) DO NOTHING`;
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  };
  const seeded = (tx: Tx) => tx<Row[]>`SELECT * FROM site_benchmarks WHERE metric_code = 'JUMP_CMJ_HOH' AND id LIKE 'cmjhoh-%' ORDER BY id`;
  const count = async (tx: Tx, q: string) => (await tx.unsafe(q))[0].n as number;
  const toCandidates = (rows: Row[]): TierCandidateRow[] =>
    rows.map((r) => ({
      ...r,
      metricCode: r.metric_code as string,
      tierGroupId: r.tier_group_id,
      tierOrder: r.tier_order,
      tierName: r.tier_name,
      minValue: r.min_value,
      maxValue: r.max_value,
      comparisonOperator: r.comparison_operator as string,
      displayOrder: r.display_order,
      ageMin: r.age_min,
      ageMax: r.age_max,
      _source: 'site',
    }));

  it('seeds 32 active sport-less rows in 8 groups, 2 template sets with 16 items each; twice is idempotent', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      const rows = await seeded(tx);
      expect(rows).toHaveLength(32);
      expect(rows.every((r) => r.is_active && r.sport === null && r.id.length <= 36 && r.name.length <= 100)).toBe(true);
      const groups = new Map<string, Row[]>();
      for (const r of rows) groups.set(r.tier_group_id, [...(groups.get(r.tier_group_id) ?? []), r]);
      expect(groups.size).toBe(8);
      for (const g of groups.values()) {
        expect(g).toHaveLength(4);
        expect(new Set(g.map((r) => deriveTierGroupName(r.name))).size).toBe(1);
        expect(g.sort((a, b) => a.tier_order - b.tier_order).map((r) => r.tier_name)).toEqual(['Elite', 'Advanced', 'Good', 'Average']);
        expect(g.map((r) => r.tier_color)).toEqual(['green', 'blue', 'gray', 'yellow']);
      }
      const sets = await tx`SELECT * FROM benchmark_sets WHERE id LIKE 'set-cmjhoh-%' ORDER BY name`;
      expect(sets.map((s) => [s.gender, s.sport, s.is_template, s.is_active])).toEqual([
        ['Female', null, true, true],
        ['Male', null, true, true],
      ]);
      for (const s of sets) {
        expect(await count(tx, `SELECT count(*)::int AS n FROM benchmark_set_items WHERE set_id = '${s.id}'`)).toBe(16);
      }
    });
  });

  it('bands match the chart: open bottom, closed gaps, contiguous with 0.001 stepping, Elite open to 50', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const rows = await seeded(tx);
      for (const b of BANDS) {
        const g = rows
          .filter((r) => r.gender === b.sex && r.level === b.level)
          .sort((x, y) => x.tier_order - y.tier_order);
        expect(g).toHaveLength(4);
        const [c1, c2, c3] = b.cuts;
        expect(g.map((r) => [Number(r.min_value), Number(r.max_value)])).toEqual([
          [c3, 50],
          [c2, +(c3 - 0.001).toFixed(3)],
          [c1, +(c2 - 0.001).toFixed(3)],
          [0, +(c1 - 0.001).toFixed(3)],
        ]);
        expect([g[0].age_min, g[0].age_max]).toEqual(b.age);
      }
    });
  });

  it('scores boundaries into the stated band, using the athlete sex and age group', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const rows = toCandidates(await seeded(tx)) as any[];
      const tierFor = (gender: string, age: number, v: number) => {
        const t = selectTierGroup(filterTierRowsForAthlete(rows, { gender, age }));
        return (evaluateTierBenchmark(v, false, t as any) as any)?.tierName;
      };
      expect(tierFor('Male', 16, 22.4)).toBe('Elite');
      expect(tierFor('Male', 16, 22.399)).toBe('Advanced');
      expect(tierFor('Male', 20, 20.3)).toBe('Average'); // closed College gap (chart skips 20.2-20.4)
      expect(tierFor('Male', 20, 20.4)).toBe('Good');
      expect(tierFor('Female', 12, 5)).toBe('Average'); // open bottom
      expect(tierFor('Female', 16, 18.1)).toBe('Elite');
      expect(tierFor('Male', 30, 24.5)).toBe('Elite'); // Pro has no upper age
      expect(tierFor('Male', 30, 23.0)).toBe('Good');
      // each athlete resolves to exactly one level group
      for (const [gender, age] of [['Male', 11], ['Male', 13], ['Female', 14], ['Female', 18], ['Male', 19], ['Female', 22], ['Male', 23], ['Female', 60]] as const) {
        expect(new Set(filterTierRowsForAthlete(rows, { gender, age }).map((r) => r.tierGroupId)).size).toBe(1);
      }
      // ages below 11 match no group
      expect(filterTierRowsForAthlete(rows, { gender: 'Male', age: 10 })).toHaveLength(0);
    });
  });

  it('eval matching is unchanged: NULL-sport tiers never match', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const candidates = toCandidates(await seeded(tx));
      const match = (gender: string, sport: string) =>
        matchTierGroup({
          metricCode: 'JUMP_CMJ_HOH', value: 20, lowerIsBetter: false, eventDate: '2026-06-01',
          athlete: { gender, sport, birthDate: '2009-09-01' }, candidates,
        });
      expect(match('Female', 'SOCCER')).toBeNull();
      expect(match('Male', 'BASKETBALL')).toBeNull();
    });
  });

  it('gives the 32 rows distinct display_order (Female offset by 100)', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      const orders = (await seeded(tx)).map((r) => Number(r.display_order));
      expect(new Set(orders).size).toBe(32);
      expect(Math.min(...orders)).toBe(11);
      expect(Math.max(...orders)).toBe(144);
    });
  });

  it('re-run does not re-enable a row or set an admin switched off', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      await tx`UPDATE site_benchmarks SET is_active = false WHERE id = 'cmjhoh-m-hs-elite'`;
      await tx`UPDATE benchmark_sets SET is_active = false WHERE id = 'set-cmjhoh-m'`;
      await tx.unsafe(UP);
      expect((await tx`SELECT is_active FROM site_benchmarks WHERE id = 'cmjhoh-m-hs-elite'`)[0].is_active).toBe(false);
      expect((await tx`SELECT is_active FROM benchmark_sets WHERE id = 'set-cmjhoh-m'`)[0].is_active).toBe(false);
    });
  });

  describe('auto-enable for every organization', () => {
    const enabled = (tx: Tx, org: string) =>
      tx`SELECT benchmark_id, is_enabled, display_order FROM organization_benchmarks
          WHERE organization_id = ${org} AND benchmark_id LIKE 'cmjhoh-%' ORDER BY display_order`;
    const seedOrg = async (tx: Tx, org: string, existing: Array<[string, number]> = []) => {
      await tx`INSERT INTO organizations (id, name) VALUES (${org}, ${org})`;
      for (const [bid, ord] of existing) {
        await tx`INSERT INTO organization_benchmarks (organization_id, benchmark_id, benchmark_type, is_enabled, display_order)
                 VALUES (${org}, ${bid}, 'site', true, ${ord})`;
      }
    };

    it('enables all 32 rows for orgs with and without existing enablements; display_order continues after the max', async () => {
      await rollbackable(async (tx) => {
        await seedOrg(tx, 'org-empty');
        await seedOrg(tx, 'org-busy', [['some-other', 7], ['another', 42]]);
        await tx.unsafe(UP);
        const a = await enabled(tx, 'org-empty');
        expect(a).toHaveLength(32);
        expect(a.every((r) => r.is_enabled)).toBe(true);
        const b = (await enabled(tx, 'org-busy')).map((r) => Number(r.display_order));
        expect(b).toHaveLength(32);
        expect(Math.min(...b)).toBe(43);
        expect(new Set(b).size).toBe(32);
      });
    });

    it('is idempotent and never re-enables a row an admin disabled', async () => {
      await rollbackable(async (tx) => {
        await seedOrg(tx, 'org-f');
        await tx.unsafe(UP);
        await tx`UPDATE organization_benchmarks SET is_enabled = false WHERE organization_id = 'org-f' AND benchmark_id = 'cmjhoh-m-hs-elite'`;
        await tx.unsafe(UP);
        const rows = await enabled(tx, 'org-f');
        expect(rows).toHaveLength(32);
        expect(rows.filter((r) => !r.is_enabled).map((r) => r.benchmark_id)).toEqual(['cmjhoh-m-hs-elite']);
      });
    });
  });

  it('down removes rows, sets, items and enablements, touches nothing else, and can go forward again', async () => {
    await rollbackable(async (tx) => {
      await tx`INSERT INTO organizations (id, name) VALUES ('org-g', 'org-g')`;
      await tx`INSERT INTO organization_benchmarks (organization_id, benchmark_id, benchmark_type, is_enabled, display_order)
               VALUES ('org-g', 'keep-me', 'site', true, 1)`;
      await tx.unsafe(UP);
      await tx.unsafe(DOWN);
      expect(await seeded(tx)).toHaveLength(0);
      expect(await count(tx, `SELECT count(*)::int AS n FROM benchmark_sets WHERE id LIKE 'set-cmjhoh-%'`)).toBe(0);
      expect(await count(tx, `SELECT count(*)::int AS n FROM benchmark_set_items WHERE set_id LIKE 'set-cmjhoh-%'`)).toBe(0);
      expect(await count(tx, `SELECT count(*)::int AS n FROM organization_benchmarks WHERE benchmark_id LIKE 'cmjhoh-%'`)).toBe(0);
      expect(await count(tx, `SELECT count(*)::int AS n FROM organization_benchmarks WHERE benchmark_id = 'keep-me'`)).toBe(1);
      await tx.unsafe(UP);
      expect(await seeded(tx)).toHaveLength(32);
    });
  });
});
