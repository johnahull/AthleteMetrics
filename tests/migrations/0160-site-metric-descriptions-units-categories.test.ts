/**
 * Migration 0160: descriptions for six site metrics that had none, the RSI unit, and one category spelling per
 * category ("Power", "speed"). Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0160_site_metric_descriptions_units_categories';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

const Q = "'((?:[^']|'')*)'";
const EXPECTED_DESC = Object.fromEntries(
  [...UP.matchAll(new RegExp(`\\('([A-Z0-9_]+)',\\s*${Q}\\)`, 'g'))].map((m) => [m[1], m[2].replace(/''/g, "'")]),
);
const DESCRIBED = ['APPROACH_JUMP', 'APPROACH_REACH', 'BLOCK_JUMP', 'BLOCK_REACH', 'DASH_10YD', 'TOP_SPEED_MPH'];
const RSI_CODES = ['RSI', 'RSI_SINGLE_LEFT', 'RSI_SINGLE_RIGHT', 'RSI_105'];
const SPEED_UP = ['DASH_5YD', 'DASH_20YD', 'DASH_30YD', 'TOP_SPEED_MPH', 'DASH_10YD'];

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0160: static analysis', () => {
  it('describes the six metrics, only where the description is empty', () => {
    for (const code of DESCRIBED) expect(UP, code).toContain(`'${code}'`);
    expect(UP).toMatch(/description IS NULL OR btrim\(m\.description\) = ''/);
  });
  it('sets the RSI unit to ratio only where it is empty, and never inserts or deletes rows', () => {
    expect(UP).toMatch(/unit = 'ratio'/);
    expect(UP).toMatch(/unit IS NULL OR unit = ''/);
    expect(UP).not.toMatch(/INSERT INTO|DELETE FROM site_metrics/);
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('down forgets its manual_migrations row', () => {
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0160: against a disposable DB (rolled back)', () => {
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

  const ALL = [...new Set([...DESCRIBED, ...RSI_CODES, ...SPEED_UP])];
  /** The rows as they are on staging before 0160 */
  const setup = async (tx: any) => {
    for (const code of ALL) {
      await tx`INSERT INTO site_metrics (code, label, metric_type) VALUES (${code}, ${code}, 'higher_is_better') ON CONFLICT (code) DO NOTHING`;
    }
    await tx`UPDATE site_metrics SET description = NULL, unit = 'x', category = 'Power' WHERE code = ANY(${ALL})`;
    await tx`UPDATE site_metrics SET unit = '' WHERE code = ANY(${RSI_CODES})`;
    await tx`UPDATE site_metrics SET category = 'power' WHERE code IN ('RSI', 'RSI_105')`;
    await tx`UPDATE site_metrics SET category = 'Speed' WHERE code IN ('DASH_5YD', 'DASH_20YD', 'DASH_30YD', 'TOP_SPEED_MPH')`;
    await tx`UPDATE site_metrics SET category = 'Acceleration' WHERE code = 'DASH_10YD'`;
    if ((await tx`SELECT to_regclass('manual_migrations') AS t`)[0].t) {
      await tx`DELETE FROM manual_migrations WHERE migration_name = ${NAME}`;
    }
  };
  const row = async (tx: any, code: string) =>
    (await tx`SELECT description, unit, category FROM site_metrics WHERE code = ${code}`)[0];

  it('fills the six descriptions', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx.unsafe(UP);
      expect(Object.keys(EXPECTED_DESC).sort()).toEqual([...DESCRIBED].sort());
      for (const code of DESCRIBED) expect((await row(tx, code)).description, code).toBe(EXPECTED_DESC[code]);
    });
  });

  it('keeps a description an admin already wrote', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx`UPDATE site_metrics SET description = 'admin text' WHERE code = 'DASH_10YD'`;
      await tx.unsafe(UP);
      expect((await row(tx, 'DASH_10YD')).description).toBe('admin text');
    });
  });

  it('sets the RSI unit to ratio but leaves a unit that is already set', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx`UPDATE site_metrics SET unit = 'index' WHERE code = 'RSI_105'`;
      await tx.unsafe(UP);
      for (const code of ['RSI', 'RSI_SINGLE_LEFT', 'RSI_SINGLE_RIGHT']) expect((await row(tx, code)).unit, code).toBe('ratio');
      expect((await row(tx, 'RSI_105')).unit).toBe('index');
    });
  });

  it('merges category spellings: power to Power, Speed and Acceleration to speed', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx.unsafe(UP);
      expect((await row(tx, 'RSI')).category).toBe('Power');
      expect((await row(tx, 'RSI_105')).category).toBe('Power');
      for (const code of SPEED_UP) expect((await row(tx, code)).category, code).toBe('speed');
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM site_metrics WHERE code = ANY(${ALL}) AND category IN ('power', 'Speed', 'Acceleration')`;
      expect(n).toBe(0);
    });
  });

  it('merges VERTICAL_JUMP too', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx`INSERT INTO site_metrics (code, label, metric_type, category) VALUES ('VERTICAL_JUMP', 'Vertical Jump', 'higher_is_better', 'power') ON CONFLICT (code) DO UPDATE SET category = 'power'`;
      await tx.unsafe(UP);
      expect((await row(tx, 'VERTICAL_JUMP')).category).toBe('Power');
    });
  });

  it('leaves other metrics spelled power alone', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx`INSERT INTO site_metrics (code, label, metric_type, category) VALUES ('ZZ_LOWER_POWER', 'x', 'higher_is_better', 'power') ON CONFLICT (code) DO UPDATE SET category = 'power'`;
      await tx.unsafe(UP);
      expect((await row(tx, 'ZZ_LOWER_POWER')).category).toBe('power');
    });
  });

  it('is a no-op when run twice', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx.unsafe(UP);
      await tx`UPDATE site_metrics SET updated_at = '2020-01-01' WHERE code = ANY(${ALL})`;
      await tx.unsafe(UP);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM site_metrics WHERE code = ANY(${ALL}) AND updated_at <> '2020-01-01'`;
      expect(n).toBe(0);
    });
  });

  it('down restores the earlier values and forgets the tracking row', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx.unsafe(UP);
      const hasTracking = !!(await tx`SELECT to_regclass('manual_migrations') AS t`)[0].t;
      if (hasTracking) await tx`INSERT INTO manual_migrations (migration_name) VALUES (${NAME}) ON CONFLICT DO NOTHING`;
      await tx.unsafe(DOWN);
      for (const code of DESCRIBED) expect((await row(tx, code)).description, code).toBeNull();
      for (const code of RSI_CODES) expect((await row(tx, code)).unit, code).toBe('');
      expect((await row(tx, 'RSI')).category).toBe('power');
      expect((await row(tx, 'DASH_5YD')).category).toBe('Speed');
      expect((await row(tx, 'DASH_10YD')).category).toBe('Acceleration');
      if (hasTracking) {
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM manual_migrations WHERE migration_name = ${NAME}`;
        expect(n).toBe(0);
      }
    });
  });
});
