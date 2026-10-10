/**
 * Migration 0154 (AM-FEAT-019): strip derived metrics (MOMENTUM) from eval battery templates.
 * Live checks run in a rolled-back transaction and only on a disposable test DB.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { TEMPLATE_METRIC_CODES } from '../../packages/api/services/eval-report/template-keys';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const read = (f: string) => fs.readFileSync(path.resolve(__dirname, '../../migrations', f), 'utf-8');
const UP = read('0154_strip_derived_from_eval_templates.sql');
const DOWN = read('0154_strip_derived_from_eval_templates_down.sql');
const UP_0153 = read('0153_add_eval_report_templates.sql');
const DOWN_0153 = read('0153_add_eval_report_templates_down.sql');

const SEED_NAME = 'Soccer eval (yards)';
const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0154: static analysis', () => {
  // Direction matters: the map may grow after this migration was applied; what the SQL says must never contradict it.
  it('every (key, code) pair in the SQL still agrees with the API key map', () => {
    const block = UP.slice(UP.indexOf('INSERT INTO _eval_key_codes'), UP.indexOf(';', UP.indexOf('INSERT INTO _eval_key_codes')));
    const pairs = [...block.matchAll(/\('([A-Z0-9_]+)',\s*'([A-Z0-9_]+)'\)/g)];
    expect(pairs.length).toBeGreaterThan(30);
    for (const [, key, code] of pairs) expect(TEMPLATE_METRIC_CODES[key], key).toBe(code);
  });
  it('is idempotent in form and runs no BEGIN/COMMIT of its own', () => {
    expect(UP).toMatch(/DROP TABLE IF EXISTS pg_temp\._eval_key_codes/);
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(UP).toMatch(/RAISE NOTICE/);
  });
  it('down forgets its manual_migrations row and only restores the global template', () => {
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0154_strip_derived_from_eval_templates'/);
    expect(DOWN).toMatch(/organization_id IS NULL/);
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0154: against a disposable DB (rolled back)', () => {
  let sql: ReturnType<typeof postgres>;
  const notices: string[] = [];
  beforeAll(() => {
    sql = postgres(dbUrl, { max: 1, onnotice: (n) => notices.push(String(n.message)) });
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

  type Entry = { metricKey: string; isRequired: boolean; displayOrder: number };
  const entry = (metricKey: string, displayOrder: number, isRequired = false): Entry => ({ metricKey, isRequired, displayOrder });

  const metricRow = async (tx: any, code: string, derived: boolean) => {
    await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type, is_derived) VALUES (${code}, ${code}, 'Power', 'x', 'tracking', ${derived}) ON CONFLICT (code) DO UPDATE SET is_derived = ${derived}`;
  };

  /** Eval tables exist (0153), no template rows, and the metric rows the checks use */
  const setup = async (tx: any) => {
    if ((await tx`SELECT to_regclass('eval_battery_templates') AS t`)[0].t) {
      await tx`DELETE FROM eval_battery_templates`;
      await tx`DELETE FROM org_eval_report_settings`;
    }
    await tx.unsafe(DOWN_0153);
    await metricRow(tx, 'DASH_40YD', false);
    await metricRow(tx, 'FLY10_TIME', false);
    await metricRow(tx, 'MOMENTUM', true);
    await tx.unsafe(UP_0153.replace(/INSERT INTO eval_battery_templates[\s\S]*?HAVING count\(\*\) > 0;/, ''));
  };

  const insertTemplate = async (tx: any, orgId: string | null, name: string, metrics: Entry[]) => {
    const [row] = await tx`INSERT INTO eval_battery_templates (organization_id, sport, name, metrics) VALUES (${orgId}, 'SOCCER', ${name}, ${tx.json(metrics)}) RETURNING id`;
    return row.id as string;
  };
  const metricsOf = async (tx: any, id: string) => (await tx`SELECT metrics, updated_at FROM eval_battery_templates WHERE id = ${id}`)[0];

  const makeOrg = async (tx: any) => {
    const [o] = await tx`INSERT INTO organizations (name) VALUES (${'mig0154-' + Math.random().toString(36).slice(2)}) RETURNING id`;
    return o.id as string;
  };

  it('removes MOMENTUM from the global and an organization template, keeping other entries in order', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const org = await makeOrg(tx);
      const base = [entry('DASH_40', 1, true), entry('FLY_10', 2, true), entry('MOMENTUM', 3), entry('T_TEST', 9)];
      const g = await insertTemplate(tx, null, SEED_NAME, base);
      const o = await insertTemplate(tx, org, 'Org battery', [entry('MOMENTUM', 1), entry('DASH_40', 2, true)]);
      await tx.unsafe(UP);
      expect((await metricsOf(tx, g)).metrics).toEqual([entry('DASH_40', 1, true), entry('FLY_10', 2, true), entry('T_TEST', 9)]);
      expect((await metricsOf(tx, o)).metrics).toEqual([entry('DASH_40', 2, true)]);
    });
  });

  it('is idempotent and leaves a template without derived entries completely untouched', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const clean = await insertTemplate(tx, null, 'Clean', [entry('DASH_40', 1, true), entry('FLY_10', 2)]);
      await tx`UPDATE eval_battery_templates SET updated_at = '2020-01-01' WHERE id = ${clean}`;
      const dirty = await insertTemplate(tx, null, 'Dirty', [entry('FLY_10', 1), entry('MOMENTUM', 2)]);
      await tx.unsafe(UP);
      const after1 = await metricsOf(tx, dirty);
      await tx.unsafe(UP);
      const after2 = await metricsOf(tx, dirty);
      expect(after2.metrics).toEqual([entry('FLY_10', 1)]);
      expect(after2.updated_at).toEqual(after1.updated_at);
      const c = await metricsOf(tx, clean);
      expect(c.metrics).toEqual([entry('DASH_40', 1, true), entry('FLY_10', 2)]);
      expect(new Date(c.updated_at).getFullYear()).toBe(2020);
    });
  });

  it('keeps a non-derived metric and resolves a literal derived code that is not a logical key', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await metricRow(tx, 'CUSTOM_DERIVED', true);
      await metricRow(tx, 'CUSTOM_PLAIN', false);
      const id = await insertTemplate(tx, null, 'Literal', [entry('CUSTOM_PLAIN', 1), entry('CUSTOM_DERIVED', 2), entry('MOMENTUM', 3)]);
      await tx.unsafe(UP);
      expect((await metricsOf(tx, id)).metrics).toEqual([entry('CUSTOM_PLAIN', 1)]);
    });
  });

  it('does not fail, and keeps the entry, when site_metrics has no MOMENTUM row', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx`DELETE FROM site_metrics WHERE code = 'MOMENTUM'`;
      const id = await insertTemplate(tx, null, SEED_NAME, [entry('FLY_10', 1), entry('MOMENTUM', 2)]);
      await tx.unsafe(UP);
      expect((await metricsOf(tx, id)).metrics).toEqual([entry('FLY_10', 1), entry('MOMENTUM', 2)]);
    });
  });

  it('names what it removed in the NOTICE', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await insertTemplate(tx, null, SEED_NAME, [entry('FLY_10', 1), entry('MOMENTUM', 2)]);
      notices.length = 0;
      await tx.unsafe(UP);
      const msg = notices.find((n) => n.includes('Migration 0154 complete')) ?? '';
      expect(msg).toContain('MOMENTUM');
      expect(msg).toContain('from 1 eval battery templates');
    });
  });

  it('down re-adds MOMENTUM as an optional entry to the global template once, and not to an org template', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const org = await makeOrg(tx);
      const g = await insertTemplate(tx, null, SEED_NAME, [entry('FLY_10', 1, true), entry('T_TEST', 5)]);
      const o = await insertTemplate(tx, org, 'Org battery', [entry('FLY_10', 1, true)]);
      await tx.unsafe(DOWN);
      await tx.unsafe(DOWN);
      expect((await metricsOf(tx, g)).metrics).toEqual([entry('FLY_10', 1, true), entry('T_TEST', 5), entry('MOMENTUM', 6)]);
      expect((await metricsOf(tx, o)).metrics).toEqual([entry('FLY_10', 1, true)]);
      await tx.unsafe(UP);
      expect((await metricsOf(tx, g)).metrics).toEqual([entry('FLY_10', 1, true), entry('T_TEST', 5)]);
    });
  });

  it('ignores a non-array metrics value, keeps entries without a metricKey, and leaves a template that would become empty untouched', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      // metrics is NOT NULL jsonb: a scalar and an object are the malformed shapes that can exist
      const scalar = await insertTemplate(tx, null, 'Scalar', 'not an array' as any);
      const obj = await insertTemplate(tx, null, 'Object', { metricKey: 'MOMENTUM' } as any);
      const mixed = await insertTemplate(tx, null, 'Mixed', [entry('MOMENTUM', 1), { isRequired: true, displayOrder: 2 } as any, entry('FLY_10', 3)]);
      const onlyDerived = await insertTemplate(tx, null, 'Only derived', [entry('MOMENTUM', 1)]);
      await tx`UPDATE eval_battery_templates SET updated_at = '2020-01-01' WHERE id = ${onlyDerived}`;
      notices.length = 0;
      await tx.unsafe(UP);
      expect((await metricsOf(tx, scalar)).metrics).toBe('not an array');
      expect((await metricsOf(tx, obj)).metrics).toEqual({ metricKey: 'MOMENTUM' });
      expect((await metricsOf(tx, mixed)).metrics).toEqual([{ isRequired: true, displayOrder: 2 }, entry('FLY_10', 3)]);
      const only = await metricsOf(tx, onlyDerived);
      expect(only.metrics).toEqual([entry('MOMENTUM', 1)]);
      expect(new Date(only.updated_at).getFullYear()).toBe(2020);
      const msg = notices.find((n) => n.includes('Migration 0154 complete')) ?? '';
      expect(msg).toContain('from 1 eval battery templates');
      expect(msg).toContain('1 left untouched');
    });
  });
});
