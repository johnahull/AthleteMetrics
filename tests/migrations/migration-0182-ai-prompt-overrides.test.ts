/**
 * Migration 0182: site_settings.ai_prompt_overrides jsonb (site-admin editable AI insights prompt) and the
 * 'site_ai_prompt_changed' audit action. CI builds its DB with db:push, which has no audit CHECK, so only this
 * test (on a DB with the manual migrations applied) proves the CHECK accepts the action.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0182_add_ai_prompt_overrides';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);
const PREV_UP = read('0173_add_missing_audit_actions.sql');
const PREV_DOWN = read('0173_add_missing_audit_actions_down.sql');
const ACTION = 'site_ai_prompt_changed';

const listOf = (sql: string) => {
  const start = sql.indexOf('ADD CONSTRAINT audit_logs_action_valid');
  const body = sql.slice(start, sql.indexOf('))', start));
  return [...body.replace(/--.*$/gm, '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
};

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0182: static analysis', () => {
  it('the up list is the 0173 list plus site_ai_prompt_changed; the down list is exactly 0173 (NOT VALID)', () => {
    const previous = listOf(PREV_UP);
    expect(previous.length).toBeGreaterThan(100);
    expect(listOf(UP)).toEqual([...previous, ACTION]);
    expect(listOf(DOWN)).toEqual(previous);
    expect(PREV_DOWN).toBeTruthy();
    expect(DOWN.match(/\)\) NOT VALID;/g)).toHaveLength(1);
  });
  it('adds the column idempotently, drops it in down, forgets its tracking row, runs no BEGIN/COMMIT', () => {
    expect(UP).toMatch(/ADD COLUMN IF NOT EXISTS ai_prompt_overrides jsonb/);
    expect(DOWN).toMatch(/DROP COLUMN IF EXISTS ai_prompt_overrides/);
    expect(DOWN).toContain("to_regclass('manual_migrations')");
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
    for (const sql of [UP, DOWN]) expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('the code writes the action it allows', () => {
    const routes = fs.readFileSync(path.resolve(__dirname, '../../packages/api/routes/site-settings-routes.ts'), 'utf-8');
    expect(routes).toContain(`'${ACTION}'`);
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0182: against a manual-migrations DB (rolled back)', () => {
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
  const hasColumn = async (tx: any) =>
    (await tx`SELECT 1 FROM information_schema.columns WHERE table_name = 'site_settings' AND column_name = 'ai_prompt_overrides'`).length === 1;
  const rejects = async (tx: any) => {
    let error: unknown = null;
    let inserted = 0;
    await tx
      .savepoint(async (sp: any) => {
        inserted = (
          await sp`INSERT INTO audit_logs (user_id, action, resource_type, resource_id)
                   SELECT id, ${ACTION}, 'site_settings', 'global' FROM users LIMIT 1`
        ).count;
      })
      .catch((e: unknown) => (error = e));
    if (!error && inserted !== 1) throw new Error(`insert wrote ${inserted} rows (no user to attach it to?)`);
    return (error as { code?: string } | null)?.code === '23514';
  };

  it('up adds the column and allows the action; down removes both; up again works', async () => {
    await rollbackable(async (tx) => {
      await tx`DELETE FROM audit_logs`;
      await tx`INSERT INTO users (username, first_name, last_name, full_name, password)
               SELECT 'mig0182_user', 'Mig', 'Test', 'Mig Test', 'x' WHERE NOT EXISTS (SELECT 1 FROM users)`;
      await tx.unsafe(UP);
      await tx.unsafe(UP); // idempotent
      expect(await hasColumn(tx)).toBe(true);
      expect(await rejects(tx)).toBe(false);

      await tx.unsafe(DOWN);
      expect(await hasColumn(tx)).toBe(false);
      expect(await rejects(tx)).toBe(true);

      await tx.unsafe(UP);
      expect(await hasColumn(tx)).toBe(true);
      expect(await rejects(tx)).toBe(false);
    });
  });
});
