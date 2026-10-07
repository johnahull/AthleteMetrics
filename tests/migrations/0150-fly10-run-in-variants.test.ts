/**
 * Migration 0150 (AM-FEAT-017): FLY10 run-in variant metrics.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0150_add_fly10_run_in_variants.sql');
const DOWN = read('0150_add_fly10_run_in_variants_down.sql');

const NEW_CODES = ['FLY10_TIME_RI5', 'FLY10_TIME_RI10', 'FLY10_TIME_RI15', 'FLY10_TIME_RI30'];

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0150: FLY10 run-in variants', () => {
  it('has static guards: upsert, org enablement, down guard', () => {
    for (const c of NEW_CODES) expect(UP).toContain(`'${c}'`);
    expect(UP).toMatch(/ON CONFLICT \(code\) DO UPDATE/);
    expect(UP).toMatch(/INSERT INTO organization_metrics/);
    expect(DOWN).toMatch(/RAISE EXCEPTION/);
    for (const t of ['measurements', 'goals', 'report_benchmarks', 'event_metrics', 'custom_benchmarks', 'site_benchmarks']) {
      expect(DOWN).toContain(t);
    }
  });

  it('down forgets the manual_migrations tracking row (guarded, like 0144/0145 down)', () => {
    expect(DOWN).toMatch(/to_regclass\('manual_migrations'\) IS NOT NULL/);
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0150_add_fly10_run_in_variants'/);
  });

  it('new codes get run-in specific explanation text, not the pure-max-velocity copy', () => {
    const blockB = UP.slice(UP.indexOf('Block B'), UP.indexOf('Block C'));
    expect(blockB).not.toMatch(/base\.(short_description|what_it_measures|why_it_matters)/);
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

    // Back to the pre-0150 state inside the (rolled-back) transaction, even if the
    // DB holds measurements on the new codes (DOWN refuses while any exist).
    const resetToPre = async (tx: any) => {
      await tx`DELETE FROM measurements WHERE metric = ANY(${NEW_CODES})`;
      await tx`DELETE FROM goals WHERE metric = ANY(${NEW_CODES})`;
      await tx`DELETE FROM report_benchmarks WHERE metric_code = ANY(${NEW_CODES})`;
      await tx`DELETE FROM event_metrics WHERE metric_code = ANY(${NEW_CODES})`;
      await tx`DELETE FROM custom_benchmarks WHERE metric_code = ANY(${NEW_CODES})`;
      await tx`DELETE FROM site_benchmarks WHERE metric_code = ANY(${NEW_CODES})`;
      await tx.unsafe(DOWN);
    };

    const snapshotBenchmarks = async (tx: any) => ({
      benchmarks: await tx`SELECT * FROM site_benchmarks WHERE metric_code = 'FLY10_TIME' ORDER BY id`,
      links: await tx`SELECT i.* FROM benchmark_set_items i JOIN site_benchmarks b ON b.id = i.benchmark_id WHERE b.metric_code = 'FLY10_TIME' ORDER BY i.id`,
    });

    it('adds four codes copying FLY10_TIME shared fields; relabels FLY10_TIME only; benchmarks untouched; idempotent', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        const [before] = await tx`SELECT * FROM site_metrics WHERE code = 'FLY10_TIME'`;
        const snapBefore = await snapshotBenchmarks(tx);
        expect(snapBefore.benchmarks.length).toBeGreaterThan(0);

        await tx.unsafe(UP);
        await tx.unsafe(UP);

        const rows = await tx`SELECT * FROM site_metrics WHERE code = ANY(${NEW_CODES})`;
        expect(rows).toHaveLength(4);
        for (const r of rows) {
          expect(r.category).toBe(before.category);
          expect(r.unit).toBe('s');
          expect(r.metric_type).toBe('lower_is_better');
          expect(r.decimal_precision).toBe(before.decimal_precision);
          expect(r.validation_min).toBe(before.validation_min);
          expect(r.validation_max).toBe(before.validation_max);
          expect(r.is_active).toBe(true);
        }
        const label = (c: string) => rows.find((r: any) => r.code === c)?.label;
        expect(label('FLY10_TIME_RI5')).toBe('10-Yard Fly, 5 yd run-in');
        expect(label('FLY10_TIME_RI10')).toBe('10-Yard Fly, 10 yd run-in');
        expect(label('FLY10_TIME_RI15')).toBe('10-Yard Fly, 15 yd run-in');
        expect(label('FLY10_TIME_RI30')).toBe('10-Yard Fly, 30 yd run-in');

        const [after] = await tx`SELECT * FROM site_metrics WHERE code = 'FLY10_TIME'`;
        expect(after.id).toBe(before.id);
        expect(after.label).toBe('10-Yard Fly, 20 yd run-in');
        expect(after.description).toMatch(/20-yard run-in/i);
        expect(after.unit).toBe(before.unit);

        expect(await snapshotBenchmarks(tx)).toEqual(snapBefore);
      });
    });

    it('enables new codes only for orgs that have FLY10_TIME enabled', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await tx`INSERT INTO organizations (id, name) VALUES ('org-0150-on', 'on'), ('org-0150-off', 'off'), ('org-0150-dis', 'dis')`;
        await tx`INSERT INTO organization_metrics (organization_id, metric_code, is_enabled) VALUES
          ('org-0150-on', 'FLY10_TIME', true), ('org-0150-dis', 'FLY10_TIME', false)`;
        await tx.unsafe(UP);
        const on = await tx`SELECT metric_code, is_enabled FROM organization_metrics WHERE organization_id = 'org-0150-on' AND metric_code = ANY(${NEW_CODES})`;
        expect(on).toHaveLength(4);
        expect(on.every((r: any) => r.is_enabled)).toBe(true);
        for (const org of ['org-0150-off', 'org-0150-dis']) {
          const r = await tx`SELECT 1 FROM organization_metrics WHERE organization_id = ${org} AND metric_code = ANY(${NEW_CODES})`;
          expect(r).toHaveLength(0);
        }
      });
    });

    // What migrations 0022 (label/description) and 0121 (explanations) leave on FLY10_TIME on a
    // fresh DB right before 0150. Production values could not be verified from here.
    const PRE_0150 = {
      label: '10-Yard Fly Time',
      description: 'Time to cover 10 yards after a flying start, measuring maximum velocity.',
      short_description: 'How fast you cover 10 yards at top speed \u2014 a pure max velocity measurement.',
    };

    it('down removes the new codes (and their org rows), restores the pre-0150 label/description/explanation; up/down/up round-trips', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        const [preState] = await tx`SELECT label, description, short_description, what_it_measures, why_it_matters FROM site_metrics WHERE code = 'FLY10_TIME'`;
        expect(preState).toMatchObject(PRE_0150);
        await tx`INSERT INTO organizations (id, name) VALUES ('org-0150-rt', 'rt')`;
        await tx`INSERT INTO organization_metrics (organization_id, metric_code) VALUES ('org-0150-rt', 'FLY10_TIME')`;
        await tx.unsafe(UP);
        const [upState] = await tx`SELECT label, description, short_description FROM site_metrics WHERE code = 'FLY10_TIME'`;
        expect(upState.label).not.toBe(PRE_0150.label);
        expect(upState.short_description).not.toMatch(/already up to full speed|pure max velocity/i);
        await tx.unsafe(DOWN);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code = ANY(${NEW_CODES})`).toHaveLength(0);
        expect(await tx`SELECT 1 FROM organization_metrics WHERE metric_code = ANY(${NEW_CODES})`).toHaveLength(0);
        const [restored] = await tx`SELECT label, description, short_description, what_it_measures, why_it_matters FROM site_metrics WHERE code = 'FLY10_TIME'`;
        expect(restored).toEqual(preState);
        await tx.unsafe(UP);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code = ANY(${NEW_CODES})`).toHaveLength(4);
      });
    });

    it('new codes carry run-in specific explanation text', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await tx.unsafe(UP);
        const rows = await tx`SELECT code, short_description, what_it_measures, why_it_matters FROM site_metrics WHERE code = ANY(${[...NEW_CODES, 'FLY10_TIME']})`;
        expect(rows).toHaveLength(5);
        for (const r of rows) {
          const text = [r.short_description, r.what_it_measures, r.why_it_matters].join(' ');
          expect(text, r.code).not.toMatch(/pure max(imum)? velocity|already up to full speed/i);
          expect(text, r.code).toMatch(/run-in/i);
        }
        const ri5 = rows.find((r: any) => r.code === 'FLY10_TIME_RI5');
        expect(ri5.what_it_measures).toMatch(/5.yd run-in|5-yard run-in/);
      });
    });

    it('down forgets the manual_migrations tracking row so db:migrate:manual re-applies 0150', async () => {
      await rollbackable(async (tx) => {
        await tx`CREATE TABLE IF NOT EXISTS manual_migrations (id SERIAL PRIMARY KEY, migration_name TEXT NOT NULL UNIQUE, applied_at TIMESTAMP NOT NULL DEFAULT NOW())`;
        await tx`INSERT INTO manual_migrations (migration_name) VALUES ('0150_add_fly10_run_in_variants') ON CONFLICT DO NOTHING`;
        await resetToPre(tx);
        expect(await tx`SELECT 1 FROM manual_migrations WHERE migration_name = '0150_add_fly10_run_in_variants'`).toHaveLength(0);
      });
    });

    it('down refuses when a measurement references a new code, reporting the count', async () => {
      await rollbackable(async (tx) => {
        await tx.unsafe(UP);
        await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units)
                 VALUES ('u-0150', 'c-0150', '2026-07-01', 17, 'FLY10_TIME_RI10', '1.2', 's')`;
        const [{ n }] = await tx`SELECT COUNT(*)::int AS n FROM measurements WHERE metric = ANY(${NEW_CODES})`;
        await tx.unsafe('SAVEPOINT g');
        await expect(tx.unsafe(DOWN)).rejects.toThrow(new RegExp(`refused.*${n} measurements`, 's'));
        await tx.unsafe('ROLLBACK TO SAVEPOINT g');
      });
    });

    it('down refuses when custom or site benchmarks exist on a new code, reporting counts', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        await tx.unsafe(UP);
        await tx`INSERT INTO organizations (id, name) VALUES ('org-0150-bm', 'bm')`;
        await tx`INSERT INTO custom_benchmarks (organization_id, metric_code, name, benchmark_value) VALUES ('org-0150-bm', 'FLY10_TIME_RI15', 'cb', 1.5)`;
        await tx`INSERT INTO site_benchmarks (metric_code, name, benchmark_value) VALUES ('FLY10_TIME_RI30', 'sb', 1.5)`;
        await tx.unsafe('SAVEPOINT g');
        await expect(tx.unsafe(DOWN)).rejects.toThrow(/refused.*1 custom_benchmarks.*1 site_benchmarks/s);
        await tx.unsafe('ROLLBACK TO SAVEPOINT g');
      });
    });
  });
});
