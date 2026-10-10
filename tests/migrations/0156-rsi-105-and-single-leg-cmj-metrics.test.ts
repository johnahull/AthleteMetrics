/**
 * Migration 0156 (AM-FEAT-019): RSI_105, JUMP_CMJ_SL_L and JUMP_CMJ_SL_R as real site metrics, copied from RSI and
 * JUMP_CMJ_HOH, and the global "Soccer eval (yards)" template topped up with them.
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
const UP = read('0156_add_rsi_105_and_single_leg_cmj_metrics.sql');
const DOWN = read('0156_add_rsi_105_and_single_leg_cmj_metrics_down.sql');

const SEED_NAME = 'Soccer eval (yards)';
const NEW_CODES = ['RSI_105', 'JUMP_CMJ_SL_L', 'JUMP_CMJ_SL_R'];
const dbUrl = process.env.DATABASE_URL || '';
const isDisposableTestDb =
  process.env.NODE_ENV === 'test' && (/@(localhost|127\.0\.0\.1)[:/]/.test(dbUrl) || process.env.CI === 'true');

describe('Migration 0156: static analysis', () => {
  it('every (key, code) pair of the top-up agrees with the API key map', () => {
    const pairs = [...UP.matchAll(/\('([A-Z0-9_]+)',\s*'([A-Z0-9_]+)',\s*(?:true|false),\s*\d+\)/g)];
    expect(pairs.map((p) => p[1]).sort()).toEqual(['CMJ_SL_LEFT', 'CMJ_SL_RIGHT', 'RSI_BILATERAL']);
    for (const [, key, code] of pairs) expect(TEMPLATE_METRIC_CODES[key], key).toBe(code);
  });
  it('copies from RSI and JUMP_CMJ_HOH, never overwrites, and runs no BEGIN/COMMIT of its own', () => {
    expect(UP).toMatch(/\('RSI_105',\s*'RSI',/);
    expect(UP).toMatch(/\('JUMP_CMJ_SL_L',\s*'JUMP_CMJ_HOH',/);
    expect(UP).toMatch(/\('JUMP_CMJ_SL_R',\s*'JUMP_CMJ_HOH',/);
    expect(UP).toMatch(/ON CONFLICT \(code\) DO NOTHING/);
    expect(UP).not.toMatch(/ON CONFLICT \(code\) DO UPDATE/);
    expect(UP).not.toMatch(/^\s*(BEGIN|COMMIT);/m);
    expect(UP).not.toMatch(/\('JUMP_CMJ_SL_ASYM'/);
  });
  it('warns against a manual re-run in its header', () => {
    expect(UP).toMatch(/^-- Do not re-run by hand: a manual re-run re-adds template entries and org rows an admin deleted/m);
    expect(UP).not.toMatch(/^-- Idempotent/m);
  });
  it('down forgets its manual_migrations row and refuses while the metrics are in use', () => {
    expect(DOWN).toMatch(/DELETE FROM manual_migrations WHERE migration_name = '0156_add_rsi_105_and_single_leg_cmj_metrics'/);
    expect(DOWN).toMatch(/RAISE EXCEPTION/);
    expect(DOWN).not.toMatch(/DELETE FROM measurements/);
  });
});

describe.skipIf(!isDisposableTestDb)('Migration 0156: against a disposable DB (rolled back)', () => {
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
  // The 0153 seed as it lands on a database without the three codes
  const BASE: Entry[] = [entry('BODY_WEIGHT', 2, true), entry('CMJ_HOH', 4, true), entry('HANDS_FREE_JUMP', 5, true), entry('DASH_10', 7, true), entry('RSI_LEFT', 26), entry('RSI_RIGHT', 27), entry('STRENGTH_SQUAT', 30)];

  // Columns that must equal the source row; code, label, display_order (and description for the single-leg CMJ) differ.
  const COPIED = [
    'category', 'unit', 'metric_type', 'is_system_default', 'is_active', 'short_description', 'what_it_measures', 'why_it_matters',
    'available_org_types', 'sport_associations', 'validation_min', 'validation_max', 'decimal_precision', 'color', 'icon',
    'is_derived', 'formula', 'dependent_metrics', 'calculation_config', 'auxiliary_input_config',
  ];
  const metricRow = async (tx: any, code: string) => (await tx`SELECT * FROM site_metrics WHERE code = ${code}`)[0];
  const pick = (row: any, cols: string[]) => Object.fromEntries(cols.map((c) => [c, row?.[c]]));

  /** No new codes yet; source rows with distinctive attributes (CI's DB has RSI but no JUMP_CMJ_HOH); a fresh global template */
  const setup = async (tx: any) => {
    await tx`DELETE FROM site_metrics WHERE code = ANY(${NEW_CODES})`;
    await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type) VALUES ('RSI', 'Reactive Strength Index', 'power', '', 'higher_is_better') ON CONFLICT (code) DO NOTHING`;
    await tx`INSERT INTO site_metrics (code, label, category, unit, metric_type) VALUES ('JUMP_CMJ_HOH', 'Counter-Movement Jump (HOH)', 'Power', 'in', 'higher_is_better') ON CONFLICT (code) DO NOTHING`;
    await tx`UPDATE site_metrics SET is_system_default = true, short_description = 'short', what_it_measures = 'what', why_it_matters = 'why',
               available_org_types = ARRAY['club','high_school'], sport_associations = ARRAY['Soccer'], validation_min = 0, validation_max = 5,
               decimal_precision = 2, color = 'orange', icon = 'TrendingUp' WHERE code = 'RSI'`;
    await tx`UPDATE site_metrics SET is_system_default = true, validation_min = 1, validation_max = 50, decimal_precision = 1, color = 'red', icon = 'ArrowUp' WHERE code = 'JUMP_CMJ_HOH'`;
    await tx`DELETE FROM eval_battery_templates WHERE organization_id IS NULL`;
    if ((await tx`SELECT to_regclass('manual_migrations') AS t`)[0].t) {
      await tx`DELETE FROM manual_migrations WHERE migration_name = '0156_add_rsi_105_and_single_leg_cmj_metrics'`;
    }
  };
  const insertTemplate = async (tx: any, orgId: string | null, name: string, metrics: unknown, archived = false) => {
    const [row] = await tx`INSERT INTO eval_battery_templates (organization_id, sport, name, metrics, archived_at)
                           VALUES (${orgId}, 'SOCCER', ${name}, ${tx.json(metrics)}, ${archived ? new Date() : null}) RETURNING id`;
    await tx`UPDATE eval_battery_templates SET updated_at = '2020-01-01' WHERE id = ${row.id}`;
    return row.id as string;
  };
  const templateOf = async (tx: any, id: string) => (await tx`SELECT metrics, updated_at FROM eval_battery_templates WHERE id = ${id}`)[0];
  const makeOrg = async (tx: any) => {
    const [o] = await tx`INSERT INTO organizations (name) VALUES (${'mig0156-' + Math.random().toString(36).slice(2)}) RETURNING id`;
    return o.id as string;
  };

  it('creates the three metrics with the attributes of their source rows', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx.unsafe(UP);
      const rsi = await metricRow(tx, 'RSI');
      const rsi105 = await metricRow(tx, 'RSI_105');
      // RSI_105 has its own text (RSI's says drop jumps); everything else is RSI's
      const OWN_TEXT = ['short_description', 'what_it_measures'];
      const rsiCopied = COPIED.filter((c) => !OWN_TEXT.includes(c));
      expect(pick(rsi105, rsiCopied)).toEqual(pick(rsi, rsiCopied));
      expect(rsi105.label).toBe('RSI Bilateral (10/5 Repeat Hop)');
      for (const col of [...OWN_TEXT, 'description']) {
        expect(rsi105[col], col).toMatch(/10\/5|ten/i);
        expect(rsi105[col], col).not.toMatch(/drop jump/i);
        expect(rsi105[col], col).not.toBe(rsi[col]);
      }
      expect(rsi105.what_it_measures).toMatch(/ground contact/i);
      const cmj = await metricRow(tx, 'JUMP_CMJ_HOH');
      for (const [code, side] of [['JUMP_CMJ_SL_L', 'Left'], ['JUMP_CMJ_SL_R', 'Right']]) {
        const row = await metricRow(tx, code);
        expect(pick(row, COPIED), code).toEqual(pick(cmj, COPIED));
        expect(row.label).toBe(`Counter-Movement Jump (${side} Leg)`);
        expect(row.description).toMatch(new RegExp(`single-leg.*hands-on-hips.*${side.toLowerCase()} leg`, 'i'));
        expect(row.description).toMatch(/no arm swing/i);
        expect(row.description).toContain('Same unit and range as JUMP_CMJ_HOH');
      }
    });
  });

  it('tops up the global template: RSI_BILATERAL required, the single-leg CMJ sides optional, other entries unchanged', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const g = await insertTemplate(tx, null, SEED_NAME, BASE);
      await tx.unsafe(UP);
      const { metrics, updated_at } = await templateOf(tx, g);
      expect(metrics).toEqual([...BASE, entry('RSI_BILATERAL', 6, true), entry('CMJ_SL_LEFT', 28), entry('CMJ_SL_RIGHT', 29)]);
      expect(new Date(updated_at).getFullYear()).toBeGreaterThan(2020);
      expect(new Set(metrics.map((m: Entry) => m.metricKey)).size).toBe(metrics.length);
    });
  });

  it('is idempotent: a second run adds nothing and does not touch the template', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const g = await insertTemplate(tx, null, SEED_NAME, BASE);
      await tx.unsafe(UP);
      await tx`UPDATE eval_battery_templates SET updated_at = '2020-01-01' WHERE id = ${g}`;
      await tx.unsafe(UP);
      const { metrics, updated_at } = await templateOf(tx, g);
      expect(metrics).toHaveLength(BASE.length + 3);
      expect(new Date(updated_at).getFullYear()).toBe(2020);
      expect((await tx`SELECT count(*)::int AS n FROM site_metrics WHERE code = ANY(${NEW_CODES})`)[0].n).toBe(3);
    });
  });

  it('leaves an entry a site admin already has (by key or literal code) as it is, and adds only what is absent', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const has = [...BASE, entry('RSI_BILATERAL', 40), entry('JUMP_CMJ_SL_L', 41, true)];
      const g = await insertTemplate(tx, null, SEED_NAME, has);
      await tx.unsafe(UP);
      expect((await templateOf(tx, g)).metrics).toEqual([...has, entry('CMJ_SL_RIGHT', 29)]);
    });
  });

  it('a template that already has all three is untouched', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const full = [...BASE, entry('RSI_BILATERAL', 6, true), entry('CMJ_SL_LEFT', 28), entry('CMJ_SL_RIGHT', 29)];
      const g = await insertTemplate(tx, null, SEED_NAME, full);
      await tx.unsafe(UP);
      const t = await templateOf(tx, g);
      expect(t.metrics).toEqual(full);
      expect(new Date(t.updated_at).getFullYear()).toBe(2020);
    });
  });

  it('takes the next free displayOrder when the reserved slot is used', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const taken = [entry('DASH_10', 6, true), entry('T_TEST', 28), entry('FLY_10', 50)];
      const g = await insertTemplate(tx, null, SEED_NAME, taken);
      await tx.unsafe(UP);
      expect((await templateOf(tx, g)).metrics).toEqual([...taken, entry('RSI_BILATERAL', 51, true), entry('CMJ_SL_LEFT', 52), entry('CMJ_SL_RIGHT', 53)]);
    });
  });

  it('appends both single-leg sides, Left then Right, when only the Right slot is used', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const taken = [entry('T_TEST', 29), entry('FLY_10', 40)];
      const g = await insertTemplate(tx, null, SEED_NAME, taken);
      await tx.unsafe(UP);
      expect((await templateOf(tx, g)).metrics).toEqual([...taken, entry('RSI_BILATERAL', 6, true), entry('CMJ_SL_LEFT', 41), entry('CMJ_SL_RIGHT', 42)]);
    });
  });

  it('never goes past displayOrder 9999 (the API maximum)', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const taken = [entry('DASH_10', 6, true), entry('T_TEST', 28), entry('FLY_10', 9998)];
      const g = await insertTemplate(tx, null, SEED_NAME, taken);
      await tx.unsafe(UP);
      expect((await templateOf(tx, g)).metrics).toEqual([...taken, entry('RSI_BILATERAL', 9999, true), entry('CMJ_SL_LEFT', 9999), entry('CMJ_SL_RIGHT', 9999)]);
    });
  });

  it('leaves organization templates, archived global copies and non-array metrics untouched', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const org = await makeOrg(tx);
      const o = await insertTemplate(tx, org, SEED_NAME, BASE);
      const archived = await insertTemplate(tx, null, SEED_NAME, BASE, true);
      const scalar = await insertTemplate(tx, null, SEED_NAME, 'not an array');
      await tx.unsafe(UP);
      expect((await templateOf(tx, o)).metrics).toEqual(BASE);
      expect((await templateOf(tx, archived)).metrics).toEqual(BASE);
      expect((await templateOf(tx, scalar)).metrics).toBe('not an array');
    });
  });

  it('skips a metric whose source row is absent, without error, and does not add its template entries', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx`DELETE FROM site_metrics WHERE code = 'JUMP_CMJ_HOH'`;
      const g = await insertTemplate(tx, null, SEED_NAME, BASE);
      notices.length = 0;
      await tx.unsafe(UP);
      expect(await metricRow(tx, 'JUMP_CMJ_SL_L')).toBeUndefined();
      expect(await metricRow(tx, 'RSI_105')).toBeDefined();
      expect((await templateOf(tx, g)).metrics).toEqual([...BASE, entry('RSI_BILATERAL', 6, true)]);
      const msg = notices.find((n) => n.includes('Migration 0156 complete')) ?? '';
      expect(msg).toContain('JUMP_CMJ_SL_L');
      expect(msg).toContain('1 global template');
    });
  });

  it('does not add a template entry for an inactive metric', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx`UPDATE site_metrics SET is_active = false WHERE code = 'RSI'`;
      const g = await insertTemplate(tx, null, SEED_NAME, BASE);
      await tx.unsafe(UP);
      expect((await metricRow(tx, 'RSI_105')).is_active).toBe(false);
      expect((await templateOf(tx, g)).metrics.map((m: Entry) => m.metricKey)).not.toContain('RSI_BILATERAL');
    });
  });

  it('enables the new metrics for organizations that enable the source, without overriding an existing choice', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const [withRsi, withCmj, without, decided] = [await makeOrg(tx), await makeOrg(tx), await makeOrg(tx), await makeOrg(tx)];
      await tx`INSERT INTO organization_metrics (organization_id, metric_code, is_enabled) VALUES
                 (${withRsi}, 'RSI', true), (${withCmj}, 'JUMP_CMJ_HOH', true), (${without}, 'RSI', false), (${decided}, 'RSI', true)`;
      await tx.unsafe(UP);
      // An admin switches it off; a re-run must not switch it back on
      await tx`UPDATE organization_metrics SET is_enabled = false WHERE organization_id = ${decided} AND metric_code = 'RSI_105'`;
      await tx.unsafe(UP);
      const enabled = async (org: string) =>
        (await tx`SELECT metric_code, is_enabled FROM organization_metrics WHERE organization_id = ${org} AND metric_code = ANY(${NEW_CODES}) ORDER BY metric_code`)
          .map((r: any) => `${r.metric_code}:${r.is_enabled}`);
      expect(await enabled(withRsi)).toEqual(['RSI_105:true']);
      expect(await enabled(withCmj)).toEqual(['JUMP_CMJ_SL_L:true', 'JUMP_CMJ_SL_R:true']);
      expect(await enabled(without)).toEqual([]);
      expect(await enabled(decided)).toEqual(['RSI_105:false']);
    });
  });

  it('down removes the metrics and their global template entries, keeps the sources, and is safe to repeat', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      const g = await insertTemplate(tx, null, SEED_NAME, BASE);
      const org = await makeOrg(tx);
      const o = await insertTemplate(tx, org, 'Org battery', [entry('RSI_BILATERAL', 1, true)]);
      await tx.unsafe(UP);
      await tx.unsafe(DOWN);
      await tx.unsafe(DOWN);
      expect((await tx`SELECT code FROM site_metrics WHERE code = ANY(${NEW_CODES})`)).toHaveLength(0);
      expect(await metricRow(tx, 'RSI')).toBeDefined();
      expect(await metricRow(tx, 'JUMP_CMJ_HOH')).toBeDefined();
      expect((await templateOf(tx, g)).metrics).toEqual(BASE);
      expect((await templateOf(tx, o)).metrics).toEqual([entry('RSI_BILATERAL', 1, true)]);
      await tx.unsafe(UP);
      expect((await templateOf(tx, g)).metrics).toHaveLength(BASE.length + 3);
    });
  });

  it('down refuses while an event uses one of the metrics', async () => {
    await rollbackable(async (tx) => {
      await setup(tx);
      await tx.unsafe(UP);
      const org = await makeOrg(tx);
      const [ev] = await tx`INSERT INTO events (organization_id, name, start_date) VALUES (${org}, 'mig0156 event', NOW()) RETURNING id`;
      await tx`INSERT INTO event_metrics (event_id, metric_code) VALUES (${ev.id}, 'RSI_105')`;
      await expect(tx.unsafe(DOWN)).rejects.toThrow(/0156 \(down\) refused/);
    });
  });
});
