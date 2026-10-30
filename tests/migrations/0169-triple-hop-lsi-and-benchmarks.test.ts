/**
 * Migration 0169: HOP_SL_TRIPLE_LSI derived metric, LSI screening set and soccer distance tiers.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { evaluateFormula, validateFormula } from '../../packages/api/services/formula-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0169_add_triple_hop_lsi_and_benchmarks.sql');
const DOWN = read('0169_add_triple_hop_lsi_and_benchmarks_down.sql');

const FORMULA = '(min(HOP_SL_TRIPLE_L, HOP_SL_TRIPLE_R) / max(HOP_SL_TRIPLE_L, HOP_SL_TRIPLE_R)) * 100';
const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0169: static analysis', () => {
  it('declares the exact LSI formula and dependents', () => {
    expect(UP).toContain(`'${FORMULA}'`);
    expect(UP).toMatch(/ARRAY\['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R'\]/);
    expect(UP).toMatch(/ON CONFLICT \(code\) DO NOTHING/);
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('uses the research cutoffs, SOCCER, and a bare ON CONFLICT for sets', () => {
    expect(UP).toMatch(/90::numeric, 100::numeric/);
    expect(UP).toMatch(/85, 89\.999/);
    expect(UP).toMatch(/0, 84\.999/);
    expect(UP).toMatch(/'SOCCER'/);
    expect(UP).not.toMatch(/'Soccer'/);
    expect(UP.match(/^ON CONFLICT DO NOTHING;/gm)?.length).toBe(2); // bare: the partial unique index on site set names must not abort
  });
  it('raises unless both legs are in feet and warns against a manual re-run', () => {
    expect(UP).toMatch(/RAISE EXCEPTION 'Migration 0169: HOP_SL_TRIPLE_L \/ _R must be in ft/);
    expect(UP).toMatch(/^-- Do not re-run by hand/m);
  });
  it('down forgets its manual_migrations row and refuses while direct LSI data exists', () => {
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0169_add_triple_hop_lsi_and_benchmarks'/);
    expect(DOWN).toMatch(/is_calculated = false\) THEN\s+RAISE EXCEPTION/);
  });
});

describe('HOP_SL_TRIPLE_LSI formula', () => {
  it('is a valid formula over the two legs', () => {
    const result = validateFormula(FORMULA, ['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R']);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.referencedMetrics.sort()).toEqual(['hop_sl_triple_l', 'hop_sl_triple_r']);
  });
  it('gives shorter / longer x 100, whichever leg is shorter', () => {
    expect(evaluateFormula(FORMULA, { hop_sl_triple_l: 18, hop_sl_triple_r: 16.2 })).toBeCloseTo(90, 6);
    expect(evaluateFormula(FORMULA, { hop_sl_triple_l: 16.2, hop_sl_triple_r: 18 })).toBeCloseTo(90, 6);
    expect(evaluateFormula(FORMULA, { hop_sl_triple_l: 15, hop_sl_triple_r: 15 })).toBe(100);
  });
  it('gives null, not NaN, when both legs are 0 (0 / 0)', () => {
    expect(evaluateFormula(FORMULA, { hop_sl_triple_l: 0, hop_sl_triple_r: 0 })).toBeNull();
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0169: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  const rollbackable = async (fn: (tx: any) => Promise<void>) => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx) => {
        await tx`SET LOCAL session_replication_role = replica`; // fixtures skip FK checks
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  };

  const seed = async (tx: any, unit = 'ft') => {
    await tx`DELETE FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R', 'HOP_SL_TRIPLE_LSI')`;
    for (const code of ['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R']) {
      await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, display_order, validation_min, validation_max)
               VALUES (${code}, ${code}, 'power', ${unit}, 'higher_is_better', 77, 3, 33)`;
    }
    await tx`INSERT INTO organization_metrics (organization_id, metric_code, is_enabled) VALUES
               ('org-on', 'HOP_SL_TRIPLE_L', true), ('org-off', 'HOP_SL_TRIPLE_L', false)`;
  };

  const rows = async (tx: any) => ({
    metric: (await tx`SELECT * FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_LSI'`)[0],
    orgs: (await tx`SELECT organization_id FROM organization_metrics WHERE metric_code = 'HOP_SL_TRIPLE_LSI' ORDER BY 1`).map((r: any) => r.organization_id),
    sets: await tx`SELECT * FROM benchmark_sets WHERE id LIKE '%triple-hop%' ORDER BY id`,
    lsi: await tx`SELECT * FROM site_benchmarks WHERE metric_code = 'HOP_SL_TRIPLE_LSI' ORDER BY tier_order`,
    dist: await tx`SELECT * FROM site_benchmarks WHERE id LIKE 'bench-triple-hop-male-%' OR id LIKE 'bench-triple-hop-female-%' ORDER BY id`,
    items: await tx`SELECT set_id, count(*)::int AS n FROM benchmark_set_items WHERE set_id LIKE '%triple-hop%' GROUP BY set_id ORDER BY set_id`,
  });
  const num = (v: unknown) => Number(v);

  it('creates the derived metric, enables it for orgs that enable the left leg, and builds the LSI set', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const r = await rows(tx);
      expect(r.metric).toMatchObject({
        unit: '%', metric_type: 'higher_is_better', is_derived: true, formula: FORMULA, category: 'power', display_order: 77,
      });
      expect(r.metric.dependent_metrics).toEqual(['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R']);
      expect(r.orgs).toEqual(['org-on']);

      const set = r.sets.find((s: any) => s.id === 'set-screening-triple-hop-asymmetry');
      expect(set).toMatchObject({ gender: null, sport: null, organization_id: null, is_template: true });
      expect(r.lsi.map((b: any) => [b.tier_name, num(b.min_value), num(b.max_value), b.comparison_operator])).toEqual([
        ['Symmetrical', 90, 100, 'range'],
        ['Mild Deficit', 85, 89.999, 'range'],
        ['High Asymmetry Flag', 0, 84.999, 'range'],
      ]);
      expect(new Set(r.lsi.map((b: any) => b.tier_group_id)).size).toBe(1);
      expect(r.items.find((i: any) => i.set_id === 'set-screening-triple-hop-asymmetry').n).toBe(3);
    });
  });

  it('builds the male and female soccer distance tiers for both legs in feet', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const r = await rows(tx);
      expect(r.sets.filter((s: any) => s.sport === 'SOCCER').map((s: any) => [s.id, s.gender])).toEqual([
        ['set-soccer-triple-hop-female', 'Female'],
        ['set-soccer-triple-hop-male', 'Male'],
      ]);
      expect(r.dist).toHaveLength(16);
      const pick = (id: string) => r.dist.find((b: any) => b.id === id);
      const male = pick('bench-triple-hop-male-l-college');
      expect([num(male.min_value), num(male.max_value)]).toEqual([21, 99.999]); // fixed ceiling for the top tier
      expect(male).toMatchObject({ sport: 'SOCCER', gender: 'Male', level: null, metric_code: 'HOP_SL_TRIPLE_L', comparison_operator: 'range' });
      const fem = pick('bench-triple-hop-female-r-youth');
      expect([num(fem.min_value), num(fem.max_value)]).toEqual([13.1, 15.099]);
      expect(fem.metric_code).toBe('HOP_SL_TRIPLE_R');
      expect(pick('bench-triple-hop-male-r-below').min_value).toBe('0.000');
      // one tier group per (gender, leg), four tiers each
      const groups = new Map<string, number>();
      for (const b of r.dist) groups.set(b.tier_group_id, (groups.get(b.tier_group_id) ?? 0) + 1);
      expect([...groups.values()]).toEqual([4, 4, 4, 4]);
      // tiers of one group tile the range without gaps wider than the 0.001 step
      for (const gender of ['Male', 'Female']) {
        for (const code of ['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R']) {
          const group = r.dist.filter((b: any) => b.gender === gender && b.metric_code === code).sort((a: any, b: any) => a.tier_order - b.tier_order);
          for (let i = 0; i < group.length - 1; i++) expect(num(group[i].min_value) - num(group[i + 1].max_value)).toBeCloseTo(0.001, 6);
        }
      }
      expect(r.items.filter((i: any) => i.set_id.startsWith('set-soccer')).map((i: any) => i.n)).toEqual([8, 8]);
    });
  });

  it('a second run changes nothing', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const once = await rows(tx);
      await tx.unsafe(UP);
      expect(await rows(tx)).toEqual(once);
    });
  });

  it('skips everything when the legs do not exist', async () => {
    await rollbackable(async (tx) => {
      await tx`DELETE FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R', 'HOP_SL_TRIPLE_LSI')`;
      await tx.unsafe(UP);
      const r = await rows(tx);
      expect(r.metric).toBeUndefined();
      expect(r.sets).toHaveLength(0);
      expect(r.dist).toHaveLength(0);
    });
  });

  it('raises while a leg is still in meters', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx`UPDATE site_metrics SET unit = 'm' WHERE code = 'HOP_SL_TRIPLE_L'`;
      await expect(tx.unsafe(UP)).rejects.toThrow(/must be in ft/);
    });
  });

  it('down removes everything it added and forgets the tracking row', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units, is_calculated, calculated_from_measurement_ids, calculation_metadata)
               VALUES ('u-hop', 'u-hop', '2026-01-01', 17, 'HOP_SL_TRIPLE_LSI', 90, '%', true, ARRAY[]::text[], ${tx.json({})})`;
      await tx`CREATE TABLE IF NOT EXISTS manual_migrations (id SERIAL PRIMARY KEY, migration_name TEXT NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT NOW())`;
      await tx`INSERT INTO manual_migrations (migration_name) VALUES ('0169_add_triple_hop_lsi_and_benchmarks') ON CONFLICT DO NOTHING`;
      await tx`INSERT INTO benchmark_sets (id, organization_id, name, is_template, is_active) VALUES ('set-org-pick', 'org-on', 'org pick', false, true)`;
      await tx`INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
               VALUES ('bsi-org-pick', 'set-org-pick', 'bench-triple-hop-lsi-flag', 'site', 1)`;
      await tx.unsafe(DOWN);
      expect(await tx`SELECT 1 FROM benchmark_set_items WHERE id = 'bsi-org-pick'`).toHaveLength(0);
      const r = await rows(tx);
      expect(r.metric).toBeUndefined();
      expect(r.orgs).toEqual([]);
      expect(r.sets).toHaveLength(0);
      expect(r.lsi).toHaveLength(0);
      expect(r.dist).toHaveLength(0);
      expect(r.items).toHaveLength(0);
      expect(await tx`SELECT 1 FROM measurements WHERE metric = 'HOP_SL_TRIPLE_LSI'`).toHaveLength(0);
      expect(await tx`SELECT 1 FROM manual_migrations WHERE migration_name = '0169_add_triple_hop_lsi_and_benchmarks'`).toHaveLength(0);
    });
  });

  it('down refuses while a goal references the LSI metric', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      await tx`INSERT INTO goals (user_id, metric, goal_type, target_value, baseline_value, current_value, target_date)
               VALUES ('u-hop', 'HOP_SL_TRIPLE_LSI', 'improvement', 95, 85, 90, '2026-12-31')`;
      await expect(tx.unsafe(DOWN)).rejects.toThrow(/goals, report benchmarks or custom benchmarks reference/);
    });
  });

  it('down refuses while a direct LSI measurement exists', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units, is_calculated)
               VALUES ('u-hop', 'u-hop', '2026-01-01', 17, 'HOP_SL_TRIPLE_LSI', 90, '%', false)`;
      await expect(tx.unsafe(DOWN)).rejects.toThrow(/direct HOP_SL_TRIPLE_LSI measurements exist/);
    });
  });
});
