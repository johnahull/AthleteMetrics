/**
 * Migration 0163: sameRunInputs on AGILITY_COD_DEFICIT_M_INTERP.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0163_cod_deficit_same_run_inputs';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);
const CODE = 'AGILITY_COD_DEFICIT_M_INTERP';
const BASE = '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}';

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0163: static analysis', () => {
  it('only touches the COD interp metric and has no transaction control', () => {
    expect(UP).toMatch(/WHERE code = 'AGILITY_COD_DEFICIT_M_INTERP'/);
    expect(UP).toMatch(/"sameRunInputs":\["DASH_10YD","DASH_20YD"\]/);
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('down removes the key and forgets its manual_migrations row', () => {
    expect(DOWN).toMatch(/- 'sameRunInputs'/);
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0163: against a disposable DB (rolled back)', () => {
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

  /** The metric as 0161 leaves it (a db:push + seed database does not have it) */
  const seed = async (tx: any) => {
    await tx`DELETE FROM site_metrics WHERE code = ${CODE}`;
    await tx`INSERT INTO site_metrics (code, label, metric_type, is_derived, formula, dependent_metrics, calculation_config)
             VALUES (${CODE}, 'COD', 'lower_is_better', true, 'dash_10yd', ARRAY['DASH_10YD', 'DASH_20YD'], ${tx.json(JSON.parse(BASE))})`;
  };
  const config = async (tx: any) => (await tx`SELECT calculation_config AS c FROM site_metrics WHERE code = ${CODE}`)[0].c;

  it('adds sameRunInputs and keeps the rest of the config; twice is a no-op', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      expect(await config(tx)).toEqual({
        dateMatchStrategy: 'same_date',
        missingSourceBehavior: 'skip',
        sameRunInputs: ['DASH_10YD', 'DASH_20YD'],
      });
    });
  });

  it('does nothing when the metric is absent', async () => {
    await rollbackable(async (tx) => {
      await tx`DELETE FROM site_metrics WHERE code = ${CODE}`;
      await tx.unsafe(UP);
      expect(await tx`SELECT 1 FROM site_metrics WHERE code = ${CODE}`).toHaveLength(0);
    });
  });

  it('down removes only sameRunInputs and forgets the tracking row', async () => {
    await rollbackable(async (tx) => {
      await seed(tx);
      await tx.unsafe(UP);
      const hasTracking = !!(await tx`SELECT to_regclass('manual_migrations') AS t`)[0].t;
      if (hasTracking) await tx`INSERT INTO manual_migrations (migration_name) VALUES (${NAME}) ON CONFLICT DO NOTHING`;
      await tx.unsafe(DOWN);
      expect(await config(tx)).toEqual(JSON.parse(BASE));
      if (hasTracking) {
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM manual_migrations WHERE migration_name = ${NAME}`;
        expect(n).toBe(0);
      }
    });
  });
});
