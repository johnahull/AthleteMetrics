/**
 * Migration 0155 (AM-FEAT-019): allow the eval template audit actions in the audit_logs CHECK constraints.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0155_add_eval_template_audit_actions.sql');
const DOWN = read('0155_add_eval_template_audit_actions_down.sql');
const CANONICAL_0130 = read('0130_restore_audit_actions_and_display_order_defaults.sql');

const NEW_ACTIONS = ['eval_template_updated', 'eval_template_deleted'];
const NEW_RESOURCE = 'eval_template';

/** The quoted values of one CHECK (... IN (...)) list */
const listOf = (sql: string, constraint: string) => {
  const start = sql.indexOf(`ADD CONSTRAINT ${constraint}`);
  const body = sql.slice(start, sql.indexOf('))', start));
  return [...body.replace(/--.*$/gm, '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
};

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0155: static analysis', () => {
  it('the up lists are the 0130 lists plus the eval template values', () => {
    const actions0130 = listOf(CANONICAL_0130, 'audit_logs_action_valid');
    const resources0130 = listOf(CANONICAL_0130, 'audit_logs_resource_type_valid');
    expect(actions0130.length).toBeGreaterThan(100);
    expect(listOf(UP, 'audit_logs_action_valid')).toEqual([...actions0130, ...NEW_ACTIONS]);
    expect(listOf(UP, 'audit_logs_resource_type_valid')).toEqual([...resources0130, NEW_RESOURCE]);
  });
  it('the down lists are exactly the 0130 lists, re-added NOT VALID, and the down forgets its manual_migrations row', () => {
    expect(listOf(DOWN, 'audit_logs_action_valid')).toEqual(listOf(CANONICAL_0130, 'audit_logs_action_valid'));
    expect(listOf(DOWN, 'audit_logs_resource_type_valid')).toEqual(listOf(CANONICAL_0130, 'audit_logs_resource_type_valid'));
    expect(DOWN.match(/\)\) NOT VALID;/g)).toHaveLength(2);
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0155_add_eval_template_audit_actions'/);
  });
  it('runs no BEGIN/COMMIT of its own', () => {
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(DOWN).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0155: against a disposable DB (rolled back)', () => {
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
  const insertAudit = (tx: any, action: string, resourceType = NEW_RESOURCE) =>
    tx`INSERT INTO audit_logs (action, resource_type, resource_id) VALUES (${action}, ${resourceType}, 'mig0155')`;
  const rejects = async (tx: any, action: string, resourceType?: string) => {
    let error: unknown = null;
    await tx.savepoint(async (sp: any) => insertAudit(sp, action, resourceType)).catch((e: unknown) => (error = e));
    return (error as { code?: string } | null)?.code === '23514';
  };

  it('accepts the new values after up (idempotent), rejects an unknown action, and down restores the old lists', async () => {
    await rollbackable(async (tx) => {
      // Rows other tests wrote may not satisfy a strict list on a push-only DB; this transaction is rolled back
      await tx`DELETE FROM audit_logs`;
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      for (const action of NEW_ACTIONS) await insertAudit(tx, action);
      await insertAudit(tx, 'event_metrics_bulk_added', 'event');
      expect(await rejects(tx, 'zz_not_an_action')).toBe(true);
      expect(await rejects(tx, 'event_created', 'zz_not_a_resource')).toBe(true);

      await tx.unsafe(DOWN);
      expect(await rejects(tx, 'eval_template_updated')).toBe(true);
      // rows written while 0155 was in place are kept
      expect((await tx`SELECT count(*)::int AS n FROM audit_logs WHERE action = 'eval_template_deleted'`)[0].n).toBe(1);
    });
  });
});
