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
    for (const t of ['measurements', 'goals', 'report_benchmarks', 'event_metrics']) expect(DOWN).toContain(t);
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

    it('down removes the new codes (and their org rows), restores label/description; up/down/up round-trips', async () => {
      await rollbackable(async (tx) => {
        await resetToPre(tx);
        const [orig] = await tx`SELECT label, description FROM site_metrics WHERE code = 'FLY10_TIME'`;
        await tx`INSERT INTO organizations (id, name) VALUES ('org-0150-rt', 'rt')`;
        await tx`INSERT INTO organization_metrics (organization_id, metric_code) VALUES ('org-0150-rt', 'FLY10_TIME')`;
        await tx.unsafe(UP);
        await tx.unsafe(DOWN);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code = ANY(${NEW_CODES})`).toHaveLength(0);
        expect(await tx`SELECT 1 FROM organization_metrics WHERE metric_code = ANY(${NEW_CODES})`).toHaveLength(0);
        const [restored] = await tx`SELECT label, description FROM site_metrics WHERE code = 'FLY10_TIME'`;
        expect(restored).toEqual(orig);
        await tx.unsafe(UP);
        expect(await tx`SELECT 1 FROM site_metrics WHERE code = ANY(${NEW_CODES})`).toHaveLength(4);
      });
    });

    it('down refuses when a measurement references a new code', async () => {
      await rollbackable(async (tx) => {
        await tx.unsafe(UP);
        await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units)
                 VALUES ('u-0150', 'c-0150', '2026-07-01', 17, 'FLY10_TIME_RI10', '1.2', 's')`;
        await tx.unsafe('SAVEPOINT g');
        await expect(tx.unsafe(DOWN)).rejects.toThrow(/refused.*1 measurements/s);
        await tx.unsafe('ROLLBACK TO SAVEPOINT g');
      });
    });
  });
});
