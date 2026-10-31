/**
 * Migration 0172: allow audit actions the code already writes but the audit_logs CHECK constraint rejected.
 *
 * - user_assigned_to_organization: written in the SAME transaction as the membership insert by
 *   POST /api/organizations/:orgId/users/:userId/assign, so the rejected audit row rolled the assignment back (500).
 * - measurements_bulk_delete, org_metrics_bulk_updated, profile_completed: written best effort (try/catch),
 *   so their audit rows were silently lost.
 *
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const read = (f: string) => fs.readFileSync(path.resolve(root, 'migrations', f), 'utf-8');
const UP = read('0172_add_missing_audit_actions.sql');
const DOWN = read('0172_add_missing_audit_actions_down.sql');
const PREVIOUS = read('0155_add_eval_template_audit_actions.sql');

const NEW_ACTIONS = [
  'user_assigned_to_organization',
  'measurements_bulk_delete',
  'org_metrics_bulk_updated',
  'profile_completed',
];

/**
 * Still rejected on purpose: the waiver audit write also needs resource_type 'waiver_submission' (not in
 * audit_logs_resource_type_valid) and passes a null user_id (the column is NOT NULL), so allowing the action alone
 * would not make it work. Tracked separately; remove it here when that is fixed.
 */
const KNOWN_UNCOVERED = ['waiver_submission_received'];

/** The quoted values of one CHECK (... IN (...)) list */
const listOf = (sql: string, constraint: string) => {
  const start = sql.indexOf(`ADD CONSTRAINT ${constraint}`);
  const body = sql.slice(start, sql.indexOf('))', start));
  return [...body.replace(/--.*$/gm, '').matchAll(/'([a-z_]+)'/g)].map((m) => m[1]);
};

/** Every source file under packages/api that is not a test */
const sourceFiles = (dir: string): string[] =>
  fs.readdirSync(dir, { withFileTypes: true }).flatMap((e) => {
    const full = path.join(dir, e.name);
    if (e.isDirectory()) return e.name === '__tests__' || e.name === 'node_modules' ? [] : sourceFiles(full);
    return e.name.endsWith('.ts') && !e.name.endsWith('.test.ts') ? [full] : [];
  });

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0172: static analysis', () => {
  it('the up list is the 0155 list plus the missing actions', () => {
    const previous = listOf(PREVIOUS, 'audit_logs_action_valid');
    expect(previous.length).toBeGreaterThan(100);
    expect(listOf(UP, 'audit_logs_action_valid')).toEqual([...previous, ...NEW_ACTIONS]);
  });
  it('leaves the resource_type constraint alone (user, measurement and organization are already allowed)', () => {
    expect(UP).not.toMatch(/audit_logs_resource_type_valid/);
    const resources = listOf(PREVIOUS, 'audit_logs_resource_type_valid');
    for (const r of ['user', 'measurement', 'organization']) expect(resources).toContain(r);
  });
  it('the down list is exactly the 0155 list, re-added NOT VALID, and forgets its manual_migrations row', () => {
    expect(listOf(DOWN, 'audit_logs_action_valid')).toEqual(listOf(PREVIOUS, 'audit_logs_action_valid'));
    expect(DOWN.match(/\)\) NOT VALID;/g)).toHaveLength(1);
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0172_add_missing_audit_actions'/);
  });
  it('runs no BEGIN/COMMIT of its own', () => {
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(DOWN).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
  });
  it('every literal action passed to createAuditLog / assignUnaffiliatedUser is allowed (bar the known exception)', () => {
    const allowed = new Set(listOf(UP, 'audit_logs_action_valid'));
    const call = /(?:createAuditLog|assignUnaffiliatedUser)\([^;]*?\baction:\s*["'`]([a-z_]+)["'`]/gs;
    const used = new Set<string>();
    for (const file of sourceFiles(path.resolve(root, 'packages/api'))) {
      for (const m of fs.readFileSync(file, 'utf-8').matchAll(call)) used.add(m[1]);
    }
    expect(used.size).toBeGreaterThan(50); // the scan is really finding the calls
    for (const a of NEW_ACTIONS) expect(used).toContain(a);
    expect([...used].filter((a) => !allowed.has(a)).sort()).toEqual(KNOWN_UNCOVERED);
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0172: against a disposable DB (rolled back)', () => {
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
  const insertAudit = (tx: any, action: string) =>
    tx`INSERT INTO audit_logs (user_id, action, resource_type, resource_id)
       SELECT id, ${action}, 'user', 'mig0172' FROM users LIMIT 1`;
  const rejects = async (tx: any, action: string) => {
    let error: unknown = null;
    await tx.savepoint(async (sp: any) => insertAudit(sp, action)).catch((e: unknown) => (error = e));
    return (error as { code?: string } | null)?.code === '23514';
  };

  it('accepts the new actions after up (idempotent), rejects an unknown one, and down restores the old list', async () => {
    await rollbackable(async (tx) => {
      // Rows other tests wrote may not satisfy a strict list on a push-only DB; this transaction is rolled back
      await tx`DELETE FROM audit_logs`;
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      for (const action of NEW_ACTIONS) expect(await rejects(tx, action)).toBe(false);
      expect(await rejects(tx, 'zz_not_an_action')).toBe(true);

      await tx.unsafe(DOWN);
      for (const action of NEW_ACTIONS) expect(await rejects(tx, action)).toBe(true);
    });
  });
});
