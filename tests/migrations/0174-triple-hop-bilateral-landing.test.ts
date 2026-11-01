/**
 * Migration 0174: single-leg triple hop, bilateral landing (HOP_SL_TRIPLE_BL_L / _R), its LSI and the LSI screening set.
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
const UP = read('0174_add_triple_hop_bilateral_landing.sql');
const DOWN = read('0174_add_triple_hop_bilateral_landing_down.sql');
const UP_0169 = read('0169_add_triple_hop_lsi_and_benchmarks.sql');

const FORMULA =
  '(min(HOP_SL_TRIPLE_BL_L, HOP_SL_TRIPLE_BL_R) / max(HOP_SL_TRIPLE_BL_L, HOP_SL_TRIPLE_BL_R)) * 100';
const BL_CODES = ['HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R', 'HOP_SL_TRIPLE_BL_LSI'];
const SET_ID = 'set-screening-triple-hop-bl-asymmetry';
const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

const quoted = (sql: string, re: RegExp) => new Set(sql.match(re) ?? []);

describe('Migration 0174: static analysis', () => {
  it('copies both legs from the stick-landing rows with inline VALUES and never overwrites a row', () => {
    expect(UP).toMatch(/INSERT INTO site_metrics/);
    expect(UP).toMatch(/\('HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_L',/);
    expect(UP).toMatch(/\('HOP_SL_TRIPLE_BL_R', 'HOP_SL_TRIPLE_R',/);
    expect(UP).toMatch(/ON CONFLICT \(code\) DO NOTHING/);
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('declares the exact LSI formula and dependents', () => {
    expect(UP).toContain(`'${FORMULA}'`);
    expect(UP).toMatch(/ARRAY\['HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R'\]/);
  });
  it('uses the 0169 screening cutoffs and a bare ON CONFLICT for the one set', () => {
    expect(UP).toMatch(/90::numeric, 100::numeric/);
    expect(UP).toMatch(/85, 89\.999/);
    expect(UP).toMatch(/0, 84\.999/);
    expect(UP.match(/^ON CONFLICT DO NOTHING;/gm)?.length).toBe(1); // bare: the partial unique index on site set names must not abort
  });
  it('seeds no distance tiers (no published norms for a two-foot landing)', () => {
    expect(UP).not.toMatch(/SOCCER/);
    expect(UP).not.toMatch(/bench-triple-hop-bl-(male|female)/);
  });
  it('shares no benchmark id, set id, item id or set name with 0169', () => {
    const idRe = /'(?:bench|set|bsi)-[a-z0-9-]+'/g;
    const mine = quoted(UP, idRe);
    const theirs = quoted(UP_0169, idRe);
    expect(mine.size).toBeGreaterThan(0);
    for (const id of mine) expect(theirs.has(id)).toBe(false);
    // 0169's down deletes by these prefixes, so none of ours may match them
    for (const id of mine) expect(id).not.toMatch(/^'bench-triple-hop-(male|female)-/);
    const name = UP.match(/'(Triple Hop Bilateral Landing Asymmetry Screening)'/)?.[1];
    expect(name).toBeDefined();
    expect(UP_0169).not.toContain(`'${name}'`);
  });
  it('gives the legs their own explanation text instead of copying the stick-landing text', () => {
    expect(UP).toMatch(/\bn\.short_description, n\.what_it_measures, n\.why_it_matters\b/);
    expect(UP).not.toMatch(/\bsrc\.(short_description|what_it_measures|why_it_matters|description)\b/);
  });
  it('raises unless both legs are in feet and warns against a manual re-run', () => {
    expect(UP).toMatch(/RAISE EXCEPTION 'Migration 0174: HOP_SL_TRIPLE_L \/ _R must be in ft/);
    expect(UP).toMatch(/^-- Do not re-run by hand/m);
  });
  it('down forgets its manual_migrations row and refuses while real data references the new metrics', () => {
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0174_add_triple_hop_bilateral_landing'/);
    expect(DOWN).toMatch(/is_calculated = false\) THEN\s+RAISE EXCEPTION/);
    expect(DOWN).toMatch(/metric IN \('HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R'\)/);
    expect(DOWN).toMatch(/FROM goals/);
    expect(DOWN).toMatch(/FROM report_benchmarks/);
    expect(DOWN).toMatch(/FROM custom_benchmarks/);
    expect(DOWN).toMatch(/FROM reports/);
    expect(DOWN).toMatch(/FROM report_templates/);
    expect(DOWN).toMatch(/DELETE FROM site_metric_explanations/);
  });
});

describe('HOP_SL_TRIPLE_BL_LSI formula', () => {
  it('is a valid formula over the two legs', () => {
    const result = validateFormula(FORMULA, ['HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R']);
    expect(result.errors).toEqual([]);
    expect(result.valid).toBe(true);
    expect(result.referencedMetrics.sort()).toEqual(['hop_sl_triple_bl_l', 'hop_sl_triple_bl_r']);
  });
  it('gives shorter / longer x 100, whichever leg is shorter', () => {
    expect(evaluateFormula(FORMULA, { hop_sl_triple_bl_l: 18, hop_sl_triple_bl_r: 16.2 })).toBeCloseTo(90, 6);
    expect(evaluateFormula(FORMULA, { hop_sl_triple_bl_l: 16.2, hop_sl_triple_bl_r: 18 })).toBeCloseTo(90, 6);
    expect(evaluateFormula(FORMULA, { hop_sl_triple_bl_l: 15, hop_sl_triple_bl_r: 15 })).toBe(100);
  });
  it('gives null, not NaN, when both legs are 0 (0 / 0)', () => {
    expect(evaluateFormula(FORMULA, { hop_sl_triple_bl_l: 0, hop_sl_triple_bl_r: 0 })).toBeNull();
  });
  it('does not read the stick-landing legs', () => {
    // a variable named HOP_SL_TRIPLE_L must not match inside HOP_SL_TRIPLE_BL_L
    const result = validateFormula(FORMULA, ['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R']);
    expect(result.valid).toBe(false);
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0174: against a disposable DB (rolled back)', () => {
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

  const STICK_TEXT = 'stick-landing text';
  const clear = (tx: any) =>
    tx`DELETE FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R', 'HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R', 'HOP_SL_TRIPLE_BL_LSI')`;

  // The stick-landing legs are created in the admin UI, no migration creates them: the tests supply them.
  const seed = async (tx: any, unit = 'ft') => {
    await clear(tx);
    for (const code of ['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R']) {
      await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, display_order, validation_min, validation_max,
                                         decimal_precision, color, icon, description, short_description, what_it_measures, why_it_matters,
                                         is_system_default, is_active)
               VALUES (${code}, ${'Single-Leg Triple Hop ' + code}, 'power', ${unit}, 'higher_is_better', 77, 3, 33,
                       2, 'blue', 'Zap', ${STICK_TEXT}, ${STICK_TEXT}, ${STICK_TEXT}, ${STICK_TEXT}, true, true)`;
    }
    await tx`INSERT INTO organization_metrics (organization_id, metric_code, is_enabled) VALUES
               ('org-on', 'HOP_SL_TRIPLE_L', true), ('org-off', 'HOP_SL_TRIPLE_L', false)`;
  };

  const rows = async (tx: any) => ({
    legs: await tx`SELECT * FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R') ORDER BY code`,
    lsi: (await tx`SELECT * FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_BL_LSI'`)[0],
    orgs: await tx`SELECT organization_id, metric_code FROM organization_metrics WHERE metric_code LIKE 'HOP_SL_TRIPLE_BL_%' ORDER BY 2, 1`,
    sets: await tx`SELECT * FROM benchmark_sets WHERE id LIKE '%triple-hop%' ORDER BY id`,
    tiers: await tx`SELECT * FROM site_benchmarks WHERE metric_code LIKE 'HOP_SL_TRIPLE_BL_%' ORDER BY tier_order`,
    items: await tx`SELECT set_id, count(*)::int AS n FROM benchmark_set_items WHERE set_id LIKE '%triple-hop%' GROUP BY set_id ORDER BY set_id`,
  });
  const num = (v: unknown) => Number(v);

  it('creates both legs from the stick-landing rows with their own explanation text', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const { legs } = await rows(tx);
      expect(legs.map((l: any) => l.code)).toEqual(['HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R']);
      for (const leg of legs) {
        expect(leg).toMatchObject({
          unit: 'ft', category: 'power', metric_type: 'higher_is_better', display_order: 77,
          decimal_precision: 2, color: 'blue', icon: 'Zap', is_derived: false, is_active: true,
        });
        expect([num(leg.validation_min), num(leg.validation_max)]).toEqual([3, 33]);
        for (const col of ['description', 'short_description', 'what_it_measures', 'why_it_matters']) {
          expect(leg[col]).toBeTruthy();
          expect(leg[col]).not.toBe(STICK_TEXT);
        }
      }
      expect(legs[0].label).toBe('Single-Leg Triple Hop, Bilateral Landing (Left Leg)');
      expect(legs[1].label).toBe('Single-Leg Triple Hop, Bilateral Landing (Right Leg)');
      expect(legs[0].description).toMatch(/left leg/i);
      expect(legs[1].description).toMatch(/right leg/i);
      expect(legs[0].description).toMatch(/both feet/i);
    });
  });

  it('creates the derived LSI over the two new legs', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const { lsi } = await rows(tx);
      expect(lsi).toMatchObject({
        unit: '%', metric_type: 'higher_is_better', is_derived: true, formula: FORMULA, category: 'power', display_order: 77,
      });
      expect(lsi.dependent_metrics).toEqual(['HOP_SL_TRIPLE_BL_L', 'HOP_SL_TRIPLE_BL_R']);
      expect(lsi.calculation_config).toEqual({ dateMatchStrategy: 'same_date', missingSourceBehavior: 'skip' });
      expect([num(lsi.validation_min), num(lsi.validation_max)]).toEqual([0, 100]);
    });
  });

  it('enables all three codes only for organizations that enable the stick-landing left leg', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const { orgs } = await rows(tx);
      expect(orgs.map((o: any) => [o.metric_code, o.organization_id])).toEqual([
        ['HOP_SL_TRIPLE_BL_L', 'org-on'],
        ['HOP_SL_TRIPLE_BL_LSI', 'org-on'],
        ['HOP_SL_TRIPLE_BL_R', 'org-on'],
      ]);
    });
  });

  it('keeps an admin choice: an existing organization row is not overridden', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx`INSERT INTO organization_metrics (organization_id, metric_code, is_enabled) VALUES ('org-on', 'HOP_SL_TRIPLE_BL_R', false)`;
      await tx.unsafe(UP);
      const { orgs } = await rows(tx);
      expect(orgs.find((o: any) => o.metric_code === 'HOP_SL_TRIPLE_BL_R')).toBeDefined();
      const [r] = await tx`SELECT is_enabled FROM organization_metrics WHERE organization_id = 'org-on' AND metric_code = 'HOP_SL_TRIPLE_BL_R'`;
      expect(r.is_enabled).toBe(false);
    });
  });

  it('builds the LSI screening set with three tiers and no distance tiers', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const r = await rows(tx);
      expect(r.sets.map((s: any) => s.id)).toEqual([SET_ID]);
      expect(r.sets[0]).toMatchObject({ gender: null, sport: null, organization_id: null, is_template: true, is_active: true });
      expect(r.tiers.map((b: any) => [b.id, b.metric_code, b.tier_name, num(b.min_value), num(b.max_value), b.comparison_operator])).toEqual([
        ['bench-triple-hop-bl-lsi-symmetrical', 'HOP_SL_TRIPLE_BL_LSI', 'Symmetrical', 90, 100, 'range'],
        ['bench-triple-hop-bl-lsi-mild', 'HOP_SL_TRIPLE_BL_LSI', 'Mild Deficit', 85, 89.999, 'range'],
        ['bench-triple-hop-bl-lsi-flag', 'HOP_SL_TRIPLE_BL_LSI', 'High Asymmetry Flag', 0, 84.999, 'range'],
      ]);
      expect(new Set(r.tiers.map((b: any) => b.tier_group_id)).size).toBe(1);
      expect(r.items).toEqual([{ set_id: SET_ID, n: 3 }]);
    });
  });

  it('leaves the stick-landing rows exactly as they were', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      const before = await tx`SELECT * FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R') ORDER BY code`;
      await tx.unsafe(UP);
      expect(await tx`SELECT * FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R') ORDER BY code`).toEqual(before);
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

  it('skips everything when the stick-landing legs do not exist', async () => {
    await rollbackable(async (tx) => {
      await clear(tx);
      await tx.unsafe(UP);
      const r = await rows(tx);
      expect(r.legs).toHaveLength(0);
      expect(r.lsi).toBeUndefined();
      expect(r.sets).toHaveLength(0);
      expect(r.tiers).toHaveLength(0);
    });
  });

  it('creates nothing, not half a pair, when only one stick-landing leg exists', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx`DELETE FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_R'`;
      await tx.unsafe(UP);
      const r = await rows(tx);
      expect(r.legs).toHaveLength(0);
      expect(r.lsi).toBeUndefined();
      expect(r.sets).toHaveLength(0);
    });
  });

  it('raises while a leg is still in meters', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx`UPDATE site_metrics SET unit = 'm' WHERE code = 'HOP_SL_TRIPLE_L'`;
      await expect(tx.unsafe(UP)).rejects.toThrow(/must be in ft/);
    });
  });

  it('raises when the only stick-landing leg that exists is still in meters', async () => {
    await rollbackable(async (tx) => {
      await seed(tx, 'm');
      await tx`DELETE FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_R'`;
      await expect(tx.unsafe(UP)).rejects.toThrow(/must be in ft/);
    });
  });

  describe('down', () => {
    it('removes everything it added, forgets the tracking row, and keeps the stick-landing rows', async () => {
      await rollbackable(async (tx) => {
        await seed(tx);
        const stick = await tx`SELECT * FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R') ORDER BY code`;
        await tx.unsafe(UP);
        await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units, is_calculated, calculated_from_measurement_ids, calculation_metadata)
                 VALUES ('u-hop', 'u-hop', '2026-01-01', 17, 'HOP_SL_TRIPLE_BL_LSI', 90, '%', true, ARRAY[]::text[], ${tx.json({})})`;
        await tx`INSERT INTO site_metric_explanations (metric_code, title) VALUES ('HOP_SL_TRIPLE_BL_L', 'x'), ('HOP_SL_TRIPLE_L', 'keep')`;
        await tx`CREATE TABLE IF NOT EXISTS manual_migrations (id SERIAL PRIMARY KEY, migration_name TEXT NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT NOW())`;
        await tx`INSERT INTO manual_migrations (migration_name) VALUES ('0174_add_triple_hop_bilateral_landing') ON CONFLICT DO NOTHING`;
        await tx`INSERT INTO benchmark_sets (id, organization_id, name, is_template, is_active) VALUES ('set-org-pick', 'org-on', 'org pick', false, true)`;
        await tx`INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
                 VALUES ('bsi-org-pick', 'set-org-pick', 'bench-triple-hop-bl-lsi-flag', 'site', 1)`;
        await tx`INSERT INTO organization_benchmarks (organization_id, benchmark_id, benchmark_type, is_enabled)
                 VALUES ('org-on', 'bench-triple-hop-bl-lsi-flag', 'site', true)`;
        await tx.unsafe(DOWN);
        expect(await tx`SELECT 1 FROM benchmark_set_items WHERE id = 'bsi-org-pick'`).toHaveLength(0);
        expect(await tx`SELECT 1 FROM organization_benchmarks WHERE benchmark_id = 'bench-triple-hop-bl-lsi-flag'`).toHaveLength(0);
        const r = await rows(tx);
        expect(r.legs).toHaveLength(0);
        expect(r.lsi).toBeUndefined();
        expect(r.orgs).toHaveLength(0);
        expect(r.sets.map((s: any) => s.id)).toEqual([]);
        expect(r.tiers).toHaveLength(0);
        expect(r.items).toHaveLength(0);
        expect(await tx`SELECT 1 FROM measurements WHERE metric = 'HOP_SL_TRIPLE_BL_LSI'`).toHaveLength(0);
        expect((await tx`SELECT metric_code FROM site_metric_explanations WHERE metric_code LIKE 'HOP_SL_TRIPLE_%'`).map((e: any) => e.metric_code)).toEqual(['HOP_SL_TRIPLE_L']);
        expect(await tx`SELECT 1 FROM manual_migrations WHERE migration_name = '0174_add_triple_hop_bilateral_landing'`).toHaveLength(0);
        expect(await tx`SELECT * FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R') ORDER BY code`).toEqual(stick);
        expect(await tx`SELECT 1 FROM organization_metrics WHERE metric_code = 'HOP_SL_TRIPLE_L'`).toHaveLength(2);
      });
    });

    it('also removes benchmarks an admin added for the new legs, with their set items and org picks, and leaves look-alike codes alone', async () => {
      await rollbackable(async (tx) => {
        await seed(tx);
        await tx.unsafe(UP);
        // 'HOP_SL_TRIPLE_BLXL' matches LIKE 'HOP_SL_TRIPLE_BL_%' (underscore = any char) but is not one of ours
        await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type) VALUES ('HOP_SL_TRIPLE_BLXL', 'lookalike', 'power', 'ft', 'higher_is_better')`;
        await tx`INSERT INTO organization_metrics (organization_id, metric_code, is_enabled) VALUES ('org-on', 'HOP_SL_TRIPLE_BLXL', true)`;
        await tx`INSERT INTO site_benchmarks (id, metric_code, name, comparison_operator, min_value, max_value, is_system_default, is_active)
                 VALUES ('bench-admin-bl-l', 'HOP_SL_TRIPLE_BL_L', 'admin tier', 'range', 15, 20, false, true),
                        ('bench-lookalike', 'HOP_SL_TRIPLE_BLXL', 'lookalike tier', 'range', 15, 20, false, true)`;
        // 'set-org-pick' is not seeded: the rollbackable helper turns FK checks off (session_replication_role = replica)
        await tx`INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
                 VALUES ('bsi-admin-bl-l', 'set-org-pick', 'bench-admin-bl-l', 'site', 1)`;
        await tx`INSERT INTO organization_benchmarks (organization_id, benchmark_id, benchmark_type, is_enabled)
                 VALUES ('org-on', 'bench-admin-bl-l', 'site', true)`;
        await tx.unsafe(DOWN);
        expect(await tx`SELECT 1 FROM site_benchmarks WHERE id = 'bench-admin-bl-l'`).toHaveLength(0);
        expect(await tx`SELECT 1 FROM benchmark_set_items WHERE id = 'bsi-admin-bl-l'`).toHaveLength(0);
        expect(await tx`SELECT 1 FROM organization_benchmarks WHERE benchmark_id = 'bench-admin-bl-l'`).toHaveLength(0);
        expect(await tx`SELECT 1 FROM site_benchmarks WHERE id = 'bench-lookalike'`).toHaveLength(1);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_BLXL'`).toHaveLength(1);
        expect(await tx`SELECT 1 FROM organization_metrics WHERE metric_code = 'HOP_SL_TRIPLE_BLXL'`).toHaveLength(1);
      });
    });

    const refuses = (name: string, setup: (tx: any) => Promise<void>, message: RegExp) =>
      it(name, async () => {
        await rollbackable(async (tx) => {
          await seed(tx);
          await tx.unsafe(UP);
          await setup(tx);
          await expect(tx.unsafe(DOWN)).rejects.toThrow(message);
        });
      });

    refuses('refuses while a direct LSI measurement exists', async (tx) => {
      await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units, is_calculated)
               VALUES ('u-hop', 'u-hop', '2026-01-01', 17, 'HOP_SL_TRIPLE_BL_LSI', 90, '%', false)`;
    }, /direct HOP_SL_TRIPLE_BL_LSI measurements exist/);

    refuses('refuses while a leg measurement exists', async (tx) => {
      await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units, is_calculated)
               VALUES ('u-hop', 'u-hop', '2026-01-01', 17, 'HOP_SL_TRIPLE_BL_R', 17.5, 'ft', false)`;
    }, /HOP_SL_TRIPLE_BL_L \/ _R measurements exist/);

    refuses('refuses while a goal references a new metric', async (tx) => {
      await tx`INSERT INTO goals (user_id, metric, goal_type, target_value, baseline_value, current_value, target_date)
               VALUES ('u-hop', 'HOP_SL_TRIPLE_BL_L', 'improvement', 20, 15, 17, '2026-12-31')`;
    }, /goals, report benchmarks or custom benchmarks reference/);

    refuses('refuses while a custom benchmark references a new metric', async (tx) => {
      await tx`INSERT INTO custom_benchmarks (organization_id, metric_code, name) VALUES ('org-on', 'HOP_SL_TRIPLE_BL_LSI', 'mine')`;
    }, /goals, report benchmarks or custom benchmarks reference/);

    refuses('refuses while a report config carries a new metric', async (tx) => {
      await tx`INSERT INTO reports (organization_id, name, report_type, config)
               VALUES ('org-on', 'r', 'individual', ${tx.json({ metrics: ['HOP_SL_TRIPLE_BL_L'] })})`;
    }, /reports or report templates reference/);

    refuses('refuses while a report template carries a new metric', async (tx) => {
      await tx`INSERT INTO report_templates (organization_id, name, metrics)
               VALUES ('org-on', 't', ${tx.json(['HOP_SL_TRIPLE_BL_R'])})`;
    }, /reports or report templates reference/);
  });
});
