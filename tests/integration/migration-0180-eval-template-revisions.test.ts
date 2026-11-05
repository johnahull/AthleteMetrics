/**
 * Migration 0180 (PROVISIONAL number): eval_battery_template_revisions, current_revision_id, events.eval_template_revision_id,
 * the revision-1 backfill and the Foundation / Performance seed (AM-FEAT-024 PR 3).
 * Live checks run in a rolled-back transaction on a disposable DB; ids are real 36-char UUIDs.
 */
process.env.NODE_ENV = process.env.NODE_ENV || 'test';

import fs from 'fs';
import path from 'path';
import { randomUUID } from 'crypto';
import { fileURLToPath } from 'url';
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import postgres from 'postgres';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const NAME = '0180_eval_battery_template_revisions';
const UP = read(`${NAME}.sql`);
const DOWN = read(`${NAME}_down.sql`);

const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

class Rollback extends Error {}

const CONSTRAINTS = [
  'eval_battery_template_revisions_template_fk',
  'eval_battery_template_revisions_template_rev_uniq',
  'eval_battery_templates_current_revision_fk',
  'events_eval_template_revision_fk',
  'eval_battery_templates_preset_key_uniq',
];

describe('Migration 0180: static analysis', () => {
  it('is transaction-free, idempotent in form and says it is provisional', () => {
    for (const sql of [UP, DOWN]) {
      expect(sql).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
      expect(sql).not.toMatch(/^\s*(TRUNCATE|.*CONCURRENTLY)/im);
    }
    expect(UP).toMatch(/PROVISIONAL/);
    expect(UP).toMatch(/CREATE TABLE IF NOT EXISTS eval_battery_template_revisions/);
    expect(UP).toMatch(/ADD COLUMN IF NOT EXISTS current_revision_id/);
    expect(UP).toMatch(/ADD COLUMN IF NOT EXISTS eval_template_revision_id/);
    expect(UP).toMatch(/ADD COLUMN IF NOT EXISTS preset_key VARCHAR\(30\)/);
    expect(UP).toMatch(/CREATE UNIQUE INDEX IF NOT EXISTS eval_battery_templates_preset_key_uniq[\s\S]*WHERE preset_key IS NOT NULL/);
    expect(UP).toMatch(/DROP TRIGGER IF EXISTS/);
    expect(UP).toMatch(/ON CONFLICT DO NOTHING/);
    expect(UP).toMatch(/id VARCHAR\(36\) PRIMARY KEY DEFAULT gen_random_uuid\(\)/);
  });
  it('names every constraint explicitly (<= 63 chars) identically in SQL and Drizzle, so db:push shows no drift', () => {
    const drizzle =
      fs.readFileSync(path.resolve(__dirname, '../../packages/shared/schema/tables/eval-reports.ts'), 'utf-8') +
      fs.readFileSync(path.resolve(__dirname, '../../packages/shared/schema/tables/events.ts'), 'utf-8');
    for (const name of CONSTRAINTS) {
      expect(name.length).toBeLessThanOrEqual(63);
      expect(UP).toContain(name);
      expect(drizzle).toContain(name);
    }
  });
  it('puts the trigger on revisions only and keeps created_by free of a foreign key', () => {
    expect(UP).toMatch(/BEFORE UPDATE OR DELETE ON eval_battery_template_revisions/);
    expect(UP).not.toMatch(/created_by VARCHAR\(36\) REFERENCES/);
  });
  it('documents that the trigger does not cover TRUNCATE or session_replication_role=replica', () => {
    expect(UP).toMatch(/TRUNCATE/);
    expect(UP).toMatch(/session_replication_role/);
  });
  it('down refuses while history exists, and forgets the tracking row', () => {
    expect(DOWN).toMatch(/refused/);
    expect(DOWN).toMatch(/DROP TABLE IF EXISTS eval_battery_template_revisions/);
    expect(DOWN).toMatch(new RegExp(`DELETE FROM manual_migrations WHERE migration_name = '${NAME}'`));
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0180: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1, prepare: false, onnotice: () => {} });
  });
  afterAll(async () => {
    if (sql) await sql.end();
  });

  /** Runs fn on a database where the migration's own objects are removed, the UP is applied, and everything is rolled back. */
  async function rolledBack(fn: (tx: any) => Promise<void>, { applyUp = true } = {}) {
    try {
      await sql.begin(async (tx: any) => {
        await tx.unsafe('DROP TABLE IF EXISTS eval_battery_template_revisions CASCADE');
        await tx.unsafe('ALTER TABLE eval_battery_templates DROP COLUMN IF EXISTS current_revision_id');
        await tx.unsafe('ALTER TABLE eval_battery_templates DROP COLUMN IF EXISTS preset_key');
        await tx.unsafe('ALTER TABLE events DROP COLUMN IF EXISTS eval_template_revision_id');
        if (applyUp) await tx.unsafe(UP);
        await fn(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  }

  const org = async (tx: any) => {
    const id = randomUUID();
    await tx`INSERT INTO organizations (id, name) VALUES (${id}, ${'mig0180-' + id})`;
    return id;
  };
  const metrics = [{ metricKey: 'DASH_10', isRequired: true, displayOrder: 1 }];
  const template = async (tx: any, organizationId: string | null, name = 'T-' + randomUUID()) => {
    const [t] = await tx`INSERT INTO eval_battery_templates (organization_id, sport, name, metrics) VALUES (${organizationId}, 'SOCCER', ${name}, ${tx.json(metrics)}) RETURNING *`;
    return t;
  };

  it('is re-runnable and backfills revision 1 for an existing template (36-char ids)', async () => {
    await rolledBack(async (tx) => {
      const t = await template(tx, await org(tx));
      await tx.unsafe(UP);
      await tx.unsafe(UP);
      const revs = await tx`SELECT * FROM eval_battery_template_revisions WHERE template_id = ${t.id}`;
      expect(revs).toHaveLength(1);
      expect(revs[0].revision).toBe(1);
      expect(revs[0].id).toHaveLength(36);
      expect(revs[0].metrics).toEqual(metrics);
      const [after] = await tx`SELECT current_revision_id FROM eval_battery_templates WHERE id = ${t.id}`;
      expect(after.current_revision_id).toBe(revs[0].id);
    }, { applyUp: false });
  });

  it('seeds Foundation and Performance once as global templates, each with revision 1 as current', async () => {
    await rolledBack(async (tx) => {
      await tx.unsafe(UP);
      const rows = await tx`SELECT t.*, r.revision, r.metrics AS rev_metrics FROM eval_battery_templates t
        JOIN eval_battery_template_revisions r ON r.id = t.current_revision_id
        WHERE t.organization_id IS NULL AND t.archived_at IS NULL AND t.name IN ('Foundation', 'Performance')`;
      expect(rows.map((r: any) => r.name).sort()).toEqual(['Foundation', 'Performance']);
      expect(Object.fromEntries(rows.map((r: any) => [r.name, r.preset_key]))).toEqual({ Foundation: 'foundation', Performance: 'performance' });
      for (const r of rows) {
        expect(r.revision).toBe(1);
        expect(r.rev_metrics).toEqual(r.metrics);
        const byKey = new Map<string, any>(r.metrics.map((m: any) => [m.metricKey, m]));
        // axis metrics
        for (const key of ['DASH_10', 'FLY10_TIME_RI30', 'CMJ_HOH', 'RSI_BILATERAL', '505_LEFT', '505_RIGHT', 'JUMP_BROAD']) {
          expect(byKey.has(key), `${r.name} has ${key}`).toBe(true);
        }
        // MQI: all eight pattern scores required; transitions and the derived total are not template tests
        for (const key of ['PATTERN_LIN_ACCEL', 'PATTERN_MAX_VELO', 'PATTERN_DECEL', 'PATTERN_SHUFFLE', 'PATTERN_LATRUN', 'PATTERN_HIPTURN', 'PATTERN_BACKPEDAL', 'PATTERN_JUMP']) {
          expect(byKey.get(key)?.isRequired, `${r.name} ${key} required`).toBe(true);
        }
        expect(byKey.has('MQI')).toBe(false);
        // the 505 is the meter protocol, never a yard code
        expect([...byKey.keys()].some((k) => /YD/.test(k))).toBe(false);
        // triple hop is addable, never required
        expect(byKey.get('HOP_SL_TRIPLE_L')?.isRequired).toBe(false);
        expect(byKey.get('HOP_SL_TRIPLE_R')?.isRequired).toBe(false);
        // displayOrder is unique
        expect(new Set(r.metrics.map((m: any) => m.displayOrder)).size).toBe(r.metrics.length);
      }
      const foundation = rows.find((r: any) => r.name === 'Foundation');
      const performance = rows.find((r: any) => r.name === 'Performance');
      const req = (r: any, k: string) => r.metrics.find((m: any) => m.metricKey === k)?.isRequired;
      // PDF: Foundation core = height/weight, broad jump; Performance core adds RSI, SJ, 40 yd sprint
      expect(req(foundation, 'JUMP_BROAD')).toBe(true);
      // PDF "Conditional core" 40 yd sprint with splits: pre-loaded, the coach removes it when space does not permit; its 30-40 yd leg (FLY10_TIME_RI30) comes from the same trial
      for (const k of ['DASH_10', 'DASH_20', 'DASH_30', 'DASH_40', 'FLY10_TIME_RI30']) expect(req(foundation, k), k).toBe(true);
      // PDF "Conditional" 5-0-5 and "Optional" RSI stay optional in Foundation
      for (const k of ['505_LEFT', '505_RIGHT', 'RSI_BILATERAL', 'SQUAT_JUMP']) expect(req(foundation, k), k).toBe(false);
      expect(req(performance, 'JUMP_BROAD')).toBe(true);
      expect(req(performance, 'RSI_BILATERAL')).toBe(true);
      expect(req(performance, 'SQUAT_JUMP')).toBe(true);
      // a re-run never adds a second copy
      await tx.unsafe(UP);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM eval_battery_templates WHERE organization_id IS NULL AND name IN ('Foundation', 'Performance')`;
      expect(n).toBe(2);
    });
  });

  it('a preset the site admin archived or renamed is not recreated or duplicated by a re-run', async () => {
    await rolledBack(async (tx) => {
      await tx`UPDATE eval_battery_templates SET archived_at = now() WHERE preset_key = 'foundation'`;
      await tx.unsafe(UP);
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM eval_battery_templates WHERE preset_key = 'foundation'`;
      expect(n).toBe(1);
      await tx`UPDATE eval_battery_templates SET archived_at = NULL, name = 'Renamed' WHERE preset_key = 'foundation'`;
      await tx.unsafe(UP);
      const [{ m }] = await tx`SELECT count(*)::int AS m FROM eval_battery_templates WHERE organization_id IS NULL AND name = 'Foundation'`;
      expect(m).toBe(0); // renamed away: the seed does not bring the name back
    });
  });

  it('blocks UPDATE and DELETE of a revision, and a duplicate (template, revision)', async () => {
    await rolledBack(async (tx) => {
      const t = await template(tx, await org(tx));
      const [r] = await tx`INSERT INTO eval_battery_template_revisions (template_id, revision, metrics) VALUES (${t.id}, 7, ${tx.json(metrics)}) RETURNING *`;
      expect(r.id).toHaveLength(36);
      await expect(tx.savepoint((s: any) => s`UPDATE eval_battery_template_revisions SET metrics = '[]'::jsonb WHERE id = ${r.id}`)).rejects.toThrow(/immutable/);
      await expect(tx.savepoint((s: any) => s`DELETE FROM eval_battery_template_revisions WHERE id = ${r.id}`)).rejects.toThrow(/immutable/);
      await expect(
        tx.savepoint((s: any) => s`INSERT INTO eval_battery_template_revisions (template_id, revision, metrics) VALUES (${t.id}, 7, ${s.json(metrics)})`),
      ).rejects.toThrow(/eval_battery_template_revisions_template_rev_uniq/);
    });
  });

  it('lets the revisions go only with their template, clears the event link, and survives deleting the creating user', async () => {
    await rolledBack(async (tx) => {
      const orgId = await org(tx);
      const uid = randomUUID();
      await tx`INSERT INTO users (id, username, emails, password, first_name, last_name, full_name) VALUES (${uid}, ${'m0180-' + uid}, ${tx.array(['a@b.c'])}, 'x', 'A', 'B', 'A B')`;
      const t = await template(tx, orgId);
      const [r] = await tx`INSERT INTO eval_battery_template_revisions (template_id, revision, metrics, created_by) VALUES (${t.id}, 5, ${tx.json(metrics)}, ${uid}) RETURNING *`;
      const evId = randomUUID();
      await tx`INSERT INTO events (id, organization_id, name, start_date, eval_template_revision_id) VALUES (${evId}, ${orgId}, 'e', now(), ${r.id})`;
      // created_by has no FK: removing the user is not an UPDATE of the immutable row
      await tx`DELETE FROM users WHERE id = ${uid}`;
      const [kept] = await tx`SELECT created_by FROM eval_battery_template_revisions WHERE id = ${r.id}`;
      expect(kept.created_by).toBe(uid);
      // deleting the organization cascades: template, then its revisions, and the event's link is cleared (the event goes too)
      await tx`DELETE FROM eval_battery_templates WHERE id = ${t.id}`;
      const [{ n }] = await tx`SELECT count(*)::int AS n FROM eval_battery_template_revisions WHERE template_id = ${t.id}`;
      expect(n).toBe(0);
      const [ev] = await tx`SELECT eval_template_revision_id FROM events WHERE id = ${evId}`;
      expect(ev.eval_template_revision_id).toBeNull();
    });
  });

  it('down refuses while history exists (revision above 1, or an event link), else drops the table', async () => {
    await rolledBack(async (tx) => {
      const t = await template(tx, await org(tx));
      await tx`INSERT INTO eval_battery_template_revisions (template_id, revision, metrics) VALUES (${t.id}, 2, ${tx.json(metrics)})`;
      await expect(tx.savepoint((s: any) => s.unsafe(DOWN))).rejects.toThrow(/refused/);
    });
    await rolledBack(async (tx) => {
      const orgId = await org(tx);
      const t = await template(tx, orgId);
      const [r] = await tx`INSERT INTO eval_battery_template_revisions (template_id, revision, metrics) VALUES (${t.id}, 1, ${tx.json(metrics)}) RETURNING id`;
      await tx`INSERT INTO events (id, organization_id, name, start_date, eval_template_revision_id) VALUES (${randomUUID()}, ${orgId}, 'e', now(), ${r.id})`;
      await expect(tx.savepoint((s: any) => s.unsafe(DOWN))).rejects.toThrow(/refused/);
    });
    await rolledBack(async (tx) => {
      await tx.unsafe(DOWN);
      const [{ a }] = await tx`SELECT to_regclass('eval_battery_template_revisions') AS a`;
      expect(a).toBeNull();
      const cols = await tx`SELECT column_name FROM information_schema.columns WHERE column_name IN ('current_revision_id', 'eval_template_revision_id')`;
      expect(cols).toHaveLength(0);
    });
  });
});
