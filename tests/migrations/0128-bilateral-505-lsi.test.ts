/**
 * Test suite for Migration 0128: Bilateral 5-0-5 + LSI Screening
 *
 * Three layers of validation:
 *   1. Static SQL file analysis  — runs unconditionally, no DB needed
 *   2. Formula evaluation        — verifies LSI formula via evaluateFormula()
 *   3. DB state inspection       — self-contained: runs inside a rolled-back
 *      transaction on the canonical pre-0144 fixture (helpers/pre0144-fixture.ts),
 *      once as-is (pre-0144) and once with the exact 0144 up file applied. It never
 *      depends on ambient DB contents and FAILS (never silently returns) when a
 *      row is missing. Skipped only when DATABASE_URL is unset.
 */
import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import postgres from 'postgres';
import { ensurePre0144State, benchmarkMinMaxScale } from './helpers/pre0144-fixture';
import { evaluateFormula, validateFormula } from '../../packages/api/services/formula-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0128_add_bilateral_505_lsi_metrics.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0128_add_bilateral_505_lsi_metrics_down.sql');
const UP_0144_PATH = path.join(projectRoot, 'migrations', '0144_split_505_by_protocol.sql');
const DOWN_0144_PATH = path.join(projectRoot, 'migrations', '0144_split_505_by_protocol_down.sql');
const DATABASE_URL = process.env.DATABASE_URL;
const SCREENING_SET_ID = 'set-screening-female-bilateral-asymmetry';

const LSI_FORMULA = '(min(AGILITY_505_L, AGILITY_505_R) / max(AGILITY_505_L, AGILITY_505_R)) * 100';
// After migration 0144 the LSI metric lives under the metric-protocol code (AM-FEAT-016).
const LSI_FORMULA_M = '(min(AGILITY_505_M_L, AGILITY_505_M_R) / max(AGILITY_505_M_L, AGILITY_505_M_R)) * 100';
const LSI_TIER_GROUP_UUID = 'a505a505-0128-4505-9151-aaaaaaaaaaaa';

