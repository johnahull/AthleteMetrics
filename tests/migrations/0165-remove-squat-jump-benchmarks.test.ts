/**
 * Migration 0165: remove the 12 seeded JUMP_SJ_HEIGHT benchmarks (soccer + volleyball, D1 + HS) and their set items.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0165_remove_squat_jump_benchmarks';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

/** [benchmark id, set id, value, tier] as seeded by 0131 */
const SEEDED = [
  ['d1-soc-sj-d1-avg', 'd1-womens-soccer', 10.2],
  ['d1-soc-sj-d1-top25', 'd1-womens-soccer', 11.8],
  ['hs-ms-soc-sj', 'hs-ms-female-soccer', 6.3],
  ['hs-jv-soc-sj', 'hs-jv-female-soccer', 7.5],
  ['hs-var-soc-sj-avg', 'hs-varsity-female-soccer', 8.7],
  ['hs-var-soc-sj-top25', 'hs-varsity-female-soccer', 10.2],
  ['d1-vb-sj-d1-avg', 'd1-womens-volleyball', 15.0],
  ['d1-vb-sj-d1-top25', 'd1-womens-volleyball', 17.3],
  ['hs-ms-vb-sj', 'hs-ms-female-volleyball', 8.7],
  ['hs-jv-vb-sj', 'hs-jv-female-volleyball', 10.2],
  ['hs-var-vb-sj-avg', 'hs-varsity-female-volleyball', 11.8],
  ['hs-var-vb-sj-top25', 'hs-varsity-female-volleyball', 14.2],
] as const;

describe('Migration 0165: static analysis', () => {
  it('names all 12 benchmark ids in up and down, with no transaction control', () => {
    for (const [id] of SEEDED) {
      expect(UP).toContain(`'${id}'`);
      expect(DOWN).toContain(`'${id}'`);
    }
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('keeps the metric, EUR and measurements', () => {
    expect(UP).not.toMatch(/DELETE FROM (site_metrics|measurements)/);
  });
  it('down restores the seeded values and forgets its manual_migrations row', () => {
    for (const [, , value] of SEEDED) expect(DOWN).toMatch(new RegExp(`\\b${value.toFixed(3)}\\b`));
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });
});

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe.skipIf(!isDisposableTestDb)('Migration 0165: against a disposable DB (rolled back)', () => {
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
        await tx`ALTER TABLE site_benchmarks ALTER COLUMN id TYPE varchar(36)`;
        await tx`INSERT INTO site_metrics (code, label, metric_type, unit) VALUES ('JUMP_SJ_HEIGHT', 'SJ', 'higher_is_better', 'in') ON CONFLICT (code) DO NOTHING`;
        // The state 0131 leaves behind
        for (const [id, setId, value] of SEEDED) {
          await tx`INSERT INTO site_benchmarks (id, metric_code, name, comparison_operator, benchmark_value, tier_name, gender, sport, level, is_active)
                   VALUES (${id}, 'JUMP_SJ_HEIGHT', ${'n-' + id}, 'gte', ${value}, 't', 'Female', 'SOCCER', 'D1', true)
                   ON CONFLICT (metric_code, name) DO NOTHING`;
          await tx`INSERT INTO benchmark_sets (id, name) VALUES (${setId}, ${setId}) ON CONFLICT (id) DO NOTHING`;
          await tx`INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
                   VALUES (${'bsi-' + id}, ${setId}, ${id}, 'site', 60) ON CONFLICT DO NOTHING`;
        }
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  };
  const counts = async (tx: any) => {
    const ids = SEEDED.map(([id]) => id);
    const [b] = await tx`SELECT count(*)::int AS n FROM site_benchmarks WHERE id = ANY(${ids})`;
    const [i] = await tx`SELECT count(*)::int AS n FROM benchmark_set_items WHERE benchmark_id = ANY(${ids})`;
    return { benchmarks: b.n, items: i.n };
  };

  it('removes the 12 benchmarks and their set items, keeps the metric; twice is a no-op', async () => {
    await rollbackable(async (tx) => {
      expect(await counts(tx)).toEqual({ benchmarks: 12, items: 12 });
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      expect(await counts(tx)).toEqual({ benchmarks: 0, items: 0 });
      const [m] = await tx`SELECT count(*)::int AS n FROM site_metrics WHERE code = 'JUMP_SJ_HEIGHT'`;
      expect(m.n).toBe(1);
    });
  });

  it('down restores the 12 benchmarks with their seeded values and set items', async () => {
    await rollbackable(async (tx) => {
      await tx.unsafe(UP);
      await tx.unsafe(DOWN);
      expect(await counts(tx)).toEqual({ benchmarks: 12, items: 12 });
      const [r] = await tx`SELECT benchmark_value::float AS v, gender, sport, level FROM site_benchmarks WHERE id = 'd1-soc-sj-d1-avg'`;
      expect(r).toMatchObject({ v: 10.2, gender: 'Female', sport: 'SOCCER', level: 'D1' });
    });
  });
});
