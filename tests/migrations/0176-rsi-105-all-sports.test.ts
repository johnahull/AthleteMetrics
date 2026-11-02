/**
 * Migration 0176: the 10/5 repeat hop metrics (RSI_105, RSI_105_HEIGHT, RSI_105_GCT) apply to every sport.
 * A NULL sport_associations means "all sports". 0175 gave the two new codes {Soccer} through a COALESCE fallback, and an
 * admin may have tagged RSI_105; 0176 clears all three and keeps a backup so the down migration restores each row exactly.
 * Plain RSI is deliberately left alone.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0176_rsi_105_metrics_all_sports';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0176: static analysis', () => {
  it('clears sport_associations only for the three 10/5 codes and never touches plain RSI', () => {
    expect(UP).toMatch(/SET sport_associations = NULL/);
    expect(UP).toMatch(/code IN \('RSI_105', 'RSI_105_HEIGHT', 'RSI_105_GCT'\)/);
    expect(UP).not.toMatch(/'RSI'\s*[,)\]]/);
    expect(DOWN).not.toMatch(/'RSI'\s*[,)\]]/);
  });
  it('backs up the prior values (exactly, NULL included) without dropping an existing backup', () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS site_metrics_sport_backup_0176/);
    expect(UP).toMatch(/ON CONFLICT \(code\) DO NOTHING/);
    expect(UP).not.toMatch(/DROP TABLE/i);
  });
  it('is idempotent: only rows that still have a tag are updated', () => {
    expect(UP).toMatch(/AND sport_associations IS NOT NULL/);
  });
  it('is transaction-safe and passes the migration safety rules', () => {
    for (const sql of [UP, DOWN]) {
      expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
      expect(sql).not.toMatch(/TRUNCATE|CONCURRENTLY/i);
    }
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS site_metrics_sport_backup_0176/);
  });
  it('down restores from the backup, drops it and forgets its manual_migrations row', () => {
    expect(DOWN).toMatch(/FROM site_metrics_sport_backup_0176/);
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0176: against a disposable DB (rolled back)', () => {
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
        await fn(tx);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  };

  const CODES = ['RSI', 'RSI_105', 'RSI_105_HEIGHT', 'RSI_105_GCT'];
  const seed = async (tx: any, tags: Record<string, string[] | null>) => {
    // A local DB that already ran 0176 holds a real backup; the test must start without one.
    await tx`DROP TABLE IF EXISTS site_metrics_sport_backup_0176`;
    // Only the 10/5 codes are deleted (as in the 0175 test); plain RSI may be referenced by goals, so it is upserted.
    await tx`DELETE FROM site_metrics WHERE code IN ('RSI_105', 'RSI_105_HEIGHT', 'RSI_105_GCT')`;
    for (const [code, assoc] of Object.entries(tags)) {
      await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, display_order, is_system_default, is_active, sport_associations)
               VALUES (${code}, ${code}, 'Power', 'ratio', 'higher_is_better', 70, true, true, ${assoc})
               ON CONFLICT (code) DO UPDATE SET sport_associations = EXCLUDED.sport_associations`;
    }
  };
  const tags = async (tx: any) => {
    const rows = await tx`SELECT code, sport_associations FROM site_metrics WHERE code = ANY(${CODES})`;
    return Object.fromEntries(rows.map((r: any) => [r.code, r.sport_associations]));
  };

  it('clears {Soccer} and admin-set tags on the three codes, leaves RSI and other metrics alone', async () => {
    await rollbackable(async (tx) => {
      await seed(tx, { RSI: ['Soccer'], RSI_105: ['SOCCER', 'BASKETBALL'], RSI_105_HEIGHT: ['Soccer'], RSI_105_GCT: ['Soccer'] });
      await tx.unsafe(UP);
      expect(await tags(tx)).toEqual({ RSI: ['Soccer'], RSI_105: null, RSI_105_HEIGHT: null, RSI_105_GCT: null });
    });
  });

  it('does nothing and does not fail when the codes are missing', async () => {
    await rollbackable(async (tx) => {
      await seed(tx, { RSI: ['Soccer'] });
      await tx.unsafe(UP);
      expect(await tags(tx)).toEqual({ RSI: ['Soccer'] });
    });
  });

  it('a second run changes nothing and keeps the original backup', async () => {
    await rollbackable(async (tx) => {
      await seed(tx, { RSI_105: null, RSI_105_HEIGHT: ['Soccer'], RSI_105_GCT: ['SOCCER'] });
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      const backup = await tx`SELECT code, sport_associations FROM site_metrics_sport_backup_0176 ORDER BY code`;
      expect(backup.map((r: any) => [r.code, r.sport_associations])).toEqual([
        ['RSI_105', null],
        ['RSI_105_GCT', ['SOCCER']],
        ['RSI_105_HEIGHT', ['Soccer']],
      ]);
    });
  });

  it('down is a no-op without a backup table, and safe to run twice', async () => {
    await rollbackable(async (tx) => {
      await seed(tx, { RSI_105: ['SOCCER'] });
      await tx.unsafe(DOWN);
      expect(await tags(tx)).toMatchObject({ RSI_105: ['SOCCER'] });
      await tx.unsafe(UP);
      await tx.unsafe(DOWN);
      await tx.unsafe(DOWN);
      expect(await tags(tx)).toMatchObject({ RSI_105: ['SOCCER'] });
    });
  });

  it('down restores each row exactly (NULL stays NULL) and drops the backup', async () => {
    await rollbackable(async (tx) => {
      await seed(tx, { RSI: ['Soccer'], RSI_105: null, RSI_105_HEIGHT: ['Soccer'], RSI_105_GCT: ['SOCCER', 'BASKETBALL'] });
      await tx.unsafe(UP);
      await tx.unsafe(DOWN);
      expect(await tags(tx)).toEqual({
        RSI: ['Soccer'], RSI_105: null, RSI_105_HEIGHT: ['Soccer'], RSI_105_GCT: ['SOCCER', 'BASKETBALL'],
      });
      const [{ exists }] = await tx`SELECT to_regclass('site_metrics_sport_backup_0176') IS NOT NULL AS exists`;
      expect(exists).toBe(false);
    });
  });
});
