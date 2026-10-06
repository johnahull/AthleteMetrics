// @vitest-environment node
/**
 * Test suite for Migration 0144: 5-0-5 protocol split (metric / yard)
 *
 * Spec: AM-FEAT-016 Part 1. Plan: .omc/plans/am-feat-016-plan.md (section 2, Step 2).
 *
 * Layers:
 *   1. Static analysis of the up/down SQL files (no DB needed).
 *   2. Behavioral: the EXACT up/down files are executed with the `postgres`
 *      client (same client and multi-statement semantics as
 *      scripts/apply-manual-migrations.js) against the DB in DATABASE_URL,
 *      inside a transaction that is always rolled back. A pre-0144 fixture
 *      covering every child table of site_metrics is seeded first.
 *   3. Fresh-DB path: the migration applies cleanly with no 5-0-5 child data.
 *
 * DATABASE_URL unset  -> behavioral layers are skipped.
 * DATABASE_URL set but unreachable -> they FAIL (never a silent false green).
 *
 * NEVER point DATABASE_URL at a shared database for this file: the transactions
 * are rolled back, but it is still not a read-only test.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0144_split_505_by_protocol.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0144_split_505_by_protocol_down.sql');

const DATABASE_URL = process.env.DATABASE_URL;

const OLD_CODES = ['AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R', 'AGILITY_505_LSI'];
const M_OF: Record<string, string> = {
  AGILITY_505: 'AGILITY_505_M',
  AGILITY_505_L: 'AGILITY_505_M_L',
  AGILITY_505_R: 'AGILITY_505_M_R',
  AGILITY_505_LSI: 'AGILITY_505_M_LSI',
};
const YD_OF: Record<string, string> = {
  AGILITY_505: 'AGILITY_505_YD',
  AGILITY_505_L: 'AGILITY_505_YD_L',
  AGILITY_505_R: 'AGILITY_505_YD_R',
  AGILITY_505_LSI: 'AGILITY_505_YD_LSI',
};
const M_CODES = Object.values(M_OF);
const YD_CODES = Object.values(YD_OF);
const NEW_CODES = [...M_CODES, ...YD_CODES];

const LSI_SET_ID = 'set-screening-female-bilateral-asymmetry';
const YD_SUFFIX = ' (Yard, approx.)';
const YD_DESC_PREFIX =
  'Approximate: converted from metric-protocol research (x0.914); recalibrate with BTA data.';

function stripComments(s: string): string {
  return s
    .split('\n')
    .filter((l) => !l.trim().startsWith('--'))
    .join('\n');
}

// ============================================================================
// Layer 1 — static analysis
// ============================================================================
describe('Migration 0144: static SQL analysis', () => {
  it('up and down files exist', () => {
    expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
    expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
  });

  describe('up file', () => {
    let up: string;
    beforeAll(() => {
      up = stripComments(fs.readFileSync(UP_SQL_PATH, 'utf-8'));
    });

    it('does not manage its own transaction (the runner supplies it)', () => {
      expect(up).not.toMatch(/^\s*(BEGIN|COMMIT|ROLLBACK)\s*;/im);
    });

    it('never drops tables or truncates', () => {
      expect(up).not.toMatch(/DROP\s+TABLE/i);
      expect(up).not.toMatch(/TRUNCATE/i);
    });

    it('every INSERT is idempotent via ON CONFLICT', () => {
      const idx: number[] = [];
      const re = /INSERT\s+INTO/gi;
      let m: RegExpExecArray | null;
      while ((m = re.exec(up))) idx.push(m.index);
      expect(idx.length).toBeGreaterThanOrEqual(4);
      for (const i of idx) {
        // statement ends at a semicolon at end of line (the mandated description text contains an inline ';')
        const end = up.slice(i).search(/;[ \t]*\n/);
        const stmt = up.slice(i, i + end);
        expect(stmt).toMatch(/ON\s+CONFLICT/i);
      }
    });

    it('deletes the old site_metrics rows only AFTER every repoint UPDATE and the assertion block', () => {
      const deleteIdx = up.search(/DELETE\s+FROM\s+site_metrics/i);
      expect(deleteIdx).toBeGreaterThan(-1);
      // only one DELETE FROM site_metrics, never before a repoint
      expect(up.match(/DELETE\s+FROM\s+site_metrics/gi)).toHaveLength(1);

      const updateIdxs: number[] = [];
      const re = /^\s*UPDATE\s+\w+/gim;
      let m: RegExpExecArray | null;
      while ((m = re.exec(up))) updateIdxs.push(m.index);
      expect(updateIdxs.length).toBeGreaterThanOrEqual(10);
      expect(Math.max(...updateIdxs)).toBeLessThan(deleteIdx);

      const assertIdx = up.search(/RAISE\s+EXCEPTION/i);
      expect(assertIdx).toBeGreaterThan(Math.max(...updateIdxs));
      expect(assertIdx).toBeLessThan(deleteIdx);
    });

    it('inserts the new site_metrics rows BEFORE repointing children', () => {
      const firstInsert = up.search(/INSERT\s+INTO\s+site_metrics/i);
      const firstUpdate = up.search(/^\s*UPDATE\s+\w+/im);
      expect(firstInsert).toBeGreaterThan(-1);
      expect(firstInsert).toBeLessThan(firstUpdate);
    });

    it('repoints site_benchmarks in place (no DELETE of site_benchmarks)', () => {
      expect(up).toMatch(/UPDATE\s+site_benchmarks/i);
      expect(up).not.toMatch(/DELETE\s+FROM\s+site_benchmarks/i);
    });

    it('uses the 0.914 metric-to-yard factor and the approximate wording', () => {
      expect(up).toContain('0.914');
      expect(up).toContain(YD_DESC_PREFIX);
      expect(up).toContain(YD_SUFFIX);
    });

    it('declares all 8 new codes and the exact LSI formulas', () => {
      for (const c of NEW_CODES) expect(up).toContain(`'${c}'`);
      expect(up).toContain(
        '(min(AGILITY_505_M_L, AGILITY_505_M_R) / max(AGILITY_505_M_L, AGILITY_505_M_R)) * 100',
      );
      expect(up).toContain(
        '(min(AGILITY_505_YD_L, AGILITY_505_YD_R) / max(AGILITY_505_YD_L, AGILITY_505_YD_R)) * 100',
      );
      expect(up).toContain('"dateMatchStrategy":"same_date"');
      expect(up).toContain('"missingSourceBehavior":"skip"');
    });

    it('does not auto-enable new codes for organizations', () => {
      expect(up).not.toMatch(/INSERT\s+INTO\s+organization_metrics/i);
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

    it('has a guard that refuses to run when yard (_YD) measurements exist', () => {
      expect(down).toMatch(/RAISE\s+EXCEPTION/i);
      expect(down).toMatch(/FROM\s+measurements/i);
      expect(down).toMatch(/AGILITY_505_YD/);
    });

    it('deletes the new site_metrics rows only after repointing children back', () => {
      const deleteIdx = down.search(/DELETE\s+FROM\s+site_metrics/i);
      expect(deleteIdx).toBeGreaterThan(-1);
      const updateIdxs: number[] = [];
      const re = /^\s*UPDATE\s+\w+/gim;
      let m: RegExpExecArray | null;
      while ((m = re.exec(down))) updateIdxs.push(m.index);
      expect(updateIdxs.length).toBeGreaterThanOrEqual(10);
      expect(Math.max(...updateIdxs)).toBeLessThan(deleteIdx);
    });
  });
});

// ============================================================================
// Layers 2 + 3 — behavioral, against the real DB in a rolled-back transaction
// ============================================================================
class Rollback extends Error {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

const FX_ORG = 'fx505-org';
const FX_USER = 'fx505-user';
const FX_TG = '00000000-0505-4000-8000-000000000001';

const FIXTURE_SQL = `
INSERT INTO organizations (id, name) VALUES ('${FX_ORG}', 'FX 505 Org');
INSERT INTO users (id, username, first_name, last_name, full_name, password)
  VALUES ('${FX_USER}', 'fx505user', 'Fx', 'Five', 'Fx Five', 'not-a-real-hash');
INSERT INTO events (id, name, start_date) VALUES ('fx505-event', 'FX 505 Event', now());

-- organization enablement
INSERT INTO organization_metrics (id, organization_id, metric_code) VALUES
  ('fx505-om-1', '${FX_ORG}', 'AGILITY_505'),
  ('fx505-om-2', '${FX_ORG}', 'AGILITY_505_L'),
  ('fx505-om-3', '${FX_ORG}', 'AGILITY_505_R'),
  ('fx505-om-4', '${FX_ORG}', 'AGILITY_505_LSI');
INSERT INTO event_metrics (id, event_id, metric_code) VALUES
  ('fx505-em-1', 'fx505-event', 'AGILITY_505'),
  ('fx505-em-2', 'fx505-event', 'AGILITY_505_L');
INSERT INTO goals (id, user_id, metric, goal_type, target_value, baseline_value, current_value, target_date)
  VALUES ('fx505-goal', '${FX_USER}', 'AGILITY_505', 'target', 2.4, 2.6, 2.5, '2027-01-01');

-- reports (+ report_benchmarks) with old codes in the config JSON
INSERT INTO reports (id, organization_id, name, report_type, config) VALUES
  ('fx505-report', '${FX_ORG}', 'FX 505 Report', 'custom',
   '{"metrics":["AGILITY_505","AGILITY_505_L","VERTICAL_JUMP"],"compositeIndex":{"weights":{"AGILITY_505":0.5,"AGILITY_505_LSI":0.5}},"benchmarks":{"userDefined":[{"metricCode":"AGILITY_505_R","value":2.5}]}}'::jsonb);
INSERT INTO report_benchmarks (id, report_id, metric_code, name, benchmark_value)
  VALUES ('fx505-rb', 'fx505-report', 'AGILITY_505_L', 'FX report bench', 2.6);
INSERT INTO custom_benchmarks (id, organization_id, metric_code, name, benchmark_value)
  VALUES ('fx505-cb', '${FX_ORG}', 'AGILITY_505', 'FX custom bench', 2.6);
INSERT INTO peer_percentile_cache (id, metric_code, filter_criteria, sample_size, p50, expires_at)
  VALUES ('fx505-ppc', 'AGILITY_505_L', '{}'::jsonb, 30, 2.5, now() + interval '1 day');
INSERT INTO site_metric_explanations (id, metric_code, title)
  VALUES ('fx505-expl', 'AGILITY_505', 'FX 505 title')
  ON CONFLICT (metric_code) DO UPDATE SET title = EXCLUDED.title;

-- site benchmarks: flat rows, one very long name, a 2-tier group (+ per-leg copies like 0128 Block E)
INSERT INTO site_benchmarks (id, metric_code, name, description, comparison_operator, benchmark_value,
  gender, sport, level, is_system_default, is_active, display_order) VALUES
  ('fx505-flat1', 'AGILITY_505', 'FX flat 2.51', 'flat one', 'lte', 2.510, 'Female', 'SOCCER', 'D1', true, true, 901),
  ('fx505-flat2', 'AGILITY_505', 'FX flat 2.75', NULL, 'lte', 2.750, 'Female', 'SOCCER', 'HS', true, true, 902),
  ('fx505-flat3', 'AGILITY_505', 'FX flat 2.40', 'flat three', 'lte', 2.400, 'Female', 'SOCCER', 'D1', true, true, 903),
  ('fx505-long', 'AGILITY_505', '${'FX long name '}${'x'.repeat(82)}', 'long', 'lte', 2.900, 'Female', 'SOCCER', 'D1', true, true, 904);
INSERT INTO site_benchmarks (id, metric_code, name, description, comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color, gender, is_system_default, is_active, display_order) VALUES
  ('fx505-t1', 'AGILITY_505', 'FX 505 Tier One', 'tier one', 'range', 2.300, 2.499, '${FX_TG}'::uuid, 1, 'Elite', 'green', 'Female', true, true, 905),
  ('fx505-t2', 'AGILITY_505', 'FX 505 Tier Two', 'tier two', 'range', 2.500, 2.800, '${FX_TG}'::uuid, 2, 'Good', 'yellow', 'Female', true, true, 906);
INSERT INTO site_benchmarks (id, metric_code, name, description, comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color, gender, is_system_default, is_active, display_order)
SELECT src.id || '-l', 'AGILITY_505_L', src.name || ' (Left)', src.description, src.comparison_operator, src.min_value, src.max_value,
  md5(src.tier_group_id::text || '-l')::uuid, src.tier_order, src.tier_name, src.tier_color, src.gender,
  src.is_system_default, src.is_active, src.display_order
FROM site_benchmarks src WHERE src.id IN ('fx505-t1', 'fx505-t2');
INSERT INTO site_benchmarks (id, metric_code, name, description, comparison_operator, min_value, max_value,
  tier_group_id, tier_order, tier_name, tier_color, gender, is_system_default, is_active, display_order)
SELECT src.id || '-r', 'AGILITY_505_R', src.name || ' (Right)', src.description, src.comparison_operator, src.min_value, src.max_value,
  md5(src.tier_group_id::text || '-r')::uuid, src.tier_order, src.tier_name, src.tier_color, src.gender,
  src.is_system_default, src.is_active, src.display_order
FROM site_benchmarks src WHERE src.id IN ('fx505-t1', 'fx505-t2');

INSERT INTO benchmark_sets (id, name, is_template, is_active) VALUES ('fx505-set', 'FX 505 Set', true, true);
INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order) VALUES
  ('fx505-bsi-flat1', 'fx505-set', 'fx505-flat1', 'site', 1),
  ('fx505-bsi-t1', 'fx505-set', 'fx505-t1', 'site', 2),
  ('fx505-bsi-t2', 'fx505-set', 'fx505-t2', 'site', 3),
  ('fx505-bsi-t1-l', 'fx505-set', 'fx505-t1-l', 'site', 2),
  ('fx505-bsi-t2-l', 'fx505-set', 'fx505-t2-l', 'site', 3),
  ('fx505-bsi-t1-r', 'fx505-set', 'fx505-t1-r', 'site', 2),
  ('fx505-bsi-t2-r', 'fx505-set', 'fx505-t2-r', 'site', 3);
INSERT INTO organization_benchmarks (id, organization_id, benchmark_id, benchmark_type, display_order)
  VALUES ('fx505-ob-1', '${FX_ORG}', 'fx505-t1', 'site', 901);

-- measurements: 2 each of L / R / LSI (calculated), one plain, one control
INSERT INTO measurements (id, user_id, submitted_by, date, age, metric, value, units) VALUES
  ('fx505-m-l1', '${FX_USER}', '${FX_USER}', '2026-09-01', 16, 'AGILITY_505_L', 2.500, 's'),
  ('fx505-m-r1', '${FX_USER}', '${FX_USER}', '2026-09-01', 16, 'AGILITY_505_R', 2.600, 's'),
  ('fx505-m-l2', '${FX_USER}', '${FX_USER}', '2026-09-08', 16, 'AGILITY_505_L', 2.450, 's'),
  ('fx505-m-r2', '${FX_USER}', '${FX_USER}', '2026-09-08', 16, 'AGILITY_505_R', 2.480, 's'),
  ('fx505-m-plain', '${FX_USER}', '${FX_USER}', '2026-09-15', 16, 'AGILITY_505', 2.550, 's'),
  ('fx505-m-ctl', '${FX_USER}', '${FX_USER}', '2026-09-15', 16, 'VERTICAL_JUMP', 30.000, 'in');
INSERT INTO measurements (id, user_id, submitted_by, date, age, metric, value, units,
  is_calculated, calculated_from_measurement_ids, calculation_metadata) VALUES
  ('fx505-m-lsi1', '${FX_USER}', '${FX_USER}', '2026-09-01', 16, 'AGILITY_505_LSI', 96.154, '%',
   true, ARRAY['fx505-m-l1', 'fx505-m-r1'],
   '{"formula":"(min(AGILITY_505_L, AGILITY_505_R) / max(AGILITY_505_L, AGILITY_505_R)) * 100","sourceValues":{"agility_505_l":2.5,"agility_505_r":2.6}}'::jsonb),
  ('fx505-m-lsi2', '${FX_USER}', '${FX_USER}', '2026-09-08', 16, 'AGILITY_505_LSI', 98.790, '%',
   true, ARRAY['fx505-m-l2', 'fx505-m-r2'],
   '{"formula":"(min(AGILITY_505_L, AGILITY_505_R) / max(AGILITY_505_L, AGILITY_505_R)) * 100","sourceValues":{"agility_505_l":2.45,"agility_505_r":2.48}}'::jsonb);

-- organization-defined derived metrics that consume 5-0-5 codes (prefix trap: _L/_R vs plain)
INSERT INTO custom_org_metrics (id, organization_id, code, label, metric_type, is_derived, formula, dependent_metrics, calculation_config) VALUES
  ('fx505-com-1', '${FX_ORG}', 'FX_COD_A', 'FX A', 'lower_is_better', true,
   'AGILITY_505_L - AGILITY_505_R', ARRAY['AGILITY_505_L', 'AGILITY_505_R'],
   '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb),
  ('fx505-com-2', '${FX_ORG}', 'FX_COD_B', 'FX B', 'lower_is_better', true,
   'AGILITY_505 * 2', ARRAY['AGILITY_505'], NULL);
`;

// Only inserts what is missing; real rows (0022/0107/0128) are left alone.
const ENSURE_OLD_SITE_METRICS_SQL = `
INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order,
  description, decimal_precision, color, icon)
VALUES
  ('AGILITY_505', '5-0-5 Agility', 'agility', 's', 'lower_is_better', true, true, 3, 'old', 3, 'green', 'Zap'),
  ('AGILITY_505_L', '5-0-5 Agility (Left)', 'agility', 's', 'lower_is_better', true, true, 24, 'old', 3, 'green', 'Zap'),
  ('AGILITY_505_R', '5-0-5 Agility (Right)', 'agility', 's', 'lower_is_better', true, true, 25, 'old', 3, 'green', 'Zap')
ON CONFLICT (code) DO NOTHING;
INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order,
  description, decimal_precision, color, icon, validation_min, validation_max, is_derived, formula, dependent_metrics, calculation_config)
VALUES ('AGILITY_505_LSI', '5-0-5 Limb Symmetry Index', 'agility', '%', 'higher_is_better', true, true, 40, 'old', 1, 'green', 'Activity', 0, 100, true,
  '(min(AGILITY_505_L, AGILITY_505_R) / max(AGILITY_505_L, AGILITY_505_R)) * 100',
  ARRAY['AGILITY_505_L', 'AGILITY_505_R'],
  '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb)
ON CONFLICT (code) DO NOTHING;
`;

const OLD_REF_RE = '\\mAGILITY_505(_L|_R|_LSI)?\\M';

describe.skipIf(!DATABASE_URL)('Migration 0144: behavioral (real DB, rolled back)', () => {
  let sql: postgres.Sql;
  let upSql: string;
  let downSql: string;

  beforeAll(async () => {
    // Missing files must fail loudly here (RED), not skip.
    upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
    downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
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

  /** Bring the transaction to the pre-0144 state (undo 0144 first if the DB already has it). */
  async function toPreState(tx: Tx) {
    const [{ n }] = await tx`select count(*)::int as n from site_metrics where code = 'AGILITY_505_M'`;
    if (n > 0) await tx.unsafe(downSql);
    await tx.unsafe(ENSURE_OLD_SITE_METRICS_SQL);
  }

  async function seedFixture(tx: Tx) {
    await tx.unsafe(FIXTURE_SQL);
  }

  async function jsonRows(tx: Tx, query: string): Promise<Record<string, unknown>[]> {
    const rows = await tx.unsafe(`select to_jsonb(t) - 'created_at' - 'updated_at' as r from (${query}) t`);
    return rows.map((x: { r: Record<string, unknown> }) => x.r);
  }

  /** Canonical, code-agnostic picture of everything 0144 touches. */
  async function snapshot(tx: Tx) {
    const prefix = `metric_code ~ '^AGILITY_505'`;
    const benchIds = `select id from site_benchmarks where ${prefix}`;
    return {
      site_metrics: (
        await tx.unsafe(
          `select to_jsonb(t) - 'id' - 'created_at' - 'updated_at' as r from site_metrics t where code ~ '^AGILITY_505' order by code`,
        )
      ).map((x: { r: unknown }) => x.r),
      site_benchmarks: await jsonRows(tx, `select * from site_benchmarks where ${prefix} order by id`),
      benchmark_set_items: await jsonRows(
        tx,
        `select * from benchmark_set_items where benchmark_id in (${benchIds}) order by id`,
      ),
      organization_benchmarks: await jsonRows(
        tx,
        `select * from organization_benchmarks where benchmark_id in (${benchIds}) order by id`,
      ),
      organization_metrics: await jsonRows(tx, `select * from organization_metrics where id like 'fx505%' order by id`),
      event_metrics: await jsonRows(tx, `select * from event_metrics where id like 'fx505%' order by id`),
      goals: await jsonRows(tx, `select * from goals where id like 'fx505%' order by id`),
      report_benchmarks: await jsonRows(tx, `select * from report_benchmarks where id like 'fx505%' order by id`),
      custom_benchmarks: await jsonRows(tx, `select * from custom_benchmarks where id like 'fx505%' order by id`),
      peer_percentile_cache: await jsonRows(tx, `select * from peer_percentile_cache where id like 'fx505%' order by id`),
      site_metric_explanations: await jsonRows(
        tx,
        `select * from site_metric_explanations where metric_code ~ '^AGILITY_505' order by id`,
      ),
      measurements: await jsonRows(tx, `select * from measurements where id like 'fx505%' order by id`),
      reports: await jsonRows(tx, `select * from reports where id like 'fx505%' order by id`),
      custom_org_metrics: await jsonRows(tx, `select * from custom_org_metrics where id like 'fx505%' order by id`),
    };
  }

  async function oldReferenceCount(tx: Tx): Promise<number> {
    const list = OLD_CODES.map((c) => `'${c}'`).join(',');
    const [{ n }] = await tx.unsafe(`
      select (
        (select count(*) from organization_metrics where metric_code in (${list}))
      + (select count(*) from event_metrics where metric_code in (${list}))
      + (select count(*) from goals where metric in (${list}))
      + (select count(*) from report_benchmarks where metric_code in (${list}))
      + (select count(*) from custom_benchmarks where metric_code in (${list}))
      + (select count(*) from peer_percentile_cache where metric_code in (${list}))
      + (select count(*) from site_benchmarks where metric_code in (${list}))
      + (select count(*) from site_metric_explanations where metric_code in (${list}))
      + (select count(*) from site_metrics where code in (${list}))
      + (select count(*) from measurements where metric in (${list}) or calculation_metadata::text ~* '${OLD_REF_RE}')
      + (select count(*) from reports where config::text ~* '${OLD_REF_RE}')
      + (select count(*) from custom_org_metrics where coalesce(formula,'') ~* '${OLD_REF_RE}'
            or coalesce(array_to_string(dependent_metrics, ','),'') ~* '${OLD_REF_RE}'
            or coalesce(calculation_config::text,'') ~* '${OLD_REF_RE}')
      + (select count(*) from site_metrics where coalesce(formula,'') ~* '${OLD_REF_RE}'
            or coalesce(array_to_string(dependent_metrics, ','),'') ~* '${OLD_REF_RE}')
      )::int as n`);
    return n;
  }

  const TEST_TIMEOUT = 60000;

  // --------------------------------------------------------------------------
  it('creates the 8 new site_metrics rows and removes the 4 old ones', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      await tx.unsafe(upSql);

      const rows = await tx`select code from site_metrics where code ~ '^AGILITY_505' order by code`;
      expect(rows.map((r: { code: string }) => r.code).sort()).toEqual([...NEW_CODES].sort());
      expect(await oldReferenceCount(tx)).toBe(0);
    });
  }, TEST_TIMEOUT);

  it('defines LSI formulas, dependents and calculation config per protocol', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      await tx.unsafe(upSql);

      const rows = await tx`select code, formula, dependent_metrics, calculation_config, is_derived, unit, metric_type
                              from site_metrics where code in ('AGILITY_505_M_LSI', 'AGILITY_505_YD_LSI')`;
      const by = Object.fromEntries(rows.map((r: { code: string }) => [r.code, r]));
      expect(by.AGILITY_505_M_LSI.formula).toBe(
        '(min(AGILITY_505_M_L, AGILITY_505_M_R) / max(AGILITY_505_M_L, AGILITY_505_M_R)) * 100',
      );
      expect(by.AGILITY_505_M_LSI.dependent_metrics).toEqual(['AGILITY_505_M_L', 'AGILITY_505_M_R']);
      expect(by.AGILITY_505_YD_LSI.formula).toBe(
        '(min(AGILITY_505_YD_L, AGILITY_505_YD_R) / max(AGILITY_505_YD_L, AGILITY_505_YD_R)) * 100',
      );
      expect(by.AGILITY_505_YD_LSI.dependent_metrics).toEqual(['AGILITY_505_YD_L', 'AGILITY_505_YD_R']);
      for (const code of ['AGILITY_505_M_LSI', 'AGILITY_505_YD_LSI']) {
        expect(by[code].calculation_config).toEqual({
          dateMatchStrategy: 'same_date',
          missingSourceBehavior: 'skip',
        });
        expect(by[code].is_derived).toBe(true);
        expect(by[code].unit).toBe('%');
        expect(by[code].metric_type).toBe('higher_is_better');
      }
      const base = await tx`select code, is_derived, unit, formula, dependent_metrics from site_metrics
                             where code ~ '^AGILITY_505_(M|YD)(_L|_R)?$'`;
      expect(base).toHaveLength(6);
      for (const r of base) {
        expect(r.unit).toBe('s');
        expect(r.is_derived).toBe(false);
        expect(r.formula).toBeNull();
      }
    });
  }, TEST_TIMEOUT);

  it('uses unit-in-parentheses labels and states the protocol in every description', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      await tx.unsafe(upSql);

      const rows = await tx`select code, label, description from site_metrics where code ~ '^AGILITY_505'`;
      const by = Object.fromEntries(rows.map((r: { code: string }) => [r.code, r]));
      const labels: Record<string, string> = {
        AGILITY_505_M: '5-0-5 Agility (m)',
        AGILITY_505_M_L: '5-0-5 Agility (m, Left)',
        AGILITY_505_M_R: '5-0-5 Agility (m, Right)',
        AGILITY_505_M_LSI: '5-0-5 Limb Symmetry Index (m)',
        AGILITY_505_YD: '5-0-5 Agility (yd)',
        AGILITY_505_YD_L: '5-0-5 Agility (yd, Left)',
        AGILITY_505_YD_R: '5-0-5 Agility (yd, Right)',
        AGILITY_505_YD_LSI: '5-0-5 Limb Symmetry Index (yd)',
      };
      for (const [code, label] of Object.entries(labels)) {
        expect(by[code].label).toBe(label);
        expect(by[code].label.length).toBeLessThanOrEqual(100);
      }
      for (const code of M_CODES) {
        expect(by[code].description).toMatch(/metric protocol/i);
        expect(by[code].description).toContain('10 m approach');
        expect(by[code].description).toContain('5 m to the turn line');
        expect(by[code].description).toContain('final 10 m round trip');
        expect(by[code].description).not.toMatch(/\byd\b|yard/i);
      }
      for (const code of YD_CODES) {
        expect(by[code].description).toMatch(/yard protocol/i);
        expect(by[code].description).toContain('10 yd approach');
        expect(by[code].description).toContain('5 yd to the turn line');
        expect(by[code].description).toContain('final 10 yd round trip');
      }
      expect(by.AGILITY_505_M_L.description).toMatch(/left/i);
      expect(by.AGILITY_505_YD_R.description).toMatch(/right/i);
    });
  }, TEST_TIMEOUT);

  it('copies display_order, color, icon from the old rows and gives YD rows matching presentation', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      const old = await tx`select code, display_order, color, icon, decimal_precision, short_description, why_it_matters
                             from site_metrics where code in ('AGILITY_505','AGILITY_505_L','AGILITY_505_R','AGILITY_505_LSI')`;
      await tx.unsafe(upSql);
      const now = await tx`select code, display_order, color, icon, decimal_precision, short_description, why_it_matters
                             from site_metrics where code ~ '^AGILITY_505'`;
      const by = Object.fromEntries(now.map((r: { code: string }) => [r.code, r]));
      for (const o of old) {
        for (const map of [M_OF, YD_OF]) {
          const n = by[map[o.code]];
          expect(n.display_order).toBe(o.display_order);
          expect(n.color).toBe(o.color);
          expect(n.icon).toBe(o.icon);
          expect(n.decimal_precision).toBe(o.decimal_precision);
        }
        // explanation columns are carried over to the metric row
        expect(by[M_OF[o.code]].short_description).toBe(o.short_description);
        expect(by[M_OF[o.code]].why_it_matters).toBe(o.why_it_matters);
      }
    });
  }, TEST_TIMEOUT);

  it('keeps all 7 5-0-5 measurements byte-identical except metric (and LSI metadata)', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      const strip = `to_jsonb(m) - 'metric' - 'calculation_metadata'`;
      const before = await tx.unsafe(`select id, metric, ${strip} as rest, calculation_metadata from measurements m where id like 'fx505%' order by id`);
      expect(before).toHaveLength(8);
      await tx.unsafe(upSql);
      const after = await tx.unsafe(`select id, metric, ${strip} as rest, calculation_metadata from measurements m where id like 'fx505%' order by id`);
      expect(after).toHaveLength(8);

      for (let i = 0; i < before.length; i++) {
        expect(after[i].id).toBe(before[i].id);
        expect(after[i].rest).toEqual(before[i].rest);
        expect(after[i].metric).toBe(M_OF[before[i].metric] ?? before[i].metric);
      }
      const lsi = after.filter((r: { metric: string }) => r.metric === 'AGILITY_505_M_LSI');
      expect(lsi).toHaveLength(2);
      expect(lsi[0].calculation_metadata).toEqual({
        formula: '(min(AGILITY_505_M_L, AGILITY_505_M_R) / max(AGILITY_505_M_L, AGILITY_505_M_R)) * 100',
        sourceValues: { agility_505_m_l: 2.5, agility_505_m_r: 2.6 },
      });
      expect(lsi[1].calculation_metadata.sourceValues).toEqual({ agility_505_m_l: 2.45, agility_505_m_r: 2.48 });
      const ctl = after.find((r: { id: string }) => r.id === 'fx505-m-ctl');
      expect(ctl.metric).toBe('VERTICAL_JUMP');
      // nothing was written under a yard code
      const [{ n }] = await tx`select count(*)::int as n from measurements where metric ~ '^AGILITY_505_YD'`;
      expect(n).toBe(0);
    });
  }, TEST_TIMEOUT);

  it('keeps benchmark ids, values and set/org membership untouched (repoint in place)', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      const before = await snapshot(tx);
      const preBench = before.site_benchmarks as Record<string, unknown>[];
      expect(preBench.length).toBeGreaterThanOrEqual(10);
      // per-leg tiered copies were seeded
      expect(preBench.filter((b) => b.metric_code === 'AGILITY_505_L').length).toBe(2);
      expect(preBench.filter((b) => b.metric_code === 'AGILITY_505_R').length).toBe(2);

      await tx.unsafe(upSql);
      const after = await snapshot(tx);

      const afterById = new Map((after.site_benchmarks as Record<string, unknown>[]).map((b) => [b.id as string, b]));
      for (const b of preBench) {
        const a = afterById.get(b.id as string);
        expect(a, `benchmark ${b.id} survived`).toBeDefined();
        expect(a).toEqual({ ...b, metric_code: M_OF[b.metric_code as string] });
      }
      // benchmark_set_items / organization_benchmarks rows that existed before are identical
      const itemsAfter = new Map((after.benchmark_set_items as Record<string, unknown>[]).map((i) => [i.id as string, i]));
      for (const i of before.benchmark_set_items as Record<string, unknown>[]) {
        expect(itemsAfter.get(i.id as string)).toEqual(i);
      }
      const obAfter = new Map((after.organization_benchmarks as Record<string, unknown>[]).map((i) => [i.id as string, i]));
      for (const o of before.organization_benchmarks as Record<string, unknown>[]) {
        expect(obAfter.get(o.id as string)).toEqual(o);
      }
      expect((before.organization_benchmarks as unknown[]).length).toBeGreaterThanOrEqual(1);
    });
  }, TEST_TIMEOUT);

  it('repoints every child table and leaves zero references to the old codes', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      expect(await oldReferenceCount(tx)).toBeGreaterThan(10);
      await tx.unsafe(upSql);
      expect(await oldReferenceCount(tx)).toBe(0);

      const q = async (s: string) => (await tx.unsafe(s)) as Record<string, unknown>[];
      expect((await q(`select metric_code from organization_metrics where id like 'fx505%' order by id`)).map((r) => r.metric_code)).toEqual(
        ['AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI'],
      );
      expect((await q(`select metric_code from event_metrics where id like 'fx505%' order by id`)).map((r) => r.metric_code)).toEqual(
        ['AGILITY_505_M', 'AGILITY_505_M_L'],
      );
      expect((await q(`select metric from goals where id = 'fx505-goal'`))[0].metric).toBe('AGILITY_505_M');
      expect((await q(`select metric_code from report_benchmarks where id = 'fx505-rb'`))[0].metric_code).toBe('AGILITY_505_M_L');
      expect((await q(`select metric_code from custom_benchmarks where id = 'fx505-cb'`))[0].metric_code).toBe('AGILITY_505_M');
      expect((await q(`select metric_code from peer_percentile_cache where id = 'fx505-ppc'`))[0].metric_code).toBe('AGILITY_505_M_L');
      expect((await q(`select metric_code from site_metric_explanations where id = 'fx505-expl' or title = 'FX 505 title'`))[0].metric_code).toBe(
        'AGILITY_505_M',
      );
      expect((await q(`select config from reports where id = 'fx505-report'`))[0].config).toEqual({
        metrics: ['AGILITY_505_M', 'AGILITY_505_M_L', 'VERTICAL_JUMP'],
        compositeIndex: { weights: { AGILITY_505_M: 0.5, AGILITY_505_M_LSI: 0.5 } },
        benchmarks: { userDefined: [{ metricCode: 'AGILITY_505_M_R', value: 2.5 }] },
      });
      const com = await q(`select id, formula, dependent_metrics from custom_org_metrics where id like 'fx505%' order by id`);
      expect(com[0].formula).toBe('AGILITY_505_M_L - AGILITY_505_M_R');
      expect(com[0].dependent_metrics).toEqual(['AGILITY_505_M_L', 'AGILITY_505_M_R']);
      expect(com[1].formula).toBe('AGILITY_505_M * 2');
      expect(com[1].dependent_metrics).toEqual(['AGILITY_505_M']);
    });
  }, TEST_TIMEOUT);

  it('does not auto-enable any new code for organizations', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      const [{ before }] = await tx`select count(*)::int as before from organization_metrics`;
      await tx.unsafe(upSql);
      const [{ after }] = await tx`select count(*)::int as after from organization_metrics`;
      expect(after).toBe(before);
      const [{ yd }] = await tx`select count(*)::int as yd from organization_metrics where metric_code ~ '^AGILITY_505_YD'`;
      expect(yd).toBe(0);
    });
  }, TEST_TIMEOUT);

  it('seeds approximate yard benchmarks: x0.914, deterministic ids, mirrored set items, _M rows unchanged', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      const before = await snapshot(tx);
      const sources = (before.site_benchmarks as Record<string, any>[]).filter((b) =>
        ['AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R'].includes(b.metric_code),
      );
      await tx.unsafe(upSql);
      const after = await snapshot(tx);
      const byId = new Map((after.site_benchmarks as Record<string, any>[]).map((b) => [b.id as string, b]));

      // literal spot checks (numeric half-up): 2.51 -> 2.294, 2.40 -> 2.194, 2.75 -> 2.514
      expect(byId.get('fx505-flat1-yd')?.benchmark_value).toBe(2.294);
      expect(byId.get('fx505-flat3-yd')?.benchmark_value).toBe(2.194);
      expect(byId.get('fx505-flat2-yd')?.benchmark_value).toBe(2.514);
      expect(byId.get('fx505-t1-yd')?.min_value).toBe(2.102);
      expect(byId.get('fx505-t1-yd')?.max_value).toBe(2.284);
      expect(byId.get('fx505-t2-yd')?.min_value).toBe(2.285);
      expect(byId.get('fx505-t2-yd')?.max_value).toBe(2.559);

      // every non-LSI _M source has exactly one yard twin, everything else copied
      const ydCountAfter = (after.site_benchmarks as Record<string, any>[]).filter((b) =>
        ['AGILITY_505_YD', 'AGILITY_505_YD_L', 'AGILITY_505_YD_R'].includes(b.metric_code),
      ).length;
      expect(ydCountAfter).toBe(sources.length);
      for (const s of sources) {
        const y = byId.get(`${s.id}-yd`);
        expect(y, `yard twin of ${s.id}`).toBeDefined();
        expect(y!.metric_code).toBe(YD_OF[s.metric_code]);
        expect(y!.name).toBe(`${s.name}${YD_SUFFIX}`.length <= 100 ? `${s.name}${YD_SUFFIX}` : y!.name);
        expect((y!.name as string).endsWith(YD_SUFFIX)).toBe(true);
        expect((y!.name as string).length).toBeLessThanOrEqual(100);
        expect(y!.description as string).toContain('Approximate');
        expect((y!.description as string).startsWith(YD_DESC_PREFIX)).toBe(true);
        for (const col of ['comparison_operator', 'tier_order', 'tier_name', 'tier_color', 'gender', 'sport', 'level', 'display_order', 'is_active', 'benchmark_source']) {
          expect(y![col], `${s.id}.${col}`).toEqual(s[col]);
        }
        expect(y!.benchmark_value === null).toBe(s.benchmark_value === null);
        expect(y!.min_value === null).toBe(s.min_value === null);
      }
      // exact conversion check in SQL (numeric arithmetic, no float drift)
      const [{ bad }] = await tx`
        select count(*)::int as bad
          from site_benchmarks y join site_benchmarks s on y.id = s.id || '-yd'
         where s.metric_code in ('AGILITY_505_M','AGILITY_505_M_L','AGILITY_505_M_R')
           and (y.benchmark_value is distinct from round(s.benchmark_value * 0.914, 3)
             or y.min_value is distinct from round(s.min_value * 0.914, 3)
             or y.max_value is distinct from round(s.max_value * 0.914, 3))`;
      expect(bad).toBe(0);

      // tier groups: deterministic md5 ids, per-leg tiers present, no overlap after rounding
      const [{ tgOk }] = await tx`
        select (count(*) = 6)::boolean as "tgOk" from site_benchmarks y join site_benchmarks s on y.id = s.id || '-yd'
         where s.tier_group_id is not null and s.id like 'fx505-t%'
           and y.tier_group_id = md5(s.tier_group_id::text || '-yd')::uuid`;
      expect(tgOk).toBe(true);
      for (const suffix of ['', '-l', '-r']) {
        const t1 = byId.get(`fx505-t1${suffix}-yd`)!;
        const t2 = byId.get(`fx505-t2${suffix}-yd`)!;
        expect(t1.max_value as number).toBeLessThan(t2.min_value as number);
        expect(t1.min_value as number).toBeLessThan(t1.max_value as number);
      }

      // _M originals were not altered (checked field-by-field in the preserve test; spot check values)
      for (const s of sources) {
        const m = byId.get(s.id as string)!;
        expect(m.benchmark_value).toEqual(s.benchmark_value);
        expect(m.min_value).toEqual(s.min_value);
        expect(m.max_value).toEqual(s.max_value);
        expect(m.name).toBe(s.name);
      }

      // long name stays within varchar(100) and keeps the suffix
      const long = byId.get('fx505-long-yd')!;
      expect((long.name as string).length).toBe(100);
      expect((long.name as string).endsWith(YD_SUFFIX)).toBe(true);

      // set items mirrored with <bsi>-yd ids in the same set, same order
      const items = new Map((after.benchmark_set_items as Record<string, any>[]).map((i) => [i.id as string, i]));
      const ydItems = (after.benchmark_set_items as Record<string, any>[]).filter(
        (i) => (i.set_id as string) === 'fx505-set' && (i.id as string).endsWith('-yd'),
      );
      expect(ydItems).toHaveLength(7);
      for (const src of (before.benchmark_set_items as Record<string, any>[]).filter((i) => i.set_id === 'fx505-set')) {
        const y = items.get(`${src.id}-yd`)!;
        expect(y, `yard set item of ${src.id}`).toBeDefined();
        expect(y.benchmark_id).toBe(`${src.benchmark_id}-yd`);
        expect(y.display_order).toBe(src.display_order);
        expect(y.benchmark_type).toBe('site');
      }
      // real data: every set item on a converted benchmark has a yard twin
      const [{ missing }] = await tx`
        select count(*)::int as missing
          from benchmark_set_items bsi join site_benchmarks sb on sb.id = bsi.benchmark_id
         where sb.metric_code in ('AGILITY_505_M','AGILITY_505_M_L','AGILITY_505_M_R','AGILITY_505_M_LSI')
           and not exists (select 1 from benchmark_set_items y where y.id = bsi.id || '-yd' and y.set_id = bsi.set_id)`;
      expect(missing).toBe(0);
      // organization_benchmarks are not mirrored
      const [{ obYd }] = await tx`select count(*)::int as "obYd" from organization_benchmarks where benchmark_id like '%-yd'`;
      expect(obYd).toBe(0);
    });
  }, TEST_TIMEOUT);

  it('seeds YD LSI tiers with identical thresholds, new ids and set items in the screening set', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      const lsiBefore = (await tx`select * from site_benchmarks where metric_code = 'AGILITY_505_LSI' order by id`) as Record<string, any>[];
      expect(lsiBefore.length).toBeGreaterThanOrEqual(3);
      await tx.unsafe(upSql);

      const m = (await tx`select * from site_benchmarks where metric_code = 'AGILITY_505_M_LSI' order by id`) as Record<string, any>[];
      const yd = (await tx`select * from site_benchmarks where metric_code = 'AGILITY_505_YD_LSI' order by id`) as Record<string, any>[];
      expect(m.map((r) => r.id)).toEqual(lsiBefore.map((r) => r.id));
      expect(yd).toHaveLength(m.length);
      for (const src of m) {
        const y = yd.find((r) => r.id === `${src.id}-yd`)!;
        expect(y, `yard LSI twin of ${src.id}`).toBeDefined();
        expect(y.min_value).toBe(src.min_value);
        expect(y.max_value).toBe(src.max_value);
        expect(y.benchmark_value).toBe(src.benchmark_value);
        expect(y.comparison_operator).toBe(src.comparison_operator);
        expect(y.tier_order).toBe(src.tier_order);
        expect(y.tier_name).toBe(src.tier_name);
        expect(y.tier_group_id).not.toBe(src.tier_group_id);
        expect(y.name).toBe(src.name);
      }
      const items = (await tx`select * from benchmark_set_items where benchmark_id in (select id from site_benchmarks where metric_code = 'AGILITY_505_YD_LSI')`) as Record<string, any>[];
      expect(items).toHaveLength(yd.length);
      for (const i of items) expect(i.set_id).toBe(LSI_SET_ID);
      // the metric LSI tiers keep their original set membership
      const mItems = (await tx`select id from benchmark_set_items where benchmark_id in (select id from site_benchmarks where metric_code = 'AGILITY_505_M_LSI') and set_id = ${LSI_SET_ID}`) as unknown[];
      expect(mItems).toHaveLength(m.length);
    });
  }, TEST_TIMEOUT);

  it('is idempotent: a second run changes nothing and never produces _M_M codes', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      await tx.unsafe(upSql);
      const once = await snapshot(tx);
      await tx.unsafe(upSql);
      const twice = await snapshot(tx);
      expect(twice).toEqual(once);
      expect(JSON.stringify(twice)).not.toMatch(/_M_M|_YD_YD|_M_YD|_YD_M/);
      expect(await oldReferenceCount(tx)).toBe(0);
    });
  }, TEST_TIMEOUT);

  it('down restores the exact pre-up state (codes, formulas, descriptions, benchmarks)', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      const pre = await snapshot(tx);
      await tx.unsafe(upSql);
      await tx.unsafe(downSql);
      const post = await snapshot(tx);
      expect(post).toEqual(pre);
      // down is idempotent too
      await tx.unsafe(downSql);
      expect(await snapshot(tx)).toEqual(pre);
      const rows = await tx`select code from site_metrics where code ~ '^AGILITY_505_(M|YD)'`;
      expect(rows).toHaveLength(0);
      const [{ n }] = await tx`select count(*)::int as n from site_benchmarks where metric_code ~ '^AGILITY_505_(M|YD)' or id like '%-yd'`;
      expect(n).toBe(0);
    });
  }, TEST_TIMEOUT);

  it('down RAISES (and changes nothing) when a yard measurement exists', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      await seedFixture(tx);
      await tx.unsafe(upSql);
      await tx`insert into measurements (id, user_id, submitted_by, date, age, metric, value, units)
               values ('fx505-yd-m', ${FX_USER}, ${FX_USER}, '2026-10-01', 16, 'AGILITY_505_YD_L', 2.300, 's')`;
      await expect(
        tx.savepoint(async (sp: Tx) => {
          await sp.unsafe(downSql);
        }),
      ).rejects.toThrow(/YD|yard/i);
      // the up state is intact and the yard measurement survived
      const rows = await tx`select code from site_metrics where code ~ '^AGILITY_505' order by code`;
      expect(rows.map((r: { code: string }) => r.code).sort()).toEqual([...NEW_CODES].sort());
      const [{ n }] = await tx`select count(*)::int as n from measurements where id = 'fx505-yd-m'`;
      expect(n).toBe(1);
    });
  }, TEST_TIMEOUT);

  // --------------------------------------------------------------------------
  // Layer 3 — fresh DB (no 5-0-5 child data)
  // --------------------------------------------------------------------------
  it('fresh-DB path: applies cleanly with no 5-0-5 child data and creates all 8 metrics', async () => {
    await inTx(async (tx) => {
      await toPreState(tx);
      // no fixture; remove any 5-0-5 children the baseline might carry so the path is truly "fresh"
      await tx`delete from organization_metrics where metric_code in ('AGILITY_505','AGILITY_505_L','AGILITY_505_R','AGILITY_505_LSI')`;
      await tx`delete from measurements where metric in ('AGILITY_505','AGILITY_505_L','AGILITY_505_R','AGILITY_505_LSI')`;
      await tx.unsafe(upSql);
      const rows = await tx`select code from site_metrics where code ~ '^AGILITY_505' order by code`;
      expect(rows.map((r: { code: string }) => r.code).sort()).toEqual([...NEW_CODES].sort());
      expect(await oldReferenceCount(tx)).toBe(0);
      // and it is a no-op the second time
      const once = await snapshot(tx);
      await tx.unsafe(upSql);
      expect(await snapshot(tx)).toEqual(once);
    });
  }, TEST_TIMEOUT);
});
