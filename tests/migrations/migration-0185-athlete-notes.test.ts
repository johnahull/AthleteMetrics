/**
 * Migration 0185: athlete_notes table (AM-FEAT-025). CI builds its DB with db:push, so the static tests prove the
 * SQL matches the Drizzle definition (columns, ON DELETE, index); the live test runs the up/down pair in a
 * rolled-back transaction, only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { getTableConfig } from 'drizzle-orm/pg-core';
import { athleteNotes } from '../../packages/shared/schema/tables/athlete-notes';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0185_add_athlete_notes';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0185: static analysis', () => {
  it('is idempotent, runs no BEGIN/COMMIT, and down drops the table and forgets the tracking row', () => {
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS athlete_notes/);
    expect(UP).toMatch(/CREATE INDEX IF NOT EXISTS athlete_notes_athlete_org_observed_idx/);
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS athlete_notes/);
    expect(DOWN).toContain("to_regclass('manual_migrations')");
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
    for (const sql of [UP, DOWN]) expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });

  it('declares the same ON DELETE behavior, nullability and no observed_on default as the Drizzle table', () => {
    const cfg = getTableConfig(athleteNotes);
    const col = (n: string) => cfg.columns.find((c) => c.name === n)!;
    const fk = (n: string) => cfg.foreignKeys.find((f) => f.reference().columns[0].name === n)!.onDelete;
    expect(fk('athlete_id')).toBe('cascade');
    expect(fk('organization_id')).toBe('cascade');
    expect(fk('author_id')).toBe('set null');
    expect(fk('event_id')).toBe('set null');
    expect(UP).toMatch(/athlete_id VARCHAR\(36\) NOT NULL REFERENCES users\(id\) ON DELETE CASCADE/);
    expect(UP).toMatch(/organization_id VARCHAR\(36\) NOT NULL REFERENCES organizations\(id\) ON DELETE CASCADE/);
    expect(UP).toMatch(/author_id VARCHAR\(36\) REFERENCES users\(id\) ON DELETE SET NULL/);
    expect(UP).toMatch(/event_id VARCHAR\(36\) REFERENCES events\(id\) ON DELETE SET NULL/);
    expect(UP).toMatch(/observed_on DATE NOT NULL,/);
    expect(col('observed_on').hasDefault).toBe(false);
    expect(col('observed_on').notNull).toBe(true);
    expect(col('body').notNull).toBe(true);
    expect(col('category').notNull).toBe(false);
    expect(cfg.indexes.map((i) => i.config.name)).toEqual(['athlete_notes_athlete_org_observed_idx']);
    expect(cfg.indexes[0].config.columns.map((c: any) => c.name)).toEqual(['athlete_id', 'organization_id', 'observed_on']);
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0185: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1, onnotice: () => {} });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  const columns = async (tx: any) =>
    (await tx`SELECT column_name, is_nullable, column_default FROM information_schema.columns
              WHERE table_name = 'athlete_notes' ORDER BY ordinal_position`) as Array<{ column_name: string; is_nullable: string; column_default: string | null }>;
  const deleteRules = async (tx: any) =>
    Object.fromEntries(
      (await tx`SELECT kcu.column_name, rc.delete_rule FROM information_schema.referential_constraints rc
                JOIN information_schema.key_column_usage kcu ON kcu.constraint_name = rc.constraint_name
                WHERE kcu.table_name = 'athlete_notes'`).map((r: any) => [r.column_name, r.delete_rule]),
    );

  it('up creates the table (re-runnable) with the cascade rules; down drops it; up again works', async () => {
    const ROLLBACK = new Error('rollback');
    try {
      await sql.begin(async (tx: any) => {
        await tx.unsafe(DOWN);
        expect(await columns(tx)).toEqual([]);
        await tx.unsafe(UP);
        await tx.unsafe(UP);
        const cols = await columns(tx);
        expect(cols.map((c) => c.column_name)).toEqual([
          'id', 'athlete_id', 'organization_id', 'author_id', 'event_id', 'category', 'flagged', 'observed_on', 'body', 'created_at', 'updated_at',
        ]);
        expect(cols.find((c) => c.column_name === 'observed_on')).toMatchObject({ is_nullable: 'NO', column_default: null });
        expect(await deleteRules(tx)).toEqual({
          athlete_id: 'CASCADE', organization_id: 'CASCADE', author_id: 'SET NULL', event_id: 'SET NULL',
        });
        await tx.unsafe(DOWN);
        expect(await columns(tx)).toEqual([]);
        await tx.unsafe(UP);
        expect((await columns(tx)).length).toBe(11);
        throw ROLLBACK;
      });
    } catch (e) {
      if (e !== ROLLBACK) throw e;
    }
  });
});
