/**
 * Migration 0152 (AM-FEAT-018): MOMENTUM derived metric (body mass x fly speed).
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 * WEIGHT_LBS only exists in production (created via the admin UI), so the live tests
 * seed it inside the rolled-back transaction.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { evaluateFormula, validateFormula } from '../../packages/api/services/formula-service';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0152_add_momentum_metric.sql');
const DOWN = read('0152_add_momentum_metric_down.sql');

const FORMULA = 'weight_lbs * 0.45359237 * 9.144 / fly10_time';

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0152: MOMENTUM derived metric', () => {
  it('has static guards: upsert, source guard, notice, down tracking row', () => {
    expect(UP).toMatch(/ON CONFLICT \(code\) DO UPDATE/);
    expect(UP).toMatch(/RAISE EXCEPTION/);
    expect(UP).toContain('WEIGHT_LBS');
    expect(UP).toContain('FLY10_TIME');
    expect(UP).toMatch(/RAISE NOTICE/);
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0152_add_momentum_metric'/);
  });

  it('the stored formula parses and gives 150 lb / 1.30 s = 478.6 kg*m/s', () => {
    const r = validateFormula(FORMULA, ['WEIGHT_LBS', 'FLY10_TIME']);
    expect(r.errors).toEqual([]);
    expect(r.valid).toBe(true);
    expect(evaluateFormula(FORMULA, { WEIGHT_LBS: 150, FLY10_TIME: 1.3 })).toBeCloseTo(478.6, 1);
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

    const seedWeight = (tx: any) =>
      tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order)
         VALUES ('WEIGHT_LBS', 'Weight', 'Physical', 'lbs', 'tracking', false, true, 990)
         ON CONFLICT (code) DO NOTHING`;

    const seedUsers = (tx: any) =>
      tx`INSERT INTO users (id, username, emails, password, first_name, last_name, full_name) VALUES
         ('u-0152', 'u0152', ARRAY['u0152@test.com'], 'x', 'U', 'U', 'U U'),
         ('c-0152', 'c0152', ARRAY['c0152@test.com'], 'x', 'C', 'C', 'C C')
         ON CONFLICT (id) DO NOTHING`;

    // Pre-0152 state: no MOMENTUM row, no MOMENTUM measurements
    const resetToPre = async (tx: any) => {
      await tx`DELETE FROM measurements WHERE metric = 'MOMENTUM'`;
      await tx`DELETE FROM site_metrics WHERE code = 'MOMENTUM'`;
    };

    it('inserts the exact row; idempotent on re-apply', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedWeight(tx);
        await tx.unsafe(UP);
        await tx.unsafe(UP);
        const rows = await tx`SELECT * FROM site_metrics WHERE code = 'MOMENTUM'`;
        expect(rows).toHaveLength(1);
        const r = rows[0];
        expect(r.label).toBe('Momentum');
        expect(r.unit).toBe('kg*m/s');
        expect(r.category).toBe('Power');
        expect(r.metric_type).toBe('tracking');
        expect(r.is_derived).toBe(true);
        expect(r.formula).toBe(FORMULA);
        expect(r.dependent_metrics).toEqual(['FLY10_TIME', 'WEIGHT_LBS']);
        expect(r.calculation_config).toEqual({
          dateMatchStrategy: 'closest',
          maxDateDifference: 45,
          missingSourceBehavior: 'skip',
          anchorMetric: 'FLY10_TIME',
        });
        expect(r.decimal_precision).toBe(1);
        expect(Number(r.validation_min)).toBe(50);
        expect(Number(r.validation_max)).toBe(1500);
        expect(r.is_active).toBe(true);
      });
    });

    it('re-apply restores edited fields but keeps an admin deactivation', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedWeight(tx);
        await tx.unsafe(UP);
        await tx`UPDATE site_metrics SET formula = 'x', unit = 'zz', is_active = false WHERE code = 'MOMENTUM'`;
        await tx.unsafe(UP);
        const [r] = await tx`SELECT formula, unit, is_active FROM site_metrics WHERE code = 'MOMENTUM'`;
        expect(r).toEqual({ formula: FORMULA, unit: 'kg*m/s', is_active: false });
      });
    });

    it('enables MOMENTUM only for orgs with BOTH sources enabled; never overrides an existing row', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedWeight(tx);
        await tx`INSERT INTO organizations (id, name) VALUES
          ('org-0152-both', 'both'), ('org-0152-fly', 'fly'), ('org-0152-wt', 'wt'),
          ('org-0152-dis', 'dis'), ('org-0152-none', 'none')`;
        await tx`INSERT INTO organization_metrics (organization_id, metric_code, is_enabled) VALUES
          ('org-0152-both', 'FLY10_TIME', true), ('org-0152-both', 'WEIGHT_LBS', true),
          ('org-0152-fly', 'FLY10_TIME', true),
          ('org-0152-wt', 'WEIGHT_LBS', true),
          ('org-0152-dis', 'FLY10_TIME', true), ('org-0152-dis', 'WEIGHT_LBS', false)`;
        await tx.unsafe(UP);
        const rows = await tx`SELECT organization_id, is_enabled FROM organization_metrics WHERE metric_code = 'MOMENTUM'`;
        expect(rows).toEqual([{ organization_id: 'org-0152-both', is_enabled: true }]);

        // An admin turns it off; re-applying must not turn it back on
        await tx`UPDATE organization_metrics SET is_enabled = false WHERE organization_id = 'org-0152-both' AND metric_code = 'MOMENTUM'`;
        await tx.unsafe(UP);
        const [r] = await tx`SELECT is_enabled FROM organization_metrics WHERE organization_id = 'org-0152-both' AND metric_code = 'MOMENTUM'`;
        expect(r.is_enabled).toBe(false);
      });
    });

    it('creates WEIGHT_LBS with the production attributes when it is missing, then inserts MOMENTUM', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await tx`DELETE FROM organization_metrics WHERE metric_code = 'WEIGHT_LBS'`;
        await tx`DELETE FROM site_metrics WHERE code = 'WEIGHT_LBS'`;
        await tx.unsafe(UP);
        const [w] = await tx`SELECT * FROM site_metrics WHERE code = 'WEIGHT_LBS'`;
        expect(w).toMatchObject({
          label: 'Weight (lb)',
          category: 'Physical',
          unit: 'lbs',
          metric_type: 'tracking',
          is_derived: false,
          is_active: true,
          decimal_precision: 3,
        });
        expect(await tx`SELECT 1 FROM site_metrics WHERE code = 'MOMENTUM'`).toHaveLength(1);
      });
    });

    it('leaves an existing WEIGHT_LBS untouched', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
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

    it('down does not delete WEIGHT_LBS', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await tx`DELETE FROM organization_metrics WHERE metric_code = 'WEIGHT_LBS'`;
        await tx`DELETE FROM site_metrics WHERE code = 'WEIGHT_LBS'`;
        await tx.unsafe(UP);
        await tx.unsafe(DOWN);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code = 'WEIGHT_LBS'`).toHaveLength(1);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code = 'MOMENTUM'`).toHaveLength(0);
      });
    });

    it('raises when FLY10_TIME is missing', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedWeight(tx);
        await tx`DELETE FROM site_benchmarks WHERE metric_code = 'FLY10_TIME'`;
        await tx`DELETE FROM site_metrics WHERE code = 'FLY10_TIME'`;
        await tx`SAVEPOINT s`;
        await expect(tx.unsafe(UP)).rejects.toThrow(/missing site_metrics rows: FLY10_TIME/);
        await tx`ROLLBACK TO SAVEPOINT s`;
      });
    });

    it('down deletes all MOMENTUM measurements then the metric row, leaving other metrics alone', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedWeight(tx);
        await tx.unsafe(UP);
        await seedUsers(tx);
        await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units, is_calculated)
                 VALUES ('u-0152', 'c-0152', '2026-03-10', 17, 'MOMENTUM', '478.6', 'kg*m/s', true),
                        ('u-0152', 'c-0152', '2026-03-11', 17, 'MOMENTUM', '480.0', 'kg*m/s', false),
                        ('u-0152', 'c-0152', '2026-03-10', 17, 'FLY10_TIME', '1.3', 's', false)`;
        await tx.unsafe(DOWN);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code = 'MOMENTUM'`).toHaveLength(0);
        expect(await tx`SELECT 1 FROM measurements WHERE metric = 'MOMENTUM'`).toHaveLength(0);
        expect(await tx`SELECT 1 FROM measurements WHERE metric = 'FLY10_TIME' AND user_id = 'u-0152'`).toHaveLength(1);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code IN ('FLY10_TIME', 'WEIGHT_LBS')`).toHaveLength(2);
      });
    });

    it('down refuses (and deletes nothing) when goals, benchmarks or event metrics reference MOMENTUM, reporting counts', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedWeight(tx);
        await tx.unsafe(UP);
        await seedUsers(tx);
        await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units, is_calculated)
                 VALUES ('u-0152', 'c-0152', '2026-03-10', 17, 'MOMENTUM', '478.6', 'kg*m/s', true)`;
        await tx`INSERT INTO users (id, username, emails, password, first_name, last_name, full_name)
                 VALUES ('u-0152-g', 'u0152g', ARRAY['u0152g@test.com'], 'x', 'G', 'G', 'G G')`;
        await tx`INSERT INTO goals (user_id, metric, goal_type, target_value, baseline_value, current_value, target_date)
                 VALUES ('u-0152-g', 'MOMENTUM', 'target', 500, 400, 450, '2027-01-01')`;
        await tx`INSERT INTO organizations (id, name) VALUES ('org-0152-bm', 'bm')`;
        await tx`INSERT INTO custom_benchmarks (organization_id, metric_code, name, benchmark_value) VALUES ('org-0152-bm', 'MOMENTUM', 'cb', 500)`;
        await tx`INSERT INTO site_benchmarks (metric_code, name, benchmark_value) VALUES ('MOMENTUM', 'sb', 500)`;
        await tx.unsafe('SAVEPOINT g');
        await expect(tx.unsafe(DOWN)).rejects.toThrow(/refused.*1 goals.*1 custom_benchmarks.*1 site_benchmarks/s);
        await tx.unsafe('ROLLBACK TO SAVEPOINT g');
        expect(await tx`SELECT 1 FROM site_metrics WHERE code = 'MOMENTUM'`).toHaveLength(1);
        expect(await tx`SELECT 1 FROM measurements WHERE metric = 'MOMENTUM'`).toHaveLength(1);
      });
    });

    it('down forgets the manual_migrations tracking row', async () => {
      await rollbackable(async (tx) => {
        await tx`CREATE TABLE IF NOT EXISTS manual_migrations (id SERIAL PRIMARY KEY, migration_name TEXT NOT NULL UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT NOW())`;
        await tx`INSERT INTO manual_migrations (migration_name) VALUES ('0152_add_momentum_metric') ON CONFLICT DO NOTHING`;
        await tx.unsafe(DOWN);
        expect(await tx`SELECT 1 FROM manual_migrations WHERE migration_name = '0152_add_momentum_metric'`).toHaveLength(0);
      });
    });

    it('up/down/up round-trips', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await seedWeight(tx);
        await tx.unsafe(UP);
        await tx.unsafe(DOWN);
        await tx.unsafe(UP);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code = 'MOMENTUM'`).toHaveLength(1);
      });
    });
  });
});