describe('Migration 0128: Bilateral 5-0-5 + LSI Screening', () => {
  // ==========================================================================
  // Layer 1 — Static SQL file analysis
  // ==========================================================================
  describe('Up-migration SQL file', () => {
    let upSql: string;

    it('exists at expected path', () => {
      expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql.length).toBeGreaterThan(0);
    });

    it('declares the AGILITY_505_LSI derived metric (Block A)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).toMatch(/INSERT INTO site_metrics/);
      expect(upSql).toContain("'AGILITY_505_LSI'");
      expect(upSql).toContain("'higher_is_better'");
      expect(upSql).toContain("'%'");
      expect(upSql).toContain(LSI_FORMULA);
      expect(upSql).toContain("ARRAY['AGILITY_505_L', 'AGILITY_505_R']");
      expect(upSql).toContain('"dateMatchStrategy":"same_date"');
    });

    it('creates the screening benchmark set with deterministic ID (Block B)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).toMatch(/INSERT INTO benchmark_sets/);
      expect(upSql).toContain("'set-screening-female-bilateral-asymmetry'");
      expect(upSql).toContain("'Female'");
    });

    it('seeds three LSI tier rows sharing a fixed UUID tier_group_id (Block C)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).toContain("'bench-screening-asym-lsi-normal'");
      expect(upSql).toContain("'bench-screening-asym-lsi-monitor'");
      expect(upSql).toContain("'bench-screening-asym-lsi-elevated'");
      // tier_group_id must be a real UUID (the column is uuid-typed in the DB)
      expect(upSql).toContain(LSI_TIER_GROUP_UUID);
      // All three tier rows share the same tier_group_id
      const tgMatches = upSql.match(new RegExp(LSI_TIER_GROUP_UUID, 'g')) || [];
      expect(tgMatches.length).toBeGreaterThanOrEqual(3);
      // Tier ranges per spec — bounds must be non-overlapping given inclusive evaluation
      expect(upSql).toMatch(/'range', 95, 100/);         // Normal:        95 ≤ LSI ≤ 100
      expect(upSql).toMatch(/'range', 90, 94\.999/);     // Monitor:       90 ≤ LSI ≤ 94.999
      expect(upSql).toMatch(/'range', 0, 89\.999/);      // Elevated Risk:  0 ≤ LSI ≤ 89.999
    });

    it('wires LSI tiers into the screening set (Block D)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).toContain("'bsi-screening-asym-lsi-normal'");
      expect(upSql).toContain("'bsi-screening-asym-lsi-monitor'");
      expect(upSql).toContain("'bsi-screening-asym-lsi-elevated'");
    });

    it('projects per-leg tier copies via INSERT … SELECT (Block E)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      // Two parallel inserts: one for _L, one for _R
      const lSelectMatches = upSql.match(/SELECT\s+src\.id \|\| '-l'/g) || [];
      const rSelectMatches = upSql.match(/SELECT\s+src\.id \|\| '-r'/g) || [];
      expect(lSelectMatches.length).toBe(1);
      expect(rSelectMatches.length).toBe(1);
      expect(upSql).toContain("'AGILITY_505_L'");
      expect(upSql).toContain("'AGILITY_505_R'");
      expect(upSql).toContain("WHERE src.metric_code = 'AGILITY_505'");
    });

    it('projects per-leg benchmark_set_items rows (Block F)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).toMatch(/bsi\.id \|\| '-l'/);
      expect(upSql).toMatch(/bsi\.id \|\| '-r'/);
      expect(upSql).toMatch(/bsi\.benchmark_id \|\| '-l'/);
      expect(upSql).toMatch(/bsi\.benchmark_id \|\| '-r'/);
    });

    it('uses ON CONFLICT … DO UPDATE for every INSERT (idempotency)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      // Strip line comments to avoid matching prose like "(ON CONFLICT DO UPDATE)" in headers.
      const sqlOnly = upSql
        .split('\n')
        .filter((line) => !line.trim().startsWith('--'))
        .join('\n');
      const insertCount = (sqlOnly.match(/INSERT INTO/g) || []).length;
      // Real ON CONFLICT clauses always have a target column list in parens.
      const conflictCount = (sqlOnly.match(/ON CONFLICT \([^)]+\)\s+DO UPDATE/g) || []).length;
      // Block A, B, C, D, E (×2), F (×2) = 8 INSERTs
      expect(insertCount).toBe(8);
      expect(conflictCount).toBe(insertCount);
    });

    it('does not contain DROP TABLE or destructive operations', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).not.toMatch(/DROP TABLE/i);
      expect(upSql).not.toMatch(/TRUNCATE/i);
      expect(upSql).not.toMatch(/DELETE FROM/i);
    });
  });

  describe('Down-migration SQL file', () => {
    let downSql: string;

    it('exists at expected path', () => {
      expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
      downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      expect(downSql.length).toBeGreaterThan(0);
    });

    it('reverses every block by deterministic ID or scoped metric_code', () => {
      downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');

      // Block F → benchmark_set_items scoped by tier-only _L/_R benchmarks
      expect(downSql).toMatch(
        /DELETE FROM benchmark_set_items[\s\S]*metric_code IN \('AGILITY_505_L', 'AGILITY_505_R'\)[\s\S]*tier_group_id IS NOT NULL/,
      );

      // Block D → 3 deterministic IDs
      expect(downSql).toContain("'bsi-screening-asym-lsi-normal'");
      expect(downSql).toContain("'bsi-screening-asym-lsi-monitor'");
      expect(downSql).toContain("'bsi-screening-asym-lsi-elevated'");

      // Block E → site_benchmarks where metric_code IN (_L, _R) AND tier_group_id IS NOT NULL
      expect(downSql).toMatch(
        /DELETE FROM site_benchmarks[\s\S]*metric_code IN \('AGILITY_505_L', 'AGILITY_505_R'\)[\s\S]*tier_group_id IS NOT NULL/,
      );

      // Block C → 3 deterministic IDs
      expect(downSql).toContain("'bench-screening-asym-lsi-normal'");
      expect(downSql).toContain("'bench-screening-asym-lsi-monitor'");
      expect(downSql).toContain("'bench-screening-asym-lsi-elevated'");

      // Block B → benchmark_sets row
      expect(downSql).toContain("'set-screening-female-bilateral-asymmetry'");

      // Block A → site_metrics row
      expect(downSql).toMatch(/DELETE FROM site_metrics[\s\S]*'AGILITY_505_LSI'/);
    });

    it('orders deletes safely (set_items before benchmarks before metric)', () => {
      downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      const setItemsIdx = downSql.indexOf('DELETE FROM benchmark_set_items');
      const siteBenchIdx = downSql.indexOf('DELETE FROM site_benchmarks');
      const benchSetIdx = downSql.indexOf('DELETE FROM benchmark_sets');
      const siteMetricIdx = downSql.indexOf('DELETE FROM site_metrics');

      expect(setItemsIdx).toBeLessThan(siteBenchIdx);
      expect(siteBenchIdx).toBeLessThan(benchSetIdx);
      expect(benchSetIdx).toBeLessThan(siteMetricIdx);
    });
  });

  // ==========================================================================
  // Layer 2 — Formula correctness (pure JS, no DB)
  // ==========================================================================
  describe('LSI formula evaluation', () => {
    it('parses and validates against AGILITY_505_L / AGILITY_505_R', () => {
      const result = validateFormula(LSI_FORMULA, ['AGILITY_505_L', 'AGILITY_505_R']);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
      expect(result.referencedMetrics.sort()).toEqual(['agility_505_l', 'agility_505_r']);
    });

    it('matches spec sanity check: L=2.50, R=2.80 → LSI ≈ 89.286%', () => {
      const lsi = evaluateFormula(LSI_FORMULA, {
        AGILITY_505_L: 2.50,
        AGILITY_505_R: 2.80,
      });
      expect(lsi).not.toBeNull();
      expect(lsi).toBeCloseTo(89.286, 2);
    });

    it('produces 100% for perfectly symmetric times', () => {
      const lsi = evaluateFormula(LSI_FORMULA, {
        AGILITY_505_L: 2.55,
        AGILITY_505_R: 2.55,
      });
      expect(lsi).toBe(100);
    });

    it('is symmetric: swapping L and R gives the same LSI', () => {
      const a = evaluateFormula(LSI_FORMULA, { AGILITY_505_L: 2.40, AGILITY_505_R: 2.60 });
      const b = evaluateFormula(LSI_FORMULA, { AGILITY_505_L: 2.60, AGILITY_505_R: 2.40 });
      expect(a).toEqual(b);
    });

    it('places LSI = 89.286% in the Elevated Risk tier (<90%)', () => {
      const lsi = evaluateFormula(LSI_FORMULA, { AGILITY_505_L: 2.50, AGILITY_505_R: 2.80 })!;
      // Elevated Risk: min_value=0, max_value=90 (exclusive at 90 per spec)
      expect(lsi).toBeLessThan(90);
    });

    it('places LSI = 92% in the Monitor tier (90-95%)', () => {
      // L = 2.30, R = 2.50 → 2.30/2.50 * 100 = 92
      const lsi = evaluateFormula(LSI_FORMULA, { AGILITY_505_L: 2.30, AGILITY_505_R: 2.50 })!;
      expect(lsi).toBeGreaterThanOrEqual(90);
      expect(lsi).toBeLessThan(95);
    });

    it('places LSI = 96% in the Normal tier (≥95%)', () => {
      // L = 2.40, R = 2.50 → 2.40/2.50 * 100 = 96
      const lsi = evaluateFormula(LSI_FORMULA, { AGILITY_505_L: 2.40, AGILITY_505_R: 2.50 })!;
      expect(lsi).toBeGreaterThanOrEqual(95);
    });
  });
});

