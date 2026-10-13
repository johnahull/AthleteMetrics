/**
 * Migration 0158 (AM-FEAT-021): Sayers peak power derived metrics (PEAK_POWER_W, PEAK_POWER_REL).
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 * JUMP_CMJ_HOH and WEIGHT_LBS may not exist on a db:push + seed database, so the live tests
 * seed them inside the rolled-back transaction.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { evaluateFormula, validateFormula } from '../../packages/api/services/formula-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0158_add_sayers_peak_power_metrics.sql');
const DOWN = read('0158_add_sayers_peak_power_metrics_down.sql');

const W_FORMULA = '60.7 * jump_cmj_hoh * 2.54 + 45.3 * weight_lbs * 0.45359237 - 2055';
const REL_FORMULA =
  '(60.7 * jump_cmj_hoh * 2.54 + 45.3 * weight_lbs * 0.45359237 - 2055) / (weight_lbs * 0.45359237)';
const SOURCES = ['JUMP_CMJ_HOH', 'WEIGHT_LBS'];

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0158: Sayers peak power derived metrics', () => {
  it('has static guards: upsert, source guard, notice, down tracking row, no BEGIN/COMMIT', () => {
    expect(UP).toMatch(/ON CONFLICT \(code\) DO UPDATE/);
    expect(UP).toMatch(/RAISE EXCEPTION/);
    expect(UP).toContain('JUMP_CMJ_HOH');
    expect(UP).toContain('WEIGHT_LBS');
    expect(UP).toMatch(/RAISE NOTICE/);
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT)\s*;/im);
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0158_add_sayers_peak_power_metrics'/);
    expect(UP).toContain(`'${W_FORMULA}'`);
    expect(UP).toContain(`'${REL_FORMULA}'`);
  });

  it('the stored formulas parse and give 4110.72 W and 60.42 W/kg for 150 lb + 20 in', () => {
    for (const f of [W_FORMULA, REL_FORMULA]) {
      const r = validateFormula(f, SOURCES);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    }
    const vars = { JUMP_CMJ_HOH: 20, WEIGHT_LBS: 150 };
    expect(evaluateFormula(W_FORMULA, vars)).toBeCloseTo(4110.72, 1);
    expect(evaluateFormula(REL_FORMULA, vars)).toBeCloseTo(60.42, 1);
    expect(68.0389).toBeCloseTo(150 * 0.45359237, 3);
  });

  it('a second vector: 28 in and 180 lb', () => {
    const vars = { JUMP_CMJ_HOH: 28, WEIGHT_LBS: 180 };
    const w = 60.7 * 28 * 2.54 + 45.3 * 180 * 0.45359237 - 2055;
    expect(evaluateFormula(W_FORMULA, vars)).toBeCloseTo(w, 6);
    expect(evaluateFormula(REL_FORMULA, vars)).toBeCloseTo(w / (180 * 0.45359237), 6);
  });

  it('a weight of 0 gives no value (null, not NaN or Infinity)', () => {
    expect(evaluateFormula(REL_FORMULA, { JUMP_CMJ_HOH: 20, WEIGHT_LBS: 0 })).toBeNull();
  });

  describe.skipIf(!isDisposableTestDb)('against a disposable DB (rolled back)', () => {
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
          await fn(tx);
          throw ROLLBACK;
        });
      } catch (e) {
        if (e !== ROLLBACK) throw e;
      }
    };

    const seedSources = async (tx: any) => {
      await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, available_org_types, sport_associations)
         VALUES ('JUMP_CMJ_HOH', 'CMJ HOH', 'Power', 'in', 'higher_is_better', true, true, 980, ARRAY['college','high_school'], ARRAY['soccer'])
         ON CONFLICT (code) DO NOTHING`;
      // The row may already exist with other attributes (0135 seeds NULL): pin the ones asserted below
      await tx`UPDATE site_metrics SET available_org_types = ARRAY['college','high_school'], sport_associations = ARRAY['soccer'] WHERE code = 'JUMP_CMJ_HOH'`;
      await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order)
         VALUES ('WEIGHT_LBS', 'Weight', 'Physical', 'lbs', 'tracking', false, true, 990)
         ON CONFLICT (code) DO NOTHING`;
    };

    const seedUsers = (tx: any) =>
      tx`INSERT INTO users (id, username, emails, password, first_name, last_name, full_name) VALUES
         ('u-0158', 'u0158', ARRAY['u0158@test.com'], 'x', 'U', 'U', 'U U'),
         ('c-0158', 'c0158', ARRAY['c0158@test.com'], 'x', 'C', 'C', 'C C')
         ON CONFLICT (id) DO NOTHING`;

    const resetToPre = async (tx: any) => {
      await tx`DELETE FROM measurements WHERE metric IN ('PEAK_POWER_W', 'PEAK_POWER_REL')`;
      await tx`DELETE FROM site_metrics WHERE code IN ('PEAK_POWER_W', 'PEAK_POWER_REL')`;
    };

    it('inserts the exact rows; idempotent on re-apply', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedSources(tx);
        await tx.unsafe(UP);
        await tx.unsafe(UP);
        const rows = await tx`SELECT * FROM site_metrics WHERE code IN ('PEAK_POWER_W', 'PEAK_POWER_REL') ORDER BY code`;
        expect(rows).toHaveLength(2);
        const [rel, w] = rows;
        const config = {
          dateMatchStrategy: 'closest',
          maxDateDifference: 45,
          missingSourceBehavior: 'skip',
          anchorMetric: 'JUMP_CMJ_HOH',
        };
        expect(w).toMatchObject({
          label: 'Peak Power (Sayers)', unit: 'W', category: 'Power', metric_type: 'tracking',
          is_derived: true, is_system_default: true, is_active: true, decimal_precision: 0,
          formula: W_FORMULA, dependent_metrics: SOURCES, calculation_config: config,
        });
        expect(Number(w.validation_min)).toBe(200);
        expect(Number(w.validation_max)).toBe(9000);
        expect(rel).toMatchObject({
          label: 'Relative Peak Power (Sayers)', unit: 'W/kg', category: 'Power', metric_type: 'tracking',
          is_derived: true, is_system_default: true, is_active: true, decimal_precision: 1,
          formula: REL_FORMULA, dependent_metrics: SOURCES, calculation_config: config,
        });
        expect(Number(rel.validation_min)).toBe(10);
        expect(Number(rel.validation_max)).toBe(100);
        // restricted/HOH-only caveat, youth caveat
        for (const r of rows) {
          expect(r.description).toMatch(/restricted|hands-on-hips|HOH/i);
          expect(r.description).toMatch(/not valid for.*(HF|hands-free)|HF-CMJ/i);
        }
        // copied from the CMJ HOH row
        expect(w.available_org_types).toEqual(['college', 'high_school']);
        expect(w.sport_associations).toEqual(['soccer']);
      });
    });

    it('display_order is MAX+1 / MAX+2 at first apply and kept on re-apply', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedSources(tx);
        const [{ m }] = await tx`SELECT MAX(display_order) AS m FROM site_metrics`;
        await tx.unsafe(UP);
        const rows = await tx`SELECT code, display_order FROM site_metrics WHERE code IN ('PEAK_POWER_W', 'PEAK_POWER_REL')`;
        const byCode = Object.fromEntries(rows.map((r: any) => [r.code, r.display_order]));
        expect(byCode.PEAK_POWER_W).toBe(Number(m) + 1);
        expect(byCode.PEAK_POWER_REL).toBe(Number(m) + 2);
        await tx.unsafe(UP);
        const again = await tx`SELECT code, display_order FROM site_metrics WHERE code IN ('PEAK_POWER_W', 'PEAK_POWER_REL')`;
        expect(Object.fromEntries(again.map((r: any) => [r.code, r.display_order]))).toEqual(byCode);
      });
    });

    it('re-apply restores edited fields but keeps an admin deactivation', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedSources(tx);
        await tx.unsafe(UP);
        await tx`UPDATE site_metrics SET formula = 'x', unit = 'zz', is_active = false WHERE code = 'PEAK_POWER_W'`;
        await tx.unsafe(UP);
        const [r] = await tx`SELECT formula, unit, is_active FROM site_metrics WHERE code = 'PEAK_POWER_W'`;
        expect(r).toEqual({ formula: W_FORMULA, unit: 'W', is_active: false });
      });
    });

    it('enables both codes only for orgs with BOTH sources enabled; never overrides an existing row', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedSources(tx);
        await tx`INSERT INTO organizations (id, name) VALUES
          ('org-0158-both', 'both'), ('org-0158-cmj', 'cmj'), ('org-0158-wt', 'wt'), ('org-0158-dis', 'dis')`;
        await tx`INSERT INTO organization_metrics (organization_id, metric_code, is_enabled) VALUES
          ('org-0158-both', 'JUMP_CMJ_HOH', true), ('org-0158-both', 'WEIGHT_LBS', true),
          ('org-0158-cmj', 'JUMP_CMJ_HOH', true),
          ('org-0158-wt', 'WEIGHT_LBS', true),
          ('org-0158-dis', 'JUMP_CMJ_HOH', true), ('org-0158-dis', 'WEIGHT_LBS', false)`;
        await tx.unsafe(UP);
        const rows = await tx`SELECT organization_id, metric_code, is_enabled FROM organization_metrics
                              WHERE metric_code IN ('PEAK_POWER_W', 'PEAK_POWER_REL') ORDER BY metric_code`;
        expect(rows).toEqual([
          { organization_id: 'org-0158-both', metric_code: 'PEAK_POWER_REL', is_enabled: true },
          { organization_id: 'org-0158-both', metric_code: 'PEAK_POWER_W', is_enabled: true },
        ]);
        await tx`UPDATE organization_metrics SET is_enabled = false WHERE organization_id = 'org-0158-both' AND metric_code = 'PEAK_POWER_W'`;
        await tx.unsafe(UP);
        const [r] = await tx`SELECT is_enabled FROM organization_metrics WHERE organization_id = 'org-0158-both' AND metric_code = 'PEAK_POWER_W'`;
        expect(r.is_enabled).toBe(false);
      });
    });

    it('creates WEIGHT_LBS with the production attributes when it is missing', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedSources(tx);
        await tx`DELETE FROM organization_metrics WHERE metric_code = 'WEIGHT_LBS'`;
        await tx`DELETE FROM site_metrics WHERE code = 'WEIGHT_LBS'`;
        await tx.unsafe(UP);
        const [w] = await tx`SELECT * FROM site_metrics WHERE code = 'WEIGHT_LBS'`;
        expect(w).toMatchObject({
          label: 'Weight (lb)', category: 'Physical', unit: 'lbs', metric_type: 'tracking',
          is_derived: false, is_active: true, decimal_precision: 3,
        });
        expect(await tx`SELECT 1 FROM site_metrics WHERE code IN ('PEAK_POWER_W', 'PEAK_POWER_REL')`).toHaveLength(2);
      });
    });

    it('leaves an existing WEIGHT_LBS untouched', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedSources(tx);
        await tx`DELETE FROM organization_metrics WHERE metric_code = 'WEIGHT_LBS'`;
        await tx`DELETE FROM site_metrics WHERE code = 'WEIGHT_LBS'`;
        await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, decimal_precision)
                 VALUES ('WEIGHT_LBS', 'Custom label', 'Anthropometrics', 'kg', 'higher_is_better', true, false, 1)`;
        const [before] = await tx`SELECT * FROM site_metrics WHERE code = 'WEIGHT_LBS'`;
        await tx.unsafe(UP);
        const [after] = await tx`SELECT * FROM site_metrics WHERE code = 'WEIGHT_LBS'`;
        expect(after).toEqual(before);
      });
    });

    it('down does not delete WEIGHT_LBS or JUMP_CMJ_HOH', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedSources(tx);
        await tx.unsafe(UP);
        await tx.unsafe(DOWN);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code IN ('WEIGHT_LBS', 'JUMP_CMJ_HOH')`).toHaveLength(2);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code IN ('PEAK_POWER_W', 'PEAK_POWER_REL')`).toHaveLength(0);
      });
    });

    it('raises when JUMP_CMJ_HOH is missing', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedSources(tx);
        await tx`DELETE FROM site_benchmarks WHERE metric_code = 'JUMP_CMJ_HOH'`;
        await tx`DELETE FROM site_metrics WHERE code = 'JUMP_CMJ_HOH'`;
        await tx`SAVEPOINT s`;
        await expect(tx.unsafe(UP)).rejects.toThrow(/missing site_metrics rows: JUMP_CMJ_HOH/);
        await tx`ROLLBACK TO SAVEPOINT s`;
      });
    });

    it('down deletes all Sayers measurements then the metric rows, leaving other metrics alone', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedSources(tx);
        await tx.unsafe(UP);
        await seedUsers(tx);
        await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units, is_calculated, calculated_from_measurement_ids, calculation_metadata)
                 VALUES ('u-0158', 'c-0158', '2026-03-10', 17, 'PEAK_POWER_W', '4110.7', 'W', true, ARRAY[]::text[], '{}'::jsonb),
                        ('u-0158', 'c-0158', '2026-03-10', 17, 'PEAK_POWER_REL', '60.4', 'W/kg', true, ARRAY[]::text[], '{}'::jsonb),
                        ('u-0158', 'c-0158', '2026-03-11', 17, 'PEAK_POWER_W', '4000', 'W', false, NULL, NULL),
                        ('u-0158', 'c-0158', '2026-03-10', 17, 'JUMP_CMJ_HOH', '20', 'in', false, NULL, NULL)`;
        await tx.unsafe(DOWN);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code IN ('PEAK_POWER_W', 'PEAK_POWER_REL')`).toHaveLength(0);
        expect(await tx`SELECT 1 FROM measurements WHERE metric IN ('PEAK_POWER_W', 'PEAK_POWER_REL')`).toHaveLength(0);
        expect(await tx`SELECT 1 FROM measurements WHERE metric = 'JUMP_CMJ_HOH' AND user_id = 'u-0158'`).toHaveLength(1);
      });
    });

    it('down refuses (and deletes nothing) when goals or benchmarks reference the metrics, reporting counts', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedSources(tx);
        await tx.unsafe(UP);
        await seedUsers(tx);
        await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units, is_calculated, calculated_from_measurement_ids, calculation_metadata)
                 VALUES ('u-0158', 'c-0158', '2026-03-10', 17, 'PEAK_POWER_W', '4110.7', 'W', true, ARRAY[]::text[], '{}'::jsonb)`;
        await tx`INSERT INTO goals (user_id, metric, goal_type, target_value, baseline_value, current_value, target_date)
                 VALUES ('u-0158', 'PEAK_POWER_W', 'target', 5000, 4000, 4100, '2027-01-01')`;
        await tx`INSERT INTO site_benchmarks (metric_code, name, benchmark_value) VALUES ('PEAK_POWER_REL', 'sb', 60)`;
        await tx`SAVEPOINT g`;
        await expect(tx.unsafe(DOWN)).rejects.toThrow(/refused.*1 goals.*1 site_benchmarks/s);
        await tx`ROLLBACK TO SAVEPOINT g`;
        expect(await tx`SELECT 1 FROM site_metrics WHERE code IN ('PEAK_POWER_W', 'PEAK_POWER_REL')`).toHaveLength(2);
        expect(await tx`SELECT 1 FROM measurements WHERE metric = 'PEAK_POWER_W'`).toHaveLength(1);
      });
    });

    it('down forgets the manual_migrations tracking row', async () => {
      await rollbackable(async (tx) => {
        await tx`CREATE TABLE IF NOT EXISTS manual_migrations (id SERIAL PRIMARY KEY, migration_name TEXT NOT NULL UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT NOW())`;
        await tx`INSERT INTO manual_migrations (migration_name) VALUES ('0158_add_sayers_peak_power_metrics') ON CONFLICT DO NOTHING`;
        await tx.unsafe(DOWN);
        expect(await tx`SELECT 1 FROM manual_migrations WHERE migration_name = '0158_add_sayers_peak_power_metrics'`).toHaveLength(0);
      });
    });

    it('up/down/up round-trips', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedSources(tx);
        await tx.unsafe(UP);
        await tx.unsafe(DOWN);
        await tx.unsafe(UP);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code IN ('PEAK_POWER_W', 'PEAK_POWER_REL')`).toHaveLength(2);
      });
    });
  });
});
