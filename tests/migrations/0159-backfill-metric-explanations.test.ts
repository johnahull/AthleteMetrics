/**
 * Migration 0159: athlete-facing explanations (short_description, what_it_measures, why_it_matters) for the site
 * metrics that had none, so athletes no longer see the generic custom-metric placeholder.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0159_backfill_metric_explanations';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

const Q = "'((?:[^']|'')*)'";
const ROWS = [...UP.matchAll(new RegExp(`\\('([A-Z0-9_]+)',\\s*${Q},\\s*${Q},\\s*${Q}\\)`, 'g'))].map((m) => ({
  code: m[1],
  short: m[2].replace(/''/g, "'"),
  what: m[3].replace(/''/g, "'"),
  why: m[4].replace(/''/g, "'"),
}));
const CODES = ROWS.map((r) => r.code);

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0159: static analysis', () => {
  it('writes 55 distinct metrics, each with all three non-empty texts', () => {
    expect(ROWS).toHaveLength(55);
    expect(new Set(CODES).size).toBe(CODES.length);
    for (const r of ROWS) {
      for (const [field, text] of [['short', r.short], ['what', r.what], ['why', r.why]]) {
        expect(text.trim().length, `${r.code}.${field}`).toBeGreaterThan(20);
      }
      expect(r.short.length, `${r.code}.short`).toBeLessThanOrEqual(120);
    }
  });
  it('never writes the generic custom-metric placeholder or a tier name', () => {
    for (const r of ROWS) {
      const all = `${r.short} ${r.what} ${r.why}`;
      expect(all, r.code).not.toMatch(/custom metric|ask your coach/i);
      expect(all, r.code).not.toMatch(/\b(tier|elite|developing|wellness)\b/i);
    }
  });
  it('only fills rows that have none of the three texts, and runs no BEGIN/COMMIT of its own', () => {
    expect(UP).toMatch(/AND m\.short_description IS NULL\s+AND m\.what_it_measures IS NULL\s+AND m\.why_it_matters IS NULL/);
    expect(UP).not.toMatch(/INSERT INTO site_metrics/);
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('leaves the two metrics that have curated built-in text alone', () => {
    expect(CODES).not.toContain('AGILITY_COD_DEFICIT_M');
    expect(CODES).not.toContain('AGILITY_COD_DEFICIT_YD');
  });
  it('down clears exactly the same codes, only while the text is still 0159\'s, and forgets its manual_migrations row', () => {
    expect(DOWN).toMatch(/AND m\.what_it_measures = v\.what_it_measures/);
    const downCodes = [...DOWN.matchAll(/'([A-Z0-9_]+)'/g)].map((m) => m[1]).filter((c) => c !== NAME && /^[A-Z]/.test(c));
    expect([...downCodes].sort()).toEqual([...CODES].sort());
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0159: against a disposable DB (rolled back)', () => {
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

  /** Every code exists with no explanation, as on staging */
  const setup = async (tx: any) => {
    for (const code of CODES) {
      await tx`INSERT INTO site_metrics (code, label, metric_type) VALUES (${code}, ${code}, 'higher_is_better') ON CONFLICT (code) DO NOTHING`;
    }
    await tx`UPDATE site_metrics SET short_description = NULL, what_it_measures = NULL, why_it_matters = NULL WHERE code = ANY(${CODES})`;
    if ((await tx`SELECT to_regclass('manual_migrations') AS t`)[0].t) {
      await tx`DELETE FROM manual_migrations WHERE migration_name = ${NAME}`;
    }
  };
  const textOf = async (tx: any, code: string) =>
    (await tx`SELECT short_description, what_it_measures, why_it_matters FROM site_metrics WHERE code = ${code}`)[0];

  it('fills all three texts for every listed metric', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx.unsafe(UP);
      for (const r of ROWS) {
        expect(await textOf(tx, r.code), r.code).toEqual({ short_description: r.short, what_it_measures: r.what, why_it_matters: r.why });
      }
    });
  });

  it('leaves a metric an admin already wrote text for untouched, even partly', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx`UPDATE site_metrics SET what_it_measures = 'admin wrote this' WHERE code = 'WEIGHT_LBS'`;
      await tx`UPDATE site_metrics SET short_description = 's', what_it_measures = 'w', why_it_matters = 'y' WHERE code = 'HEIGHT_IN'`;
      await tx.unsafe(UP);
      expect(await textOf(tx, 'WEIGHT_LBS')).toEqual({ short_description: null, what_it_measures: 'admin wrote this', why_it_matters: null });
      expect(await textOf(tx, 'HEIGHT_IN')).toEqual({ short_description: 's', what_it_measures: 'w', why_it_matters: 'y' });
    });
  });

  it('is a no-op when run twice', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx.unsafe(UP);
      await tx`UPDATE site_metrics SET updated_at = '2020-01-01' WHERE code = ANY(${CODES})`;
      await tx.unsafe(UP);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM site_metrics WHERE code = ANY(${CODES}) AND updated_at <> '2020-01-01'`;
      expect(n).toBe(0);
    });
  });

  it('down keeps text that was there before the up or edited since', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx`UPDATE site_metrics SET short_description = 'pre', what_it_measures = 'pre', why_it_matters = 'pre' WHERE code = 'HEIGHT_IN'`;
      await tx.unsafe(UP);
      await tx`UPDATE site_metrics SET why_it_matters = 'edited later' WHERE code = 'WINGSPAN'`;
      await tx.unsafe(DOWN);
      expect(await textOf(tx, 'HEIGHT_IN')).toEqual({ short_description: 'pre', what_it_measures: 'pre', why_it_matters: 'pre' });
      expect((await textOf(tx, 'WINGSPAN')).why_it_matters).toBe('edited later');
      expect(await textOf(tx, 'WEIGHT_LBS')).toEqual({ short_description: null, what_it_measures: null, why_it_matters: null });
    });
  });

  it('down clears the texts again and forgets the tracking row', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx.unsafe(UP);
      const hasTracking = !!(await tx`SELECT to_regclass('manual_migrations') AS t`)[0].t;
      if (hasTracking) await tx`INSERT INTO manual_migrations (migration_name) VALUES (${NAME}) ON CONFLICT DO NOTHING`;
      await tx.unsafe(DOWN);
      for (const code of CODES) {
        expect(await textOf(tx, code), code).toEqual({ short_description: null, what_it_measures: null, why_it_matters: null });
      }
      if (hasTracking) {
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM manual_migrations WHERE migration_name = ${NAME}`;
        expect(n).toBe(0);
      }
    });
  });
});
