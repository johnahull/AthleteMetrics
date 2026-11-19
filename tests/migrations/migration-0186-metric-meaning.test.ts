/**
 * Migration 0186: meaning column on site_metrics and custom_org_metrics. CI builds its DB with db:push, so the static
 * tests prove the SQL matches the Drizzle definitions; the live test runs the up/down pair in a rolled-back
 * transaction, only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { siteMetrics, customOrgMetrics } from '../../packages/shared/schema/tables/metrics';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0186_add_metric_meaning';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0186: static analysis', () => {
  it('is idempotent, runs no BEGIN/COMMIT, and down drops both columns and forgets the tracking row', () => {
    expect(UP).toMatch(/ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS meaning TEXT;/);
    expect(UP).toMatch(/ALTER TABLE custom_org_metrics ADD COLUMN IF NOT EXISTS meaning TEXT;/);
    expect(DOWN).toMatch(/ALTER TABLE site_metrics DROP COLUMN IF EXISTS meaning;/);
    expect(DOWN).toMatch(/ALTER TABLE custom_org_metrics DROP COLUMN IF EXISTS meaning;/);
    expect(DOWN).toContain("to_regclass('manual_migrations')");
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
    for (const sql of [UP, DOWN]) expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });

  it('matches the Drizzle tables: nullable text, no default', () => {
    for (const table of [siteMetrics, customOrgMetrics]) {
      const col = getTableConfig(table).columns.find((c) => c.name === 'meaning')!;
      expect(col.dataType).toBe('string');
      expect(col.notNull).toBe(false);
      expect(col.hasDefault).toBe(false);
    }
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0186: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  const has = async (tx: any, table: string) =>
    (await tx`SELECT is_nullable, column_default FROM information_schema.columns
              WHERE table_name = ${table} AND column_name = 'meaning'`) as Array<{ is_nullable: string; column_default: string | null }>;

  it('up adds the nullable columns (re-runnable); down drops them; up again works', async () => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx: any) => {
        await tx.unsafe(DOWN);
        expect(await has(tx, 'site_metrics')).toEqual([]);
        await tx.unsafe(UP);
        await tx.unsafe(UP);
        for (const t of ['site_metrics', 'custom_org_metrics']) {
          expect(await has(tx, t)).toEqual([{ is_nullable: 'YES', column_default: null }]);
        }
        await tx.unsafe(DOWN);
        expect(await has(tx, 'custom_org_metrics')).toEqual([]);
        await tx.unsafe(UP);
        expect((await has(tx, 'site_metrics')).length).toBe(1);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  });
});
