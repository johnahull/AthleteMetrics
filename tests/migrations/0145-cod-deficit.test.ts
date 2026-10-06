// @vitest-environment node
/**
 * Test suite for Migration 0145: COD deficit derived metrics
 *
 * Spec: AM-FEAT-016 Part 2 (+ Resolved Decisions 3-5, 7, 9).
 * Plan: .omc/plans/am-feat-016-plan.md (Step 5).
 *
 *   AGILITY_COD_DEFICIT_M  = min(AGILITY_505_M_L,  AGILITY_505_M_R)  - DASH_10M
 *   AGILITY_COD_DEFICIT_YD = min(AGILITY_505_YD_L, AGILITY_505_YD_R) - DASH_10YD
 *
 * Layers:
 *   1. Static analysis of the up/down SQL files (no DB needed).
 *   2. Pure formula checks via formula-service (no DB needed).
 *   3. Behavioral: the EXACT up/down files are executed with the `postgres`
 *      client against the DB in DATABASE_URL, inside a transaction that is
 *      always rolled back. The baseline DB is pre-0144, so each transaction
 *      first runs the exact 0144 up file, then 0145.
 *   4. Calculator: the real DerivedMetricCalculator runs inside that same
 *      rolled-back transaction (drizzle is bound to the transaction; its
 *      nested transaction() maps to a savepoint).
 *
 * DATABASE_URL unset  -> layers 3-4 are skipped.
 * DATABASE_URL set but unreachable -> they FAIL (never a silent false green).
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { drizzle } from 'drizzle-orm/postgres-js';
import { eq } from 'drizzle-orm';
import * as schema from '@shared/schema';
import { evaluateFormula, validateFormula } from '../../packages/api/services/formula-service';
import { DerivedMetricCalculator } from '../../packages/api/services/derived-metric-calculator';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0145_add_cod_deficit_metrics.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0145_add_cod_deficit_metrics_down.sql');
const UP_0144_PATH = path.join(projectRoot, 'migrations', '0144_split_505_by_protocol.sql');
const DOWN_0144_PATH = path.join(projectRoot, 'migrations', '0144_split_505_by_protocol_down.sql');

const DATABASE_URL = process.env.DATABASE_URL;

const M_FORMULA = 'min(AGILITY_505_M_L, AGILITY_505_M_R) - DASH_10M';
const YD_FORMULA = 'min(AGILITY_505_YD_L, AGILITY_505_YD_R) - DASH_10YD';
const M_DEPS = ['AGILITY_505_M_L', 'AGILITY_505_M_R', 'DASH_10M'];
const YD_DEPS = ['AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'DASH_10YD'];
const DEFICIT_CODES = ['AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD'];

function stripComments(s: string): string {
  return s
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
}

// ============================================================================
// Layer 1 — static analysis
// ============================================================================
describe('Migration 0145: static SQL analysis', () => {
  it('up and down files exist', () => {
    expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
    expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
  });

  describe('up file', () => {
    let up: string;
    beforeAll(() => {
      up = stripComments(fs.readFileSync(UP_SQL_PATH, 'utf-8'));
    });

    it('does not manage its own transaction and never drops or truncates', () => {
      expect(up).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
      expect(up).not.toMatch(/DROP\s+TABLE/i);
      expect(up).not.toMatch(/TRUNCATE/i);
    });

    it('inserts site_metrics idempotently with ON CONFLICT (code) DO UPDATE', () => {
      expect(up).toMatch(/INSERT\s+INTO\s+site_metrics/i);
      expect(up).toMatch(/ON\s+CONFLICT\s*\(\s*code\s*\)\s+DO\s+UPDATE/i);
    });

    it('declares both codes, exact formulas and dependent_metrics', () => {
      for (const c of DEFICIT_CODES) expect(up).toContain(`'${c}'`);
      expect(up).toContain(`'${M_FORMULA}'`);
      expect(up).toContain(`'${YD_FORMULA}'`);
      expect(up).toContain("ARRAY['AGILITY_505_M_L', 'AGILITY_505_M_R', 'DASH_10M']");
      expect(up).toContain("ARRAY['AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'DASH_10YD']");
    });

    it('uses same_date / skip calculation_config', () => {
      expect(up).toContain('"dateMatchStrategy":"same_date"');
      expect(up).toContain('"missingSourceBehavior":"skip"');
    });

    it('requires 0144: raises when the split 5-0-5 leg metrics are missing', () => {
      expect(up).toMatch(/RAISE\s+EXCEPTION/i);
      expect(up).toContain('AGILITY_505_M_L');
      expect(up).toContain('AGILITY_505_YD_L');
      expect(up).toMatch(/0144/);
    });

    it('does not auto-enable for organizations and seeds no benchmarks', () => {
      expect(up).not.toMatch(/INSERT\s+INTO\s+organization_metrics/i);
      expect(up).not.toMatch(/site_benchmarks/i);
      expect(up).not.toMatch(/benchmark_set_items/i);
    });

    it('ends with a RAISE NOTICE summary', () => {
      expect(up).toMatch(/RAISE\s+NOTICE\s+'Migration 0145/);
    });
  });

  describe('down file', () => {
    let down: string;
    beforeAll(() => {
      down = stripComments(fs.readFileSync(DOWN_SQL_PATH, 'utf-8'));
    });

    it('does not manage its own transaction and never drops tables', () => {
      expect(down).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
      expect(down).not.toMatch(/DROP\s+TABLE/i);
      expect(down).not.toMatch(/TRUNCATE/i);
    });

    it('deletes calculated deficit measurements BEFORE the site_metrics rows', () => {
      const m = down.search(/DELETE\s+FROM\s+measurements/i);
      const s = down.search(/DELETE\s+FROM\s+site_metrics/i);
      expect(m).toBeGreaterThan(-1);
      expect(s).toBeGreaterThan(m);
      expect(down).toMatch(/is_calculated\s*=\s*true/i);
      // every DELETE has a WHERE
      for (const stmt of down.match(/DELETE\s+FROM[^;]*;/gi) ?? []) {
        expect(stmt).toMatch(/WHERE/i);
      }
    });
  });
});

// ============================================================================
// Layer 2 — formula-service
// ============================================================================
describe('Migration 0145: formula evaluation', () => {
  it('min() is accepted and every variable validates against the dependent codes', () => {
    const m = validateFormula(M_FORMULA, M_DEPS);
    expect(m.errors).toEqual([]);
    expect(m.valid).toBe(true);
    expect(m.referencedMetrics.sort()).toEqual(['agility_505_m_l', 'agility_505_m_r', 'dash_10m']);

    const yd = validateFormula(YD_FORMULA, YD_DEPS);
    expect(yd.errors).toEqual([]);
    expect(yd.valid).toBe(true);
    expect(yd.referencedMetrics.sort()).toEqual(['agility_505_yd_l', 'agility_505_yd_r', 'dash_10yd']);
  });

  it('metric: left 2.85, right 2.80, DASH_10M 1.90 -> 0.900 (faster leg)', () => {
    const v = evaluateFormula(M_FORMULA, {
      agility_505_m_l: 2.85,
      agility_505_m_r: 2.8,
      dash_10m: 1.9,
    });
    expect(v).not.toBeNull();
    expect(v!).toBeCloseTo(0.9, 3);
  });

  it('metric: the faster leg is used whichever side it is', () => {
    const v = evaluateFormula(M_FORMULA, { agility_505_m_l: 2.8, agility_505_m_r: 2.85, dash_10m: 1.9 });
    expect(v!).toBeCloseTo(0.9, 3);
  });

  it('yards: left 2.55, right 2.60, DASH_10YD 1.75 -> 0.800', () => {
    const v = evaluateFormula(YD_FORMULA, {
      agility_505_yd_l: 2.55,
      agility_505_yd_r: 2.6,
      dash_10yd: 1.75,
    });
    expect(v).not.toBeNull();
    expect(v!).toBeCloseTo(0.8, 3);
  });
});

// ============================================================================
// Layers 3 + 4 — behavioral, against the real DB in a rolled-back transaction
// ============================================================================
class Rollback extends Error {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

const FX_USER = 'fx145-user';
const FX_ORG = 'fx145-org';

describe.skipIf(!DATABASE_URL)('Migration 0145: behavioral (real DB, rolled back)', () => {
  let sql: postgres.Sql;
  let upSql: string;
  let downSql: string;
  let up0144: string;
  let down0144: string;

  beforeAll(async () => {
    // Missing files must fail loudly here (RED), not skip.
    upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
    downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
    up0144 = fs.readFileSync(UP_0144_PATH, 'utf-8');
    down0144 = fs.readFileSync(DOWN_0144_PATH, 'utf-8');
    sql = postgres(DATABASE_URL as string, {
      max: 1,
      connect_timeout: 10,
      onnotice: () => {},
      ssl: DATABASE_URL!.includes('localhost') ? false : 'require',
    });
    // Unreachable DB -> throws -> every test in this block fails.
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

  /** Pre-0144 state (undo 0144 first if the DB already has it). */
  async function toPre0144(tx: Tx) {
    const [{ n }] = await tx`select count(*)::int as n from site_metrics where code = 'AGILITY_505_M_L'`;
    if (n > 0) await tx.unsafe(down0144);
  }

  /** Post-0144 state, the exact 0144 up file applied (idempotent). */
  async function to0144(tx: Tx) {
    await toPre0144(tx);
    await tx.unsafe(up0144);
  }

  async function deficitRows(tx: Tx) {
    return (await tx`select * from site_metrics where code in ('AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD') order by code`) as Record<string, any>[];
  }

  async function snapshot0144(tx: Tx) {
    return (
      await tx.unsafe(
        `select to_jsonb(t) - 'id' - 'created_at' - 'updated_at' as r from site_metrics t where code ~ '^AGILITY_505' order by code`,
      )
    ).map((x: { r: unknown }) => x.r);
  }

  const TEST_TIMEOUT = 60000;

  // --------------------------------------------------------------------------
  it('creates exactly the two deficit metrics with the specified definition', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const rows = await deficitRows(tx);
      expect(rows.map((r) => r.code)).toEqual(DEFICIT_CODES);
      const by = Object.fromEntries(rows.map((r) => [r.code, r]));

      expect(by.AGILITY_COD_DEFICIT_M.formula).toBe(M_FORMULA);
      expect(by.AGILITY_COD_DEFICIT_M.dependent_metrics).toEqual(M_DEPS);
      expect(by.AGILITY_COD_DEFICIT_YD.formula).toBe(YD_FORMULA);
      expect(by.AGILITY_COD_DEFICIT_YD.dependent_metrics).toEqual(YD_DEPS);
      expect(by.AGILITY_COD_DEFICIT_M.label).toBe('COD Deficit (m)');
      expect(by.AGILITY_COD_DEFICIT_YD.label).toBe('COD Deficit (yd)');

      for (const r of rows) {
        expect(r.category).toBe('agility');
        expect(r.unit).toBe('s');
        expect(r.metric_type).toBe('lower_is_better');
        expect(r.is_derived).toBe(true);
        expect(r.is_active).toBe(true);
        expect(r.is_system_default).toBe(true);
        expect(r.decimal_precision).toBe(3);
        expect(Number(r.validation_min)).toBe(0);
        expect(Number(r.validation_max)).toBe(2);
        expect(r.calculation_config).toEqual({
          dateMatchStrategy: 'same_date',
          missingSourceBehavior: 'skip',
        });
        expect(r.description).toMatch(/faster/i);
        expect(r.description).toMatch(/turn/i);
        expect(r.description).toMatch(/same date/i);
        expect(r.description).toMatch(/both legs/i);
      }
      expect(by.AGILITY_COD_DEFICIT_M.description).toMatch(/10 m/);
      expect(by.AGILITY_COD_DEFICIT_M.description).not.toMatch(/\byd\b|yard/i);
      expect(by.AGILITY_COD_DEFICIT_YD.description).toMatch(/10 yd/);
      expect(by.AGILITY_COD_DEFICIT_YD.description).not.toMatch(/\bm\b sprint|10 m/i);
    });
  }, TEST_TIMEOUT);

  it('uses an existing agility category, and the formulas validate against the stored rows', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const [{ n }] = await tx`select count(*)::int as n from site_metrics where category = 'agility' and code like 'AGILITY_505%'`;
      expect(n).toBeGreaterThan(0);
      for (const r of await deficitRows(tx)) {
        const v = validateFormula(r.formula, r.dependent_metrics);
        expect(v.errors).toEqual([]);
        // every dependent resolves to a real site_metrics row
        const found = await tx`select code from site_metrics where code = any(${r.dependent_metrics})`;
        expect(found).toHaveLength(3);
      }
    });
  }, TEST_TIMEOUT);

  it('does not auto-enable orgs and seeds no benchmarks', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      const [{ om }] = await tx`select count(*)::int as om from organization_metrics`;
      const [{ sb }] = await tx`select count(*)::int as sb from site_benchmarks`;
      await tx.unsafe(upSql);
      const [{ om2 }] = await tx`select count(*)::int as om2 from organization_metrics`;
      const [{ sb2 }] = await tx`select count(*)::int as sb2 from site_benchmarks`;
      expect(om2).toBe(om);
      expect(sb2).toBe(sb);
      const [{ n }] = await tx`select count(*)::int as n from site_benchmarks where metric_code like 'AGILITY_COD_DEFICIT%'`;
      expect(n).toBe(0);
    });
  }, TEST_TIMEOUT);

  it('is idempotent: re-running changes nothing and leaves two rows', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const once = await tx.unsafe(`select to_jsonb(t) - 'id' - 'created_at' - 'updated_at' as r from site_metrics t where code like 'AGILITY_COD_DEFICIT%' order by code`);
      await tx.unsafe(upSql);
      const twice = await tx.unsafe(`select to_jsonb(t) - 'id' - 'created_at' - 'updated_at' as r from site_metrics t where code like 'AGILITY_COD_DEFICIT%' order by code`);
      expect(twice).toEqual(once);
      expect(twice).toHaveLength(2);
    });
  }, TEST_TIMEOUT);

  it('re-run restores a hand-edited definition (ON CONFLICT DO UPDATE)', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      await tx`update site_metrics set formula = 'broken', label = 'x' where code = 'AGILITY_COD_DEFICIT_M'`;
      await tx.unsafe(upSql);
      const [r] = await tx`select formula, label from site_metrics where code = 'AGILITY_COD_DEFICIT_M'`;
      expect(r.formula).toBe(M_FORMULA);
      expect(r.label).toBe('COD Deficit (m)');
    });
  }, TEST_TIMEOUT);

  it('RAISES (0144 required) on a pre-0144 database and creates nothing', async () => {
    await inTx(async (tx) => {
      await toPre0144(tx);
      await expect(
        tx.savepoint(async (sp: Tx) => {
          await sp.unsafe(upSql);
        }),
      ).rejects.toThrow(/0144/);
      expect(await deficitRows(tx)).toHaveLength(0);
    });
  }, TEST_TIMEOUT);

  it('down removes calculated deficit measurements and both metrics, leaving the 0144 state intact', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      const pre = await snapshot0144(tx);
      await tx.unsafe(upSql);
      await tx`insert into users (id, username, first_name, last_name, full_name, password)
               values (${FX_USER}, 'fx145user', 'Fx', 'One', 'Fx One', 'x')`;
      await tx`insert into measurements (id, user_id, submitted_by, date, age, metric, value, units, is_calculated, calculated_from_measurement_ids, calculation_metadata) values
               ('fx145-calc-m', ${FX_USER}, ${FX_USER}, '2026-09-01', 16, 'AGILITY_COD_DEFICIT_M', 0.900, 's', true, ARRAY['a','b','c'], '{"formula":"f","sourceValues":{}}'::jsonb),
               ('fx145-calc-yd', ${FX_USER}, ${FX_USER}, '2026-09-01', 16, 'AGILITY_COD_DEFICIT_YD', 0.800, 's', true, ARRAY['a','b','c'], '{"formula":"f","sourceValues":{}}'::jsonb),
               ('fx145-src', ${FX_USER}, ${FX_USER}, '2026-09-01', 16, 'AGILITY_505_M_L', 2.850, 's', false, null, null),
               ('fx145-ctl', ${FX_USER}, ${FX_USER}, '2026-09-01', 16, 'DASH_10M', 1.900, 's', false, null, null)`;

      await tx.unsafe(downSql);

      expect(await deficitRows(tx)).toHaveLength(0);
      const left = await tx`select id from measurements where id like 'fx145-%' order by id`;
      expect(left.map((r: { id: string }) => r.id)).toEqual(['fx145-ctl', 'fx145-src']);
      expect(await snapshot0144(tx)).toEqual(pre);

      // down is idempotent
      await tx.unsafe(downSql);
      expect(await snapshot0144(tx)).toEqual(pre);
    });
  }, TEST_TIMEOUT);

  it('down refuses (and changes nothing) when a manually entered deficit measurement exists', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      await tx`insert into users (id, username, first_name, last_name, full_name, password)
               values (${FX_USER}, 'fx145user', 'Fx', 'One', 'Fx One', 'x')`;
      await tx`insert into measurements (id, user_id, submitted_by, date, age, metric, value, units, is_calculated)
               values ('fx145-manual', ${FX_USER}, ${FX_USER}, '2026-09-01', 16, 'AGILITY_COD_DEFICIT_M', 0.700, 's', false)`;
      await expect(
        tx.savepoint(async (sp: Tx) => {
          await sp.unsafe(downSql);
        }),
      ).rejects.toThrow(/manual|direct|non-calculated/i);
      expect(await deficitRows(tx)).toHaveLength(2);
      const [{ n }] = await tx`select count(*)::int as n from measurements where id = 'fx145-manual'`;
      expect(n).toBe(1);
    });
  }, TEST_TIMEOUT);

  // --------------------------------------------------------------------------
  // Layer 4 — the real calculator inside the rolled-back transaction
  // --------------------------------------------------------------------------
  type M = typeof schema.measurements.$inferSelect;

  async function calcHarness(tx: Tx) {
    // drizzle's transaction() calls client.begin(); on a transaction handle
    // the equivalent is savepoint().
    const client = new Proxy(tx, {
      get(target, prop) {
        if (prop === 'begin') return target.savepoint.bind(target);
        // transaction handles carry no options; drizzle needs the connection's parsers
        if (prop === 'options') return sql.options;
        const v = Reflect.get(target, prop, target);
        return typeof v === 'function' ? v.bind(target) : v;
      },
    });
    const d = drizzle(client as never, { schema });
    const calc = new DerivedMetricCalculator(d as never);
    await tx`insert into organizations (id, name) values (${FX_ORG}, 'FX 145 Org')`;
    await tx`insert into users (id, username, first_name, last_name, full_name, password, birth_date, birth_year)
             values (${FX_USER}, 'fx145user', 'Fx', 'One', 'Fx One', 'x', '2010-01-01', 2010)`;

    let seq = 0;
    const add = async (metric: string, value: string, date: string, units = 's'): Promise<M> => {
      seq += 1;
      const [m] = await d
        .insert(schema.measurements)
        .values({
          id: `fx145-m${seq}`,
          userId: FX_USER,
          submittedBy: FX_USER,
          date,
          age: 16,
          metric,
          value,
          units,
          organizationId: FX_ORG,
          // the calculator only reads verified sources (isVerified = true)
          isVerified: true,
        })
        .returning();
      return m;
    };
    /** insert, then run the calculator exactly as the app does after a create */
    const record = async (metric: string, value: string, date: string): Promise<{ m: M; out: M[] }> => {
      const m = await add(metric, value, date);
      const out = await calc.processNewMeasurement(m);
      return { m, out };
    };
    const rowsOf = async (metric: string) =>
      (await tx`select id, value::text as value, metric, date::text as date, is_calculated, calculated_from_measurement_ids, calculation_metadata
                  from measurements where user_id = ${FX_USER} and metric = ${metric} order by date, id`) as Record<string, any>[];
    return { d, calc, add, record, rowsOf };
  }

  it('calculator: L + R + DASH_10M on the same date -> one deficit row of 0.900 with sources recorded', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      const l = await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      expect(l.out.filter((x) => x.metric === 'AGILITY_COD_DEFICIT_M')).toHaveLength(0);
      const r = await h.record('AGILITY_505_M_R', '2.800', '2026-09-01');
      expect(r.out.filter((x) => x.metric === 'AGILITY_COD_DEFICIT_M')).toHaveLength(0);
      const s = await h.record('DASH_10M', '1.900', '2026-09-01');
      expect(s.out.map((x) => x.metric)).toContain('AGILITY_COD_DEFICIT_M');

      const rows = await h.rowsOf('AGILITY_COD_DEFICIT_M');
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('0.900');
      expect(rows[0].is_calculated).toBe(true);
      expect(rows[0].date).toBe('2026-09-01');
      expect([...rows[0].calculated_from_measurement_ids].sort()).toEqual([l.m.id, r.m.id, s.m.id].sort());
      expect(rows[0].calculation_metadata.formula).toBe(M_FORMULA);
      expect(rows[0].calculation_metadata.sourceValues).toEqual({
        agility_505_m_l: 2.85,
        agility_505_m_r: 2.8,
        dash_10m: 1.9,
      });
      // no yard deficit appears
      expect(await h.rowsOf('AGILITY_COD_DEFICIT_YD')).toHaveLength(0);
    });
  }, TEST_TIMEOUT);

  it('calculator: yard legs + DASH_10YD -> AGILITY_COD_DEFICIT_YD = 0.800', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      await h.record('AGILITY_505_YD_L', '2.550', '2026-09-01');
      await h.record('AGILITY_505_YD_R', '2.600', '2026-09-01');
      await h.record('DASH_10YD', '1.750', '2026-09-01');
      const rows = await h.rowsOf('AGILITY_COD_DEFICIT_YD');
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('0.800');
      expect(rows[0].is_calculated).toBe(true);
      expect(await h.rowsOf('AGILITY_COD_DEFICIT_M')).toHaveLength(0);
    });
  }, TEST_TIMEOUT);

  it('calculator: any insertion order yields the same single row', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      await h.record('DASH_10M', '1.900', '2026-09-01');
      await h.record('AGILITY_505_M_R', '2.800', '2026-09-01');
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      const rows = await h.rowsOf('AGILITY_COD_DEFICIT_M');
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('0.900');
    });
  }, TEST_TIMEOUT);

  it('calculator: different dates -> no deficit and no error', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      await h.record('AGILITY_505_M_R', '2.800', '2026-09-01');
      await h.record('DASH_10M', '1.900', '2026-09-08');
      expect(await h.rowsOf('AGILITY_COD_DEFICIT_M')).toHaveLength(0);
    });
  }, TEST_TIMEOUT);

  it('calculator: legs on different dates from each other -> no deficit', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      await h.record('AGILITY_505_M_R', '2.800', '2026-09-08');
      await h.record('DASH_10M', '1.900', '2026-09-01');
      await h.record('DASH_10M', '1.900', '2026-09-08');
      expect(await h.rowsOf('AGILITY_COD_DEFICIT_M')).toHaveLength(0);
    });
  }, TEST_TIMEOUT);

  it('calculator: only one leg -> no deficit (either leg)', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      await h.record('DASH_10M', '1.900', '2026-09-01');
      await h.record('AGILITY_505_M_R', '2.700', '2026-09-08');
      await h.record('DASH_10M', '1.900', '2026-09-08');
      // second date has only the right leg + sprint; first only the left + sprint...
      // (R on 09-08 and L on 09-01 never share a date with each other)
      expect(await h.rowsOf('AGILITY_COD_DEFICIT_M')).toHaveLength(0);
    });
  }, TEST_TIMEOUT);

  it('calculator: missing sprint -> no deficit', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      await h.record('AGILITY_505_M_R', '2.800', '2026-09-01');
      expect(await h.rowsOf('AGILITY_COD_DEFICIT_M')).toHaveLength(0);
    });
  }, TEST_TIMEOUT);

  it('calculator: metric legs + DASH_10YD -> none; yard legs + DASH_10M -> none', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      await h.record('AGILITY_505_M_R', '2.800', '2026-09-01');
      await h.record('DASH_10YD', '1.750', '2026-09-01');
      await h.record('AGILITY_505_YD_L', '2.550', '2026-09-08');
      await h.record('AGILITY_505_YD_R', '2.600', '2026-09-08');
      await h.record('DASH_10M', '1.900', '2026-09-08');
      expect(await h.rowsOf('AGILITY_COD_DEFICIT_M')).toHaveLength(0);
      expect(await h.rowsOf('AGILITY_COD_DEFICIT_YD')).toHaveLength(0);
    });
  }, TEST_TIMEOUT);

  it('calculator: both protocols on the same date compute independently, never pooled', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      for (const [metric, value] of [
        ['AGILITY_505_M_L', '2.850'],
        ['AGILITY_505_M_R', '2.800'],
        ['DASH_10M', '1.900'],
        ['AGILITY_505_YD_L', '2.550'],
        ['AGILITY_505_YD_R', '2.600'],
        ['DASH_10YD', '1.750'],
      ] as const) {
        await h.record(metric, value, '2026-09-01');
      }
      expect((await h.rowsOf('AGILITY_COD_DEFICIT_M')).map((r) => r.value)).toEqual(['0.900']);
      expect((await h.rowsOf('AGILITY_COD_DEFICIT_YD')).map((r) => r.value)).toEqual(['0.800']);
    });
  }, TEST_TIMEOUT);

  it('calculator: _M_L with _YD_R -> no LSI and no deficit', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      await h.record('AGILITY_505_YD_R', '2.600', '2026-09-01');
      await h.record('DASH_10M', '1.900', '2026-09-01');
      await h.record('DASH_10YD', '1.750', '2026-09-01');
      for (const code of ['AGILITY_505_M_LSI', 'AGILITY_505_YD_LSI', 'AGILITY_COD_DEFICIT_M', 'AGILITY_COD_DEFICIT_YD']) {
        expect(await h.rowsOf(code), code).toHaveLength(0);
      }
    });
  }, TEST_TIMEOUT);

  it('calculator: AGILITY_505_M_LSI comes from M legs only, AGILITY_505_YD_LSI from YD legs only', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      // same-date mixed set: M legs 2.50 / 2.60, YD legs 2.00 / 2.50
      const ml = await h.record('AGILITY_505_M_L', '2.500', '2026-09-01');
      const mr = await h.record('AGILITY_505_M_R', '2.600', '2026-09-01');
      const yl = await h.record('AGILITY_505_YD_L', '2.000', '2026-09-01');
      const yr = await h.record('AGILITY_505_YD_R', '2.500', '2026-09-01');

      const mLsi = await h.rowsOf('AGILITY_505_M_LSI');
      const yLsi = await h.rowsOf('AGILITY_505_YD_LSI');
      expect(mLsi).toHaveLength(1);
      expect(yLsi).toHaveLength(1);
      expect(Number(mLsi[0].value)).toBeCloseTo((2.5 / 2.6) * 100, 2);
      expect(Number(yLsi[0].value)).toBeCloseTo((2.0 / 2.5) * 100, 2);
      expect([...mLsi[0].calculated_from_measurement_ids].sort()).toEqual([ml.m.id, mr.m.id].sort());
      expect([...yLsi[0].calculated_from_measurement_ids].sort()).toEqual([yl.m.id, yr.m.id].sort());
    });
  }, TEST_TIMEOUT);

  it('calculator: editing a source value recalculates the deficit', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      const r = await h.record('AGILITY_505_M_R', '2.800', '2026-09-01');
      await h.record('DASH_10M', '1.900', '2026-09-01');
      expect((await h.rowsOf('AGILITY_COD_DEFICIT_M'))[0].value).toBe('0.900');

      // faster leg improves to 2.70
      await h.d
        .update(schema.measurements)
        .set({ value: '2.700' })
        .where(eq(schema.measurements.id, r.m.id));
      await h.calc.recalculateForAthlete(FX_USER, 'AGILITY_505_M_R', '2026-09-01');
      const rows = await h.rowsOf('AGILITY_COD_DEFICIT_M');
      expect(rows).toHaveLength(1);
      expect(rows[0].value).toBe('0.800');
    });
  }, TEST_TIMEOUT);

  it('calculator: deleting a source removes the derived row', async () => {
    await inTx(async (tx) => {
      await to0144(tx);
      await tx.unsafe(upSql);
      const h = await calcHarness(tx);
      await h.record('AGILITY_505_M_L', '2.850', '2026-09-01');
      await h.record('AGILITY_505_M_R', '2.800', '2026-09-01');
      const s = await h.record('DASH_10M', '1.900', '2026-09-01');
      expect(await h.rowsOf('AGILITY_COD_DEFICIT_M')).toHaveLength(1);

      await h.d.delete(schema.measurements).where(eq(schema.measurements.id, s.m.id));
      await h.calc.recalculateForAthlete(FX_USER, 'DASH_10M', '2026-09-01');
      expect(await h.rowsOf('AGILITY_COD_DEFICIT_M')).toHaveLength(0);
    });
  }, TEST_TIMEOUT);
});
