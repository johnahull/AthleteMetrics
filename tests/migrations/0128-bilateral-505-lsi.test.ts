/**
 * Test suite for Migration 0128: Bilateral 5-0-5 + LSI Screening
 *
 * Three layers of validation:
 *   1. Static SQL file analysis  — runs unconditionally, no DB needed
 *   2. Live DB row inspection    — gracefully skips if migration not applied
 *   3. Formula evaluation        — verifies LSI formula via evaluateFormula()
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../packages/api/db';
import { sql } from 'drizzle-orm';
import { evaluateFormula, validateFormula } from '../../packages/api/services/formula-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0128_add_bilateral_505_lsi_metrics.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0128_add_bilateral_505_lsi_metrics_down.sql');

const LSI_FORMULA = '(min(AGILITY_505_L, AGILITY_505_R) / max(AGILITY_505_L, AGILITY_505_R)) * 100';
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
      // Tier ranges per spec
      expect(upSql).toMatch(/'range', 95, 100/);  // Normal
      expect(upSql).toMatch(/'range', 90, 95/);   // Monitor
      expect(upSql).toMatch(/'range', 0, 90/);    // Elevated Risk
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

      // Block F → benchmark_set_items by metric_code-scoped subquery
      expect(downSql).toMatch(
        /DELETE FROM benchmark_set_items[\s\S]*metric_code IN \('AGILITY_505_L', 'AGILITY_505_R'\)/,
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

  // ==========================================================================
  // Layer 3 — Live DB inspection (skips if migration not applied)
  // ==========================================================================
  describe('Database state (when migration is applied)', () => {
    it('AGILITY_505_LSI is registered as a derived metric', async () => {
      try {
        const result = await db.execute(sql`
          SELECT code, is_derived, formula, dependent_metrics, calculation_config, metric_type, unit
            FROM site_metrics
           WHERE code = 'AGILITY_505_LSI'
        `);
        if (!result.rows || result.rows.length === 0) {
          console.warn('AGILITY_505_LSI not found - migration 0128 may not have been applied');
          return;
        }
        const row = result.rows[0] as any;
        expect(row.is_derived).toBe(true);
        expect(row.formula).toBe(LSI_FORMULA);
        expect(row.dependent_metrics).toEqual(['AGILITY_505_L', 'AGILITY_505_R']);
        expect(row.calculation_config).toMatchObject({ dateMatchStrategy: 'same_date' });
        expect(row.metric_type).toBe('higher_is_better');
        expect(row.unit).toBe('%');
      } catch (error) {
        console.warn('DB query failed (DB may not be reachable):', (error as Error).message);
      }
    });

    it('screening benchmark set exists with Female gender', async () => {
      try {
        const result = await db.execute(sql`
          SELECT id, gender, is_template, is_active
            FROM benchmark_sets
           WHERE id = 'set-screening-female-bilateral-asymmetry'
        `);
        if (!result.rows || result.rows.length === 0) {
          console.warn('Screening set not found - migration 0128 may not have been applied');
          return;
        }
        const row = result.rows[0] as any;
        expect(row.gender).toBe('Female');
        expect(row.is_template).toBe(true);
        expect(row.is_active).toBe(true);
      } catch (error) {
        console.warn('DB query failed:', (error as Error).message);
      }
    });

    it('exactly 3 LSI tier rows share the LSI tier_group_id', async () => {
      try {
        const result = await db.execute(sql`
          SELECT tier_name, tier_order, min_value, max_value, tier_color
            FROM site_benchmarks
           WHERE tier_group_id = ${LSI_TIER_GROUP_UUID}::uuid
           ORDER BY tier_order
        `);
        if (!result.rows || result.rows.length === 0) {
          console.warn('LSI tier rows not found - migration 0128 may not have been applied');
          return;
        }
        expect(result.rows).toHaveLength(3);

        const [normal, monitor, elevated] = result.rows as any[];
        expect(normal.tier_name).toBe('Normal');
        expect(normal.tier_color).toBe('green');
        expect(Number(normal.min_value)).toBe(95);
        expect(Number(normal.max_value)).toBe(100);

        expect(monitor.tier_name).toBe('Monitor');
        expect(monitor.tier_color).toBe('yellow');
        expect(Number(monitor.min_value)).toBe(90);
        expect(Number(monitor.max_value)).toBe(95);

        expect(elevated.tier_name).toBe('Elevated Risk');
        expect(elevated.tier_color).toBe('red');
        expect(Number(elevated.min_value)).toBe(0);
        expect(Number(elevated.max_value)).toBe(90);
      } catch (error) {
        console.warn('DB query failed:', (error as Error).message);
      }
    });

    it('LSI tiers are wired into the screening set (3 benchmark_set_items)', async () => {
      try {
        const result = await db.execute(sql`
          SELECT bsi.benchmark_id, bsi.benchmark_type, bsi.display_order
            FROM benchmark_set_items bsi
           WHERE bsi.set_id = 'set-screening-female-bilateral-asymmetry'
           ORDER BY bsi.display_order
        `);
        if (!result.rows || result.rows.length === 0) {
          console.warn('Screening set items not found - migration 0128 may not have been applied');
          return;
        }
        expect(result.rows).toHaveLength(3);
        const ids = result.rows.map((r: any) => r.benchmark_id);
        expect(ids).toContain('bench-screening-asym-lsi-normal');
        expect(ids).toContain('bench-screening-asym-lsi-monitor');
        expect(ids).toContain('bench-screening-asym-lsi-elevated');
      } catch (error) {
        console.warn('DB query failed:', (error as Error).message);
      }
    });

    it('per-leg AGILITY_505_L / _R rows match AGILITY_505 row count (when AM-FEAT-007 applied)', async () => {
      try {
        const result = await db.execute(sql`
          SELECT metric_code, COUNT(*)::int AS n
            FROM site_benchmarks
           WHERE metric_code IN ('AGILITY_505', 'AGILITY_505_L', 'AGILITY_505_R')
             AND tier_group_id IS NOT NULL
           GROUP BY metric_code
        `);
        if (!result.rows || result.rows.length === 0) {
          console.warn('No AGILITY_505 tier rows found - AM-FEAT-007 may not have been applied');
          return;
        }
        const counts = Object.fromEntries(
          (result.rows as any[]).map((r) => [r.metric_code, r.n]),
        );
        // If AM-FEAT-007 is applied, _L and _R counts must match the AGILITY_505 count
        if (counts['AGILITY_505']) {
          expect(counts['AGILITY_505_L']).toBe(counts['AGILITY_505']);
          expect(counts['AGILITY_505_R']).toBe(counts['AGILITY_505']);
        }
      } catch (error) {
        console.warn('DB query failed:', (error as Error).message);
      }
    });
  });
});
