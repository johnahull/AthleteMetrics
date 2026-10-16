// @vitest-environment node
/**
 * Test suite for Migration 0161: AGILITY_COD_DEFICIT_M_INTERP
 *
 * Spec: AM-FEAT-016, Revision 2026-10-13, Change 1.
 * Plan: .omc/plans/cod-deficit-m-interp-plan.md.
 *
 *   AGILITY_COD_DEFICIT_M_INTERP =
 *     min(AGILITY_505_M_L, AGILITY_505_M_R) - (DASH_10YD + 0.0936 * (DASH_20YD - DASH_10YD))
 *
 * Layers (same as tests/migrations/0145-cod-deficit.test.ts):
 *   1. Static analysis of the up/down SQL files (no DB needed).
 *   2. Pure formula checks via formula-service (no DB needed).
 *   3. Behavioral: the EXACT 0144, 0145 and 0161 files run against DATABASE_URL inside a
 *      transaction that is always rolled back.
 *   4. Calculator: the real DerivedMetricCalculator inside that same transaction.
 *
 * DATABASE_URL unset  -> layers 3-4 are skipped.
 * DATABASE_URL set but unreachable -> they FAIL (never a silent false green).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { ensurePre0144State } from './helpers/pre0144-fixture';
import { drizzle } from 'drizzle-orm/postgres-js';
import * as schema from '@shared/schema';
import { evaluateFormula, validateFormula } from '../../packages/api/services/formula-service';
import { DerivedMetricCalculator } from '../../packages/api/services/derived-metric-calculator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');
const mig = (f: string) => path.join(projectRoot, 'migrations', f);

const UP_SQL_PATH = mig('0161_add_cod_deficit_m_interp.sql');
const DOWN_SQL_PATH = mig('0161_add_cod_deficit_m_interp_down.sql');

const DATABASE_URL = process.env.DATABASE_URL;

const CODE = 'AGILITY_COD_DEFICIT_M_INTERP';
const FORMULA = 'min(AGILITY_505_M_L, AGILITY_505_M_R) - (DASH_10YD + 0.0936 * (DASH_20YD - DASH_10YD))';
const DEPS = ['AGILITY_505_M_L', 'AGILITY_505_M_R', 'DASH_10YD', 'DASH_20YD'];

function stripComments(s: string): string {
  return s
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
}

// ============================================================================
// Layer 1 — static analysis
// ============================================================================
describe('Migration 0161: static SQL analysis', () => {
  it('up and down files exist', () => {
    expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
    expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
  });

  describe('up file', () => {
    let raw: string;
    let up: string;
    beforeAll(() => {
      raw = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      up = stripComments(raw);
    });

    it('does not manage its own transaction and never drops or truncates', () => {
      expect(up).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
      expect(up).not.toMatch(/DROP\s+TABLE/i);
      expect(up).not.toMatch(/TRUNCATE/i);
    });

    it('inserts the metric idempotently and never re-activates it on a re-run', () => {
      expect(up).toMatch(/INSERT\s+INTO\s+site_metrics/i);
      const upd = up.match(/ON\s+CONFLICT\s*\(\s*code\s*\)\s+DO\s+UPDATE\s+SET[^;]*;/i);
      expect(upd).not.toBeNull();
      expect(upd![0]).not.toMatch(/is_active/i);
    });

    it('declares the exact code, formula, dependent_metrics and same_date / skip config', () => {
      expect(up).toContain(`'${CODE}'`);
      expect(up).toContain(`'${FORMULA}'`);
      expect(up).toContain("ARRAY['AGILITY_505_M_L', 'AGILITY_505_M_R', 'DASH_10YD', 'DASH_20YD']");
      expect(up).toContain('{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}');
    });

    it('leaves the explanation columns to the built-ins (does not set them)', () => {
      expect(up).not.toMatch(/short_description|what_it_measures|why_it_matters/i);
    });

    it('requires all four sources and enables only orgs with all four enabled (ON CONFLICT DO NOTHING)', () => {
      expect(up).toMatch(/RAISE\s+EXCEPTION/i);
      for (const c of DEPS) expect(up).toContain(`('${c}')`);
      const m = up.match(/INSERT\s+INTO\s+organization_metrics[^;]*;/i);
      expect(m).not.toBeNull();
      expect(m![0]).toMatch(/HAVING\s+COUNT\s*\(\s*DISTINCT\s+om\.metric_code\s*\)\s*=\s*4/i);
      expect(m![0]).toMatch(/ON\s+CONFLICT\s*\(\s*organization_id\s*,\s*metric_code\s*\)\s*DO\s+NOTHING/i);
      expect(up).not.toMatch(/site_benchmarks|benchmark_set_items/i);
    });

    it('header documents the same_date rep-mixing limit and the recalc needed for existing data', () => {
      expect(raw).toMatch(/independently/i);
      expect(raw).toMatch(/recalc/i);
    });

    it('ends with a RAISE NOTICE summary', () => {
      expect(up).toMatch(/RAISE\s+NOTICE\s+'Migration 0161/);
    });
  });

  describe('down file', () => {
    let raw: string;
    let down: string;
    beforeAll(() => {
      raw = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      down = stripComments(raw);
    });

    it('does not manage its own transaction and never drops tables', () => {
      expect(down).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
      expect(down).not.toMatch(/DROP\s+TABLE/i);
      expect(down).not.toMatch(/TRUNCATE/i);
    });

    it('deletes measurements, then organization_metrics, then site_metrics, then its tracking row', () => {
      const meas = down.search(/DELETE\s+FROM\s+measurements/i);
      const org = down.search(/DELETE\s+FROM\s+organization_metrics/i);
      const site = down.search(/DELETE\s+FROM\s+site_metrics/i);
      const track = down.search(/DELETE\s+FROM\s+manual_migrations\s+WHERE\s+migration_name\s*=\s*'0161_add_cod_deficit_m_interp'/i);
      expect(meas).toBeGreaterThan(-1);
      expect(org).toBeGreaterThan(meas);
      expect(site).toBeGreaterThan(org);
      expect(track).toBeGreaterThan(site);
      expect(down).toMatch(/is_calculated\s*=\s*true/i);
      for (const stmt of down.match(/DELETE\s+FROM[^;]*;/gi) ?? []) expect(stmt).toMatch(/WHERE/i);
    });

    it('anchors every code regex with word boundaries', () => {
      const matches = down.match(/~\*?\s*'[^']*AGILITY_COD_DEFICIT[^']*'/g) ?? [];
      expect(matches.length).toBeGreaterThanOrEqual(4);
      for (const m of matches) expect(m).toContain('\\mAGILITY_COD_DEFICIT_M_INTERP\\M');
    });

    it('header states 0161_down must run BEFORE 0144_down', () => {
      expect(raw).toMatch(/0161_down[^\n]*BEFORE[^\n]*0144_down/i);
    });
  });

  it('0144_down refuses while the interpolated deficit exists (its formula references the M legs)', () => {
    const d = fs.readFileSync(mig('0144_split_505_by_protocol_down.sql'), 'utf-8');
    const guard = d.match(/SELECT COUNT\(\*\) INTO v_cod FROM site_metrics[^;]*;/);
    expect(guard).not.toBeNull();
    expect(guard![0]).toContain(`'${CODE}'`);
  });

  it('0159 does not backfill the new code (it has curated built-in text)', () => {
    expect(fs.readFileSync(mig('0159_backfill_metric_explanations.sql'), 'utf-8')).not.toContain(CODE);
  });
});

// ============================================================================
// Layer 2 — formula-service
// ============================================================================
describe('Migration 0161: formula evaluation', () => {
  it('validates against the four dependent codes', () => {
    const v = validateFormula(FORMULA, DEPS);
    expect(v.errors).toEqual([]);
    expect(v.valid).toBe(true);
    expect(v.referencedMetrics.sort()).toEqual(['agility_505_m_l', 'agility_505_m_r', 'dash_10yd', 'dash_20yd']);
  });

  it('spec example: L 2.85, R 2.80, 10 yd 1.80, 20 yd 3.05 -> t10m 1.917, deficit 0.883', () => {
    const v = evaluateFormula(FORMULA, { agility_505_m_l: 2.85, agility_505_m_r: 2.8, dash_10yd: 1.8, dash_20yd: 3.05 });
    expect(v).not.toBeNull();
    expect(v!.toFixed(3)).toBe('0.883');
  });
});

// ============================================================================
// Layers 3 + 4 — behavioral, against the real DB in a rolled-back transaction
// ============================================================================
class Rollback extends Error {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

const FX_USER = 'fx161-user';
const FX_ORG = 'fx161-org';

describe.skipIf(!DATABASE_URL)('Migration 0161: behavioral (real DB, rolled back)', () => {
  let sql: postgres.Sql;
  let upSql: string;
  let downSql: string;
  let up0144: string;
  let down0144: string;
  let up0145: string;
  let down0145: string;

  beforeAll(async () => {
    upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
    downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
    up0144 = fs.readFileSync(mig('0144_split_505_by_protocol.sql'), 'utf-8');
    down0144 = fs.readFileSync(mig('0144_split_505_by_protocol_down.sql'), 'utf-8');
    up0145 = fs.readFileSync(mig('0145_add_cod_deficit_metrics.sql'), 'utf-8');
    down0145 = fs.readFileSync(mig('0145_add_cod_deficit_metrics_down.sql'), 'utf-8');
    sql = postgres(DATABASE_URL as string, {
      max: 1,
      connect_timeout: 10,
      onnotice: () => {},
      ssl: DATABASE_URL!.includes('localhost') ? false : 'require',
    });
    await sql`select 1`;
  }, 30000);

  afterAll(async () => {
    if (sql) await sql.end({ timeout: 5 });
  });

  async function inTx<T>(fn: (tx: Tx) => Promise<T>): Promise<T> {
    let out: T | undefined;
    try {
      await sql.begin(async (tx) => {
        out = await fn(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
    return out as T;
  }

  /** The CI DB has no DASH_20YD row; without one the calculator would treat it as higher-is-better. */
  async function ensureDash20yd(tx: Tx) {
    await tx`insert into site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, decimal_precision)
             values ('DASH_20YD', '20-Yard Dash Split', 'speed', 's', 'lower_is_better', true, true, 22, 3)
             on conflict (code) do nothing`;
  }

  /** pre-0144 canonical state -> exact 0144 up -> exact 0145 up, plus DASH_20YD. */
  async function to0145(tx: Tx, orgs: string[] = [], rows: Array<[string, string, boolean]> = []) {
    await ensurePre0144State(tx, down0144);
    await ensureDash20yd(tx);
    for (const o of orgs) await tx`insert into organizations (id, name) values (${o}, ${o})`;
    await tx.unsafe(up0144);
    for (const [org, code, enabled] of rows) {
      await tx`insert into organization_metrics (organization_id, metric_code, is_enabled) values (${org}, ${code}, ${enabled})
               on conflict (organization_id, metric_code) do update set is_enabled = excluded.is_enabled`;
    }
    await tx.unsafe(up0145);
  }

  async function interpRow(tx: Tx) {
    return ((await tx`select * from site_metrics where code = ${CODE}`) as Record<string, any>[])[0];
  }

  async function snapshot(tx: Tx) {
    return (
      await tx.unsafe(
        `select to_jsonb(t) - 'id' - 'created_at' - 'updated_at' as r from site_metrics t
          where code ~ '^AGILITY_505' or code in ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD') order by code`,
      )
    ).map((x: { r: unknown }) => x.r);
  }

  async function interpOrgRows(tx: Tx, orgs: string[]) {
    return (await tx`select organization_id, is_enabled from organization_metrics
                      where metric_code = ${CODE} and organization_id = any(${orgs})
                      order by organization_id`) as Record<string, any>[];
  }

  const TEST_TIMEOUT = 60000;

  it('creates the metric with the specified definition and leaves the explanation columns NULL', async () => {
    await inTx(async (tx) => {
      await to0145(tx);
      await tx.unsafe(upSql);
      const r = await interpRow(tx);
      expect(r).toBeDefined();
      expect(r.label).toBe('COD Deficit (m, interpolated 10 m)');
      expect(r.category).toBe('agility');
      expect(r.unit).toBe('s');
      expect(r.metric_type).toBe('lower_is_better');
      expect(r.is_derived).toBe(true);
      expect(r.is_active).toBe(true);
      expect(r.is_system_default).toBe(true);
      expect(r.display_order).toBe(43);
      expect(r.decimal_precision).toBe(3);
      expect(Number(r.validation_min)).toBe(0);
      expect(Number(r.validation_max)).toBe(2);
      expect(r.color).toBe('green');
      expect(r.icon).toBe('Activity');
      expect(r.formula).toBe(FORMULA);
      expect(r.dependent_metrics).toEqual(DEPS);
      expect(r.calculation_config).toEqual({ dateMatchStrategy: 'same_date', missingSourceBehavior: 'skip' });
      expect(r.description).toMatch(/interpolat/i);
      expect(r.description).toMatch(/same date/i);
      expect(r.short_description).toBeNull();
      expect(r.what_it_measures).toBeNull();
      expect(r.why_it_matters).toBeNull();
      // every dependent resolves to a real site_metrics row
      const found = await tx`select code from site_metrics where code = any(${DEPS})`;
      expect(found).toHaveLength(4);
    });
  }, TEST_TIMEOUT);

  it('leaves the 0144 / 0145 rows untouched', async () => {
    await inTx(async (tx) => {
      await to0145(tx);
      const pre = await snapshot(tx);
      await tx.unsafe(upSql);
      expect(await snapshot(tx)).toEqual(pre);
    });
  }, TEST_TIMEOUT);

  it('is idempotent, restores a hand-edited definition and never re-activates', async () => {
    await inTx(async (tx) => {
      await to0145(tx);
      await tx.unsafe(upSql);
      const q = `select to_jsonb(t) - 'id' - 'created_at' - 'updated_at' as r from site_metrics t where code = '${CODE}'`;
      const once = await tx.unsafe(q);
      await tx.unsafe(upSql);
      expect(await tx.unsafe(q)).toEqual(once);

      await tx`update site_metrics set formula = 'broken', label = 'x', is_active = false where code = ${CODE}`;
      await tx.unsafe(upSql);
      const r = await interpRow(tx);
      expect(r.formula).toBe(FORMULA);
      expect(r.label).toBe('COD Deficit (m, interpolated 10 m)');
      expect(r.is_active).toBe(false);
    });
  }, TEST_TIMEOUT);

  it('RAISES (and creates nothing) when any of the four sources is missing', async () => {
    for (const code of DEPS) {
      await inTx(async (tx) => {
        await to0145(tx);
        // the 0145 deficits reference the M legs / DASH_10YD; drop them so the source row can go
        await tx`delete from site_metrics where code in ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD')`;
        await tx`delete from organization_metrics where metric_code = ${code}`;
        await tx`delete from site_metrics where code = ${code}`;
        await expect(
          tx.savepoint(async (sp: Tx) => {
            await sp.unsafe(upSql);
          }),
        ).rejects.toThrow(new RegExp(code));
        expect(await interpRow(tx)).toBeUndefined();
      });
    }
  }, TEST_TIMEOUT);

  it('enables the metric only for orgs with all four sources enabled, and never overrides an existing row', async () => {
    await inTx(async (tx) => {
      const orgs = ['fx161-all', 'fx161-no20', 'fx161-off10', 'fx161-oneLeg', 'fx161-admin', 'fx161-none'];
      const all4 = (o: string): Array<[string, string, boolean]> => DEPS.map((c) => [o, c, true]);
      await to0145(tx, orgs, [
        ...all4('fx161-all'),
        ['fx161-no20', 'AGILITY_505_M_L', true],
        ['fx161-no20', 'AGILITY_505_M_R', true],
        ['fx161-no20', 'DASH_10YD', true],
        ['fx161-off10', 'AGILITY_505_M_L', true],
        ['fx161-off10', 'AGILITY_505_M_R', true],
        ['fx161-off10', 'DASH_10YD', false],
        ['fx161-off10', 'DASH_20YD', true],
        ['fx161-oneLeg', 'AGILITY_505_M_L', true],
        ['fx161-oneLeg', 'DASH_10YD', true],
        ['fx161-oneLeg', 'DASH_20YD', true],
        ...all4('fx161-admin'),
      ]);
      await tx.unsafe(upSql);
      expect(await interpOrgRows(tx, orgs)).toEqual([
        { organization_id: 'fx161-admin', is_enabled: true },
        { organization_id: 'fx161-all', is_enabled: true },
      ]);
      // an admin's later choice survives a re-run
      await tx`update organization_metrics set is_enabled = false where organization_id = 'fx161-admin' and metric_code = ${CODE}`;
      await tx.unsafe(upSql);
      expect(await interpOrgRows(tx, orgs)).toEqual([
        { organization_id: 'fx161-admin', is_enabled: false },
        { organization_id: 'fx161-all', is_enabled: true },
      ]);
    });
  }, TEST_TIMEOUT);

  it('down removes calculated rows, org rows, the metric and its tracking row, leaving 0144 / 0145 intact', async () => {
    await inTx(async (tx) => {
      const orgs = ['fx161-dA'];
      await to0145(tx, orgs, DEPS.map((c) => ['fx161-dA', c, true] as [string, string, boolean]));
      const pre = await snapshot(tx);
      await tx.unsafe(upSql);
      expect(await interpOrgRows(tx, orgs)).toHaveLength(1);
      await tx`insert into users (id, username, first_name, last_name, full_name, password)
               values (${FX_USER}, 'fx161user', 'Fx', 'One', 'Fx One', 'x')`;
      await tx`insert into measurements (id, user_id, submitted_by, date, age, metric, value, units, is_calculated, calculated_from_measurement_ids, calculation_metadata) values
               ('fx161-calc', ${FX_USER}, ${FX_USER}, '2026-09-01', 16, ${CODE}, 0.883, 's', true, ARRAY['a','b','c','d'], '{"formula":"f","sourceValues":{}}'::jsonb),
               ('fx161-calc-m', ${FX_USER}, ${FX_USER}, '2026-09-01', 16, 'AGILITY_COD_DEFICIT_M', 0.900, 's', true, ARRAY['a','b','c'], '{"formula":"f","sourceValues":{}}'::jsonb),
               ('fx161-src', ${FX_USER}, ${FX_USER}, '2026-09-01', 16, 'DASH_20YD', 3.050, 's', false, null, null)`;
      await tx.unsafe(`CREATE TABLE IF NOT EXISTS manual_migrations (
        id SERIAL PRIMARY KEY, migration_name TEXT NOT NULL UNIQUE, applied_at TIMESTAMP DEFAULT NOW() NOT NULL)`);
      await tx`insert into manual_migrations (migration_name) values ('0145_add_cod_deficit_metrics'), ('0161_add_cod_deficit_m_interp') on conflict do nothing`;

      await tx.unsafe(downSql);

      expect(await interpRow(tx)).toBeUndefined();
      expect(await interpOrgRows(tx, orgs)).toHaveLength(0);
      const left = await tx`select id from measurements where id like 'fx161-%' order by id`;
      expect(left.map((r: { id: string }) => r.id)).toEqual(['fx161-calc-m', 'fx161-src']);
      expect(await snapshot(tx)).toEqual(pre);
      const t = await tx`select migration_name from manual_migrations where migration_name in ('0145_add_cod_deficit_metrics', '0161_add_cod_deficit_m_interp')`;
      expect(t.map((r: { migration_name: string }) => r.migration_name)).toEqual(['0145_add_cod_deficit_metrics']);
      // idempotent
      await tx.unsafe(downSql);
      expect(await snapshot(tx)).toEqual(pre);
    });
  }, TEST_TIMEOUT);

  it('0144_down refuses while 0161 is applied; 0161_down, 0145_down, 0144_down then succeed', async () => {
    await inTx(async (tx) => {
      await to0145(tx);
      await tx.unsafe(upSql);
      await tx`delete from site_metrics where code in ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD')`;
      await expect(
        tx.savepoint(async (sp: Tx) => {
          await sp.unsafe(down0144);
        }),
      ).rejects.toThrow(/0161|AGILITY_COD_DEFICIT_M_INTERP/);
      await tx.unsafe(up0145);
      await tx.unsafe(downSql);
      await tx.unsafe(down0145);
      await tx.unsafe(down0144);
      const [{ n }] = await tx`select count(*)::int as n from site_metrics where code ~ '^AGILITY_505_(M|YD)' or code like 'AGILITY_COD_DEFICIT%'`;
      expect(n).toBe(0);
    });
  }, TEST_TIMEOUT);

  it('down refuses (and changes nothing) when a manual measurement or another table references the code', async () => {
    const cases: Record<string, string> = {
      manual_measurement: `insert into measurements (id, user_id, submitted_by, date, age, metric, value, units, is_calculated)
                           values ('fx161-manual', '${FX_USER}', '${FX_USER}', '2026-09-01', 16, '${CODE}', 0.7, 's', false)`,
      custom_benchmarks: `insert into custom_benchmarks (id, organization_id, metric_code, name, benchmark_value)
                          values ('fx161-cb', '${FX_ORG}', '${CODE}', 'FX', 0.9)`,
      goals: `insert into goals (id, user_id, metric, goal_type, target_value, baseline_value, current_value, target_date)
              values ('fx161-goal', '${FX_USER}', '${CODE}', 'target', 0.7, 0.9, 0.8, '2027-01-01')`,
      report_benchmarks: `insert into report_benchmarks (id, report_id, metric_code, name, benchmark_value)
                          values ('fx161-rb', 'fx161-report', '${CODE}', 'FX', 0.9)`,
      reports_config: `update reports set config = '{"metrics":["${CODE}"]}'::jsonb where id = 'fx161-report'`,
      custom_org_metrics: `insert into custom_org_metrics (id, organization_id, code, label, metric_type, is_derived, formula, dependent_metrics)
                           values ('fx161-com', '${FX_ORG}', 'FX_USES_INTERP', 'FX', 'lower_is_better', true,
                                   '${CODE} * 2', ARRAY['${CODE}'])`,
      site_benchmarks: `insert into site_benchmarks (id, metric_code, name, comparison_operator, benchmark_value, is_system_default, is_active, display_order)
                        values ('fx161-sb', '${CODE}', 'FX', 'lte', 0.9, false, true, 999)`,
      event_metrics: `insert into events (id, name, start_date) values ('fx161-event', 'FX 161 Event', now());
                      insert into event_metrics (id, event_id, metric_code) values ('fx161-em', 'fx161-event', '${CODE}')`,
      site_metric_explanations: `insert into site_metric_explanations (id, metric_code, title)
                                 values ('fx161-expl', '${CODE}', 'FX 161 title')`,
    };
    for (const [name, stmt] of Object.entries(cases)) {
      await inTx(async (tx) => {
        await to0145(tx);
        await tx.unsafe(upSql);
        await tx`insert into organizations (id, name) values (${FX_ORG}, 'FX 161 Org')`;
        await tx`insert into users (id, username, first_name, last_name, full_name, password)
                 values (${FX_USER}, 'fx161user', 'Fx', 'One', 'Fx One', 'x')`;
        await tx`insert into reports (id, organization_id, name, report_type, config)
                 values ('fx161-report', ${FX_ORG}, 'FX', 'custom', '{"metrics":["AGILITY_COD_DEFICIT_M"]}'::jsonb)`;
        await tx.unsafe(stmt);
        await expect(
          tx.savepoint(async (sp: Tx) => {
            await sp.unsafe(downSql);
          }),
          name,
        ).rejects.toThrow(/refused/i);
        expect(await interpRow(tx), name).toBeDefined();
      });
    }
  }, TEST_TIMEOUT);

  // --------------------------------------------------------------------------
  // Layer 4 — the real calculator inside the rolled-back transaction
  // --------------------------------------------------------------------------
  type M = typeof schema.measurements.$inferSelect;

  async function calcHarness(tx: Tx) {
    const client = new Proxy(tx, {
      get(target, prop) {
        if (prop === 'begin') return target.savepoint.bind(target);
        if (prop === 'options') return sql.options;
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const d = drizzle(client as never, { schema });
    const calc = new DerivedMetricCalculator(d as never);
    await tx`insert into organizations (id, name) values (${FX_ORG}, 'FX 161 Org')`;
    await tx`insert into users (id, username, first_name, last_name, full_name, password, birth_date, birth_year)
             values (${FX_USER}, 'fx161user', 'Fx', 'One', 'Fx One', 'x', '2010-01-01', 2010)`;
    let seq = 0;
    const record = async (metric: string, value: string, date: string): Promise<M> => {
      seq += 1;
      const [m] = await d
        .insert(schema.measurements)
        .values({
          id: `fx161-m${seq}`,
          userId: FX_USER,
          submittedBy: FX_USER,
          date,
          age: 16,
          metric,
          value,
          units: 's',
          organizationId: FX_ORG,
          // the calculator only reads verified sources
          isVerified: true,
        })
        .returning();
      await calc.processNewMeasurement(m);
      return m;
    };
    const rowsOf = async (metric: string) =>
      (await tx`select value::text as value, date::text as date, is_calculated, calculated_from_measurement_ids, calculation_metadata
                  from measurements where user_id = ${FX_USER} and metric = ${metric} order by date, id`) as Record<string, any>[];
    return { record, rowsOf };
  }

  it('calculator: spec example on one date -> one row of 0.883 with the four sources recorded', async () => {
    await inTx(async (tx) => {
      await to0145(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      const ids = [
        await h.record('AGILITY_505_M_L', '2.850', '2026-09-01'),
        await h.record('AGILITY_505_M_R', '2.800', '2026-09-01'),
        await h.record('DASH_10YD', '1.800', '2026-09-01'),
        await h.record('DASH_20YD', '3.050', '2026-09-01'),
      ].map((m) => m.id);
      const rows = await h.rowsOf(CODE);
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('0.883');
      expect(rows[0].is_calculated).toBe(true);
      expect(rows[0].date).toBe('2026-09-01');
      expect([...rows[0].calculated_from_measurement_ids].sort()).toEqual(ids.sort());
      expect(rows[0].calculation_metadata.formula).toBe(FORMULA);
    });
  }, TEST_TIMEOUT);

  it('calculator: skips when any leg or sprint is missing or on another date', async () => {
    await inTx(async (tx) => {
      await to0145(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      // One leg missing
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      await h.record('DASH_10YD', '1.800', '2026-09-01');
      await h.record('DASH_20YD', '3.050', '2026-09-01');
      expect(await h.rowsOf(CODE)).toHaveLength(0);
      await h.record('AGILITY_505_M_R', '2.800', '2026-09-01');
      expect(await h.rowsOf(CODE)).toHaveLength(1);
      // DASH_10YD missing / on another date
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-02');
      await h.record('AGILITY_505_M_R', '2.800', '2026-09-02');
      await h.record('DASH_20YD', '3.050', '2026-09-02');
      await h.record('DASH_10YD', '1.800', '2026-09-09');
      expect(await h.rowsOf(CODE)).toHaveLength(1);
      // DASH_20YD on another date
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-03');
      await h.record('AGILITY_505_M_R', '2.800', '2026-09-03');
      await h.record('DASH_10YD', '1.800', '2026-09-03');
      await h.record('DASH_20YD', '3.050', '2026-09-10');
      expect(await h.rowsOf(CODE)).toHaveLength(1);
    });
  }, TEST_TIMEOUT);

  it('calculator: yard 5-0-5 legs never feed it, and the 0145 deficits are unchanged', async () => {
    await inTx(async (tx) => {
      await to0145(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      for (const [metric, value] of [
        ['AGILITY_505_YD_L', '2.550'],
        ['AGILITY_505_YD_R', '2.600'],
        ['DASH_10YD', '1.750'],
        ['DASH_20YD', '3.000'],
      ] as const) {
        await h.record(metric, value, '2026-09-01');
      }
      expect(await h.rowsOf(CODE)).toHaveLength(0);
      expect((await h.rowsOf('AGILITY_COD_DEFICIT_YD')).map((r) => r.value)).toEqual(['0.800']);

      await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      await h.record('AGILITY_505_M_R', '2.800', '2026-09-01');
      // The yard sprints must not feed the 0145 metric deficit: it waits for DASH_10M.
      expect(await h.rowsOf('AGILITY_COD_DEFICIT_M')).toHaveLength(0);
      await h.record('DASH_10M', '1.900', '2026-09-01');
      expect((await h.rowsOf('AGILITY_COD_DEFICIT_M')).map((r) => r.value)).toEqual(['0.900']);
      // 2.80 - (1.75 + 0.0936 * 1.25) = 0.933
      expect((await h.rowsOf(CODE)).map((r) => r.value)).toEqual(['0.933']);
      expect((await h.rowsOf('AGILITY_COD_DEFICIT_YD')).map((r) => r.value)).toEqual(['0.800']);
    });
  }, TEST_TIMEOUT);
});