// ============================================================================
// Layer 3 — DB state, self-contained (rolled-back transaction per test)
// ============================================================================
class Rollback extends Error {}
// eslint-disable-next-line @typescript-eslint/no-explicit-any
type Tx = any;

describe.skipIf(!DATABASE_URL)('Migration 0128: database state (self-contained fixture, rolled back)', () => {
  let pg: postgres.Sql;
  let up0144: string;
  let down0144: string;

  beforeAll(async () => {
    up0144 = fs.readFileSync(UP_0144_PATH, 'utf-8');
    down0144 = fs.readFileSync(DOWN_0144_PATH, 'utf-8');
    pg = postgres(DATABASE_URL as string, {
      max: 1,
      connect_timeout: 10,
      onnotice: () => {},
      ssl: DATABASE_URL!.includes('localhost') ? false : 'require',
    });
    // Unreachable DB -> throws -> every test in this block fails (never a silent pass).
    await pg`select 1`;
  }, 30000);

  afterAll(async () => {
    if (pg) await pg.end({ timeout: 5 });
  });

  /**
   * Run fn on the canonical pre-0144 fixture ('pre-0144') or on that fixture with the
   * exact 0144 up file applied ('post-0144'). Always rolled back.
   * NOTE: postgres-js returns an array from a query (no `.rows`).
   */
  async function inState(
    state: 'pre-0144' | 'post-0144',
    fn: (tx: Tx) => Promise<void>,
    seed?: (tx: Tx) => Promise<void>,
  ) {
    try {
      await pg.begin(async (tx) => {
        await ensurePre0144State(tx, down0144);
        if (seed) await seed(tx); // extra rows on the old codes, before 0144 repoints them
        if (state === 'post-0144') await tx.unsafe(up0144);
        await fn(tx);
        throw new Rollback();
      });
    } catch (e) {
      if (!(e instanceof Rollback)) throw e;
    }
  }

  const TIMEOUT = 60000;

  describe.each(['pre-0144', 'post-0144'] as const)('state: %s', (state) => {
    const post = state === 'post-0144';
    const lsiCode = post ? 'AGILITY_505_M_LSI' : 'AGILITY_505_LSI';
    const lsiFormula = post ? LSI_FORMULA_M : LSI_FORMULA;
    const legs = post ? ['AGILITY_505_M_L', 'AGILITY_505_M_R'] : ['AGILITY_505_L', 'AGILITY_505_R'];

    it('the LSI metric is registered as a derived metric under the code of this state', async () => {
      await inState(state, async (tx) => {
        const [oldN] = await tx`select count(*)::int as n from site_metrics where code = 'AGILITY_505_LSI'`;
        const [newN] = await tx`select count(*)::int as n from site_metrics where code = 'AGILITY_505_M_LSI'`;
        expect(oldN.n).toBe(post ? 0 : 1);
        expect(newN.n).toBe(post ? 1 : 0);
        const rows = await tx`
          select code, is_derived, formula, dependent_metrics, calculation_config, metric_type, unit
            from site_metrics where code = ${lsiCode}`;
        expect(rows).toHaveLength(1);
        const row = rows[0];
        expect(row.is_derived).toBe(true);
        expect(row.formula).toBe(lsiFormula);
        expect(row.dependent_metrics).toEqual(legs);
        expect(row.calculation_config).toMatchObject({ dateMatchStrategy: 'same_date' });
        expect(row.metric_type).toBe('higher_is_better');
        expect(row.unit).toBe('%');
      });
    }, TIMEOUT);

    it('screening benchmark set exists with Female gender', async () => {
      await inState(state, async (tx) => {
        const rows = await tx`select id, gender, is_template, is_active from benchmark_sets where id = ${SCREENING_SET_ID}`;
        expect(rows).toHaveLength(1);
        expect(rows[0].gender).toBe('Female');
        expect(rows[0].is_template).toBe(true);
        expect(rows[0].is_active).toBe(true);
      });
    }, TIMEOUT);

    it('exactly 3 LSI tier rows share the LSI tier_group_id', async () => {
      await inState(state, async (tx) => {
        const rows = await tx`
          select tier_name, tier_order, min_value, max_value, tier_color
            from site_benchmarks
           where tier_group_id = ${LSI_TIER_GROUP_UUID}::uuid
           order by tier_order`;
        expect(rows).toHaveLength(3);
        const [normal, monitor, elevated] = rows;
        expect(normal.tier_name).toBe('Normal');
        expect(normal.tier_color).toBe('green');
        expect(Number(normal.min_value)).toBe(95);
        expect(Number(normal.max_value)).toBe(100);

        expect(monitor.tier_name).toBe('Monitor');
        expect(monitor.tier_color).toBe('yellow');
        expect(Number(monitor.min_value)).toBe(90);
        // min/max are numeric(10,3) on migration-built DBs but numeric(10,2) on a drizzle-push DB
        // (schema.ts drift), where 94.999 / 89.999 store as 95 / 90.
        const scale = await benchmarkMinMaxScale(tx);
        expect(Number(monitor.max_value)).toBe(scale === 3 ? 94.999 : 95);

        expect(elevated.tier_name).toBe('Elevated Risk');
        expect(elevated.tier_color).toBe('red');
        expect(Number(elevated.min_value)).toBe(0);
        expect(Number(elevated.max_value)).toBe(scale === 3 ? 89.999 : 90);
      });
    }, TIMEOUT);

    it(`LSI tiers are wired into the screening set (${post ? '3 metric + 3 yard twin' : '3'} benchmark_set_items)`, async () => {
      await inState(state, async (tx) => {
        const [{ n: hasMLsi }] = await tx`select count(*)::int as n from site_metrics where code = 'AGILITY_505_M_LSI'`;
        const rows = await tx`
          select benchmark_id, benchmark_type, display_order
            from benchmark_set_items
           where set_id = ${SCREENING_SET_ID}
           order by display_order, benchmark_id`;
        // 0144 adds a yard-protocol twin (<id>-yd) of each tier to the same set
        expect(rows).toHaveLength(hasMLsi > 0 ? 6 : 3);
        const ids = rows.map((r: { benchmark_id: string }) => r.benchmark_id);
        for (const t of ['normal', 'monitor', 'elevated']) {
          expect(ids).toContain(`bench-screening-asym-lsi-${t}`);
          if (hasMLsi > 0) expect(ids).toContain(`bench-screening-asym-lsi-${t}-yd`);
        }
      });
    }, TIMEOUT);

    it('per-leg tier rows match the plain 5-0-5 tier row count (0128 Block E projection)', async () => {
      const seed = async (tx: Tx) => {
        // Seed a balanced tiered set on the plain code plus its per-leg copies exactly as
        // 0128 Block E projects them; for post-0144 the exact 0144 up file then repoints them.
        // Ambient rows are included in the counts, so the equality below can never be vacuous.
        const plain = 'AGILITY_505';
        const tg = '00000000-0128-4000-8000-000000000001';
        await tx.unsafe(`
          insert into site_benchmarks (id, metric_code, name, description, comparison_operator, min_value, max_value,
            tier_group_id, tier_order, tier_name, tier_color, gender, is_system_default, is_active, display_order) values
            ('fx128-t1', '${plain}', 'FX 128 Tier One', 'one', 'range', 2.300, 2.499, '${tg}'::uuid, 1, 'Elite', 'green', 'Female', true, true, 905),
            ('fx128-t2', '${plain}', 'FX 128 Tier Two', 'two', 'range', 2.500, 2.800, '${tg}'::uuid, 2, 'Good', 'yellow', 'Female', true, true, 906);
          insert into site_benchmarks (id, metric_code, name, description, comparison_operator, min_value, max_value,
            tier_group_id, tier_order, tier_name, tier_color, gender, is_system_default, is_active, display_order)
          select src.id || '-l', 'AGILITY_505_L', src.name || ' (Left)', src.description, src.comparison_operator, src.min_value, src.max_value,
            md5(src.tier_group_id::text || '-l')::uuid, src.tier_order, src.tier_name, src.tier_color, src.gender,
            src.is_system_default, src.is_active, src.display_order
          from site_benchmarks src where src.id in ('fx128-t1', 'fx128-t2');
          insert into site_benchmarks (id, metric_code, name, description, comparison_operator, min_value, max_value,
            tier_group_id, tier_order, tier_name, tier_color, gender, is_system_default, is_active, display_order)
          select src.id || '-r', 'AGILITY_505_R', src.name || ' (Right)', src.description, src.comparison_operator, src.min_value, src.max_value,
            md5(src.tier_group_id::text || '-r')::uuid, src.tier_order, src.tier_name, src.tier_color, src.gender,
            src.is_system_default, src.is_active, src.display_order
          from site_benchmarks src where src.id in ('fx128-t1', 'fx128-t2');`);
      };
      await inState(state, async (tx) => {
        const codes = post ? ['AGILITY_505_M', 'AGILITY_505_M_L', 'AGILITY_505_M_R'] : ['AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R'];
        const rows = await tx`
          select metric_code, count(*)::int as n
            from site_benchmarks
           where metric_code = any(${codes}) and tier_group_id is not null
           group by metric_code`;
        const counts = Object.fromEntries(rows.map((r: { metric_code: string; n: number }) => [r.metric_code, r.n]));
        expect(counts[codes[0]]).toBeGreaterThanOrEqual(2);
        expect(counts[codes[1]]).toBe(counts[codes[0]]);
        expect(counts[codes[2]]).toBe(counts[codes[0]]);
      }, seed);
    }, TIMEOUT);
  });
});
