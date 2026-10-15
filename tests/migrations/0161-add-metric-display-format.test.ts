/**
 * Migration 0161: display_format ('decimal' | 'duration') on site_metrics and custom_org_metrics.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { randomUUID } from 'crypto';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0161_add_metric_display_format';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0161: static analysis', () => {
  it('adds the column to both tables, idempotently, with a decimal default', () => {
    for (const table of ['site_metrics', 'custom_org_metrics']) {
      expect(UP).toMatch(
        new RegExp(`ALTER TABLE ${table}\\s+ADD COLUMN IF NOT EXISTS display_format text NOT NULL DEFAULT 'decimal'`),
      );
    }
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('down drops both columns and forgets its manual_migrations row', () => {
    expect(DOWN).toMatch(/DROP COLUMN IF EXISTS display_format/);
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0161: against a disposable DB (rolled back)', () => {
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

  /** The tables as they are before 0161 (db:push may already have added the column) */
  const setup = async (tx: any) => {
    await tx`ALTER TABLE site_metrics DROP COLUMN IF EXISTS display_format`;
    await tx`ALTER TABLE custom_org_metrics DROP COLUMN IF EXISTS display_format`;
  };
  const columns = async (tx: any) =>
    (
      await tx`SELECT table_name FROM information_schema.columns
               WHERE column_name = 'display_format' AND table_name IN ('site_metrics', 'custom_org_metrics')`
    ).map((r: any) => r.table_name).sort();

  it('existing rows read back as decimal', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const siteId = randomUUID();
      const orgId = randomUUID();
      const customId = randomUUID();
      await tx`INSERT INTO site_metrics (id, code, label, metric_type) VALUES (${siteId}, ${'ZZ_0161_' + siteId.slice(0, 8)}, 'x', 'lower_is_better')`;
      await tx`INSERT INTO organizations (id, name) VALUES (${orgId}, ${'0161 org ' + orgId})`;
      await tx`INSERT INTO custom_org_metrics (id, organization_id, code, label, unit) VALUES (${customId}, ${orgId}, 'ZZ_0161', 'x', 's')`;
      await tx.unsafe(UP);
      expect((await tx`SELECT display_format FROM site_metrics WHERE id = ${siteId}`)[0].display_format).toBe('decimal');
      expect((await tx`SELECT display_format FROM custom_org_metrics WHERE id = ${customId}`)[0].display_format).toBe('decimal');
    });
  });

  it('is a no-op when run twice', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      expect(await columns(tx)).toEqual(['custom_org_metrics', 'site_metrics']);
    });
  });

  it('down drops the columns and forgets the tracking row', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx.unsafe(UP);
      const hasTracking = !!(await tx`SELECT to_regclass('manual_migrations') AS t`)[0].t;
      if (hasTracking) await tx`INSERT INTO manual_migrations (migration_name) VALUES (${NAME}) ON CONFLICT DO NOTHING`;
      await tx.unsafe(DOWN);
      expect(await columns(tx)).toEqual([]);
      if (hasTracking) {
        const [{ n }] = await tx`SELECT count(*)::int AS n FROM manual_migrations WHERE migration_name = ${NAME}`;
        expect(n).toBe(0);
      }
    });
  });
});
