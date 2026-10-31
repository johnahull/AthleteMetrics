/**
 * Migration 0168: HOP_SL_TRIPLE_L / HOP_SL_TRIPLE_R from meters to feet.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0168_triple_hop_meters_to_feet.sql');
const DOWN = read('0168_triple_hop_meters_to_feet_down.sql');

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0168: static analysis', () => {
  it('converts by 3.28084 for both legs and runs no BEGIN/COMMIT of its own', () => {
    expect(UP).toMatch(/v_factor CONSTANT NUMERIC := 3\.28084/);
    expect(UP).toMatch(/'HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R'/);
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('touches every table that stores values in the metric unit', () => {
    for (const table of ['site_metrics', 'measurements', 'site_benchmarks', 'custom_benchmarks', 'report_benchmarks', 'reports', 'goals', 'peer_percentile_cache']) {
      expect(UP, table).toMatch(new RegExp(`(UPDATE|DELETE FROM) ${table}\\b`));
    }
    expect(UP).toMatch(/target_value[\s\S]*baseline_value[\s\S]*current_value/);
    expect(UP).toMatch(/r\.report_type <> 'eval'/);
  });
  it('treats feet spelled ft/feet/foot (any case) as already converted and normalizes it to ft', () => {
    expect(UP).toMatch(/lower\(v_unit\) IN \('ft', 'feet', 'foot'\)/);
    expect(UP).toMatch(/UPDATE site_metrics SET unit = 'ft' WHERE code = v_code/);
    expect(UP).toMatch(/UPDATE measurements SET units = 'ft' WHERE metric = v_code AND lower\(units\) IN \('ft', 'feet', 'foot'\)/);
  });
  it('fails loudly on an unexpected unit instead of skipping', () => {
    expect(UP).toMatch(/RAISE EXCEPTION[^;]*expected m\/meter\/meters or ft/);
  });
  it('down reverses by division, refuses while 0169 is applied, and forgets its manual_migrations row', () => {
    expect(DOWN).toMatch(/v_factor CONSTANT NUMERIC := 3\.28084/);
    expect(DOWN).toMatch(/value \/ v_factor/);
    expect(DOWN).toMatch(/0169_add_triple_hop_lsi_and_benchmarks/);
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0168_triple_hop_meters_to_feet'/);
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0168: against a disposable DB (rolled back)', () => {
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

  const F = 3.28084;
  const seed = async (tx: any, unit = 'm') => {
    await tx`DELETE FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R')`;
    for (const code of ['HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R']) {
      await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, validation_min, validation_max)
               VALUES (${code}, ${code}, 'power', ${unit}, 'higher_is_better', 1, 10)`;
      await tx`INSERT INTO measurements (user_id, submitted_by, date, age, metric, value, units)
               VALUES ('u-hop', 'u-hop', '2026-01-01', 17, ${code}, 5, ${unit})`;
      await tx`INSERT INTO site_benchmarks (id, metric_code, name, comparison_operator, benchmark_value, min_value, max_value) VALUES
               (${'b-' + code}, ${code}, ${'bench ' + code}, 'range', NULL, 5, 7),
               (${'bv-' + code}, ${code}, ${'bench value ' + code}, 'gte', 6, NULL, NULL)`;
      await tx`INSERT INTO custom_benchmarks (id, organization_id, metric_code, name, comparison_operator, benchmark_value, min_value, max_value) VALUES
               (${'cb-' + code}, 'org-hop', ${code}, ${'custom ' + code}, 'range', NULL, 5, 7),
               (${'cbv-' + code}, 'org-hop', ${code}, ${'custom value ' + code}, 'gte', 6, NULL, NULL)`;
      await tx`INSERT INTO goals (user_id, metric, goal_type, target_value, baseline_value, current_value, target_date)
               VALUES ('u-hop', ${code}, 'improvement', 6, 4, 5, '2026-12-31')`;
      await tx`INSERT INTO peer_percentile_cache (metric_code, sample_size, expires_at) VALUES (${code}, 10, NOW() + interval '1 day')`;
    }
    await tx`INSERT INTO reports (id, organization_id, name, report_type, config) VALUES
               ('r-hop', 'org-hop', 'r', 'team', ${tx.json({ benchmarks: { userDefined: [
                 { metricCode: 'HOP_SL_TRIPLE_L', value: 5, label: 'target' },
                 { metricCode: 'FLY10_TIME', value: 1.3, label: 'other' },
               ] } })}),
               ('r-eval', 'org-hop', 'e', 'eval', ${tx.json({ benchmarks: { userDefined: [{ metricCode: 'HOP_SL_TRIPLE_L', value: 5 }] } })})`;
    await tx`INSERT INTO report_benchmarks (report_id, metric_code, name, benchmark_value) VALUES
               ('r-hop', 'HOP_SL_TRIPLE_R', 'rb', 5), ('r-eval', 'HOP_SL_TRIPLE_R', 'rb eval', 5)`;
  };

  const num = (v: unknown) => Number(v);
  const snapshot = async (tx: any) => ({
    metric: (await tx`SELECT unit, validation_min, validation_max FROM site_metrics WHERE code = 'HOP_SL_TRIPLE_L'`)[0],
    m: (await tx`SELECT value, units FROM measurements WHERE metric = 'HOP_SL_TRIPLE_R'`)[0],
    sb: (await tx`SELECT id, benchmark_value, min_value, max_value FROM site_benchmarks WHERE id IN ('b-HOP_SL_TRIPLE_L', 'bv-HOP_SL_TRIPLE_L') ORDER BY id`),
    cb: (await tx`SELECT id, benchmark_value, min_value, max_value FROM custom_benchmarks WHERE id IN ('cb-HOP_SL_TRIPLE_L', 'cbv-HOP_SL_TRIPLE_L') ORDER BY id`),
    g: (await tx`SELECT target_value, baseline_value, current_value FROM goals WHERE metric = 'HOP_SL_TRIPLE_L'`)[0],
    rb: (await tx`SELECT benchmark_value FROM report_benchmarks WHERE report_id = 'r-hop'`)[0],
    rbEval: (await tx`SELECT benchmark_value FROM report_benchmarks WHERE report_id = 'r-eval'`)[0],
    cache: (await tx`SELECT count(*)::int AS n FROM peer_percentile_cache WHERE metric_code LIKE 'HOP_SL_TRIPLE%'`)[0].n,
    report: (await tx`SELECT config FROM reports WHERE id = 'r-hop'`)[0].config,
    evalReport: (await tx`SELECT config FROM reports WHERE id = 'r-eval'`)[0].config,
  });

  it('converts every stored value to feet and clears the percentile cache', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const s = await snapshot(tx);
      expect(s.metric.unit).toBe('ft');
      expect(num(s.metric.validation_min)).toBeCloseTo(1 * F, 3);
      expect(num(s.metric.validation_max)).toBeCloseTo(10 * F, 3);
      expect(s.m.units).toBe('ft');
      expect(num(s.m.value)).toBeCloseTo(5 * F, 3);
      const [range, valued] = s.sb; // ORDER BY id: 'b-' < 'bv-'
      expect(num(range.min_value)).toBeCloseTo(5 * F, 3);
      expect(num(range.max_value)).toBeCloseTo(7 * F, 3);
      expect(range.benchmark_value).toBeNull();
      expect(num(valued.benchmark_value)).toBeCloseTo(6 * F, 3);
      expect(num(s.cb[0].max_value)).toBeCloseTo(7 * F, 3);
      expect(num(s.cb[1].benchmark_value)).toBeCloseTo(6 * F, 3);
      expect(num(s.g.target_value)).toBeCloseTo(6 * F, 3);
      expect(num(s.g.baseline_value)).toBeCloseTo(4 * F, 3);
      expect(num(s.g.current_value)).toBeCloseTo(5 * F, 3);
      expect(num(s.rb.benchmark_value)).toBeCloseTo(5 * F, 3);
      expect(num(s.rbEval.benchmark_value)).toBe(5); // eval reports stay untouched
      expect(s.cache).toBe(0);
      expect(num(s.report.benchmarks.userDefined[0].value)).toBeCloseTo(5 * F, 3);
      expect(s.report.benchmarks.userDefined[0].label).toBe('target');
      expect(s.report.benchmarks.userDefined[1].value).toBe(1.3); // another metric stays
      expect(s.evalReport.benchmarks.userDefined[0].value).toBe(5); // eval config is immutable
    });
  });

  it('a second run changes nothing', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const once = await snapshot(tx);
      await tx.unsafe(UP);
      expect(await snapshot(tx)).toEqual(once);
    });
  });

  it('converts only the leg that is still in meters', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx`UPDATE site_metrics SET unit = 'ft' WHERE code = 'HOP_SL_TRIPLE_R'`;
      await tx.unsafe(UP);
      const r = (await tx`SELECT value FROM measurements WHERE metric = 'HOP_SL_TRIPLE_R'`)[0];
      const l = (await tx`SELECT value FROM measurements WHERE metric = 'HOP_SL_TRIPLE_L'`)[0];
      expect(num(r.value)).toBe(5);
      expect(num(l.value)).toBeCloseTo(5 * F, 3);
    });
  });

  it.each(['ft', 'Feet', 'foot'])('treats a unit already spelled %s as feet: no conversion, unit normalized to ft', async (spelling) => {
    await rollbackable(async (tx) => {
      await seed(tx, spelling);
      await tx`UPDATE measurements SET units = 'm' WHERE metric = 'HOP_SL_TRIPLE_L'`;
      await tx.unsafe(UP);
      const s = await snapshot(tx);
      expect(s.metric.unit).toBe('ft');
      expect(num(s.metric.validation_min)).toBe(1);
      expect(s.m.units).toBe('ft');
      expect(num(s.m.value)).toBe(5);
      // a row in another unit is never relabeled without a conversion
      const l = (await tx`SELECT value, units FROM measurements WHERE metric = 'HOP_SL_TRIPLE_L'`)[0];
      expect(l.units).toBe('m');
      expect(num(l.value)).toBe(5);
    });
  });

  it('raises on an unexpected unit and leaves the data alone', async () => {
    await rollbackable(async (tx) => {
      await seed(tx, 'yd');
      await expect(tx.unsafe(UP)).rejects.toThrow(/expected m\/meter\/meters or ft/);
    });
  });

  it('skips quietly when the metrics do not exist', async () => {
    await rollbackable(async (tx) => {
      await tx`DELETE FROM site_metrics WHERE code IN ('HOP_SL_TRIPLE_L', 'HOP_SL_TRIPLE_R')`;
      await tx.unsafe(UP);
    });
  });

  it('down restores meters and forgets the tracking row', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      const before = await snapshot(tx);
      await tx.unsafe(UP);
      await tx`CREATE TABLE IF NOT EXISTS manual_migrations (id SERIAL PRIMARY KEY, migration_name TEXT NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT NOW())`;
      await tx`INSERT INTO manual_migrations (migration_name) VALUES ('0168_triple_hop_meters_to_feet') ON CONFLICT DO NOTHING`;
      await tx.unsafe(DOWN);
      const after = await snapshot(tx);
      expect(after.metric.unit).toBe('m');
      expect(after.m.units).toBe('m');
      expect(num(after.m.value)).toBeCloseTo(num(before.m.value), 2);
      expect(num(after.g.target_value)).toBeCloseTo(num(before.g.target_value), 2);
      expect(num(after.report.benchmarks.userDefined[0].value)).toBeCloseTo(5, 2);
      const row = await tx`SELECT 1 FROM manual_migrations WHERE migration_name = '0168_triple_hop_meters_to_feet'`;
      expect(row.length).toBe(0);
    });
  });
});
