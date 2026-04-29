/**
 * Test suite for Migration 0130: Yo-Yo IR1 Benchmark Seeding (AM-FEAT-009)
 *
 * Three layers:
 *   1. Static SQL file analysis  — runs unconditionally, no DB needed
 *   2. Formula evaluation        — verifies VO₂max formula via evaluateFormula()
 *   3. Live DB row inspection    — gracefully skips if migration not applied
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../packages/api/db';
import { sql } from 'drizzle-orm';
import { evaluateFormula, validateFormula } from '../../packages/api/services/formula-service';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0130_seed_yyir1_benchmarks.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0130_seed_yyir1_benchmarks_down.sql');

const VO2MAX_FORMULA = '(COND_YYIR1_DISTANCE * 0.0084) + 36.4';

describe('Migration 0130: Yo-Yo IR1 Benchmark Seeding', () => {
  // ==========================================================================
  // Layer 1 — Static SQL file analysis
  // ==========================================================================
  describe('Up-migration SQL file', () => {
    let upSql: string;

    beforeAll(() => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
    });

    it('exists at expected path', () => {
      expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
      expect(upSql.length).toBeGreaterThan(0);
    });

    it('declares COND_YYIR1_DISTANCE base metric (Block A)', () => {
      expect(upSql).toContain("'COND_YYIR1_DISTANCE'");
      expect(upSql).toContain("'higher_is_better'");
      expect(upSql).toMatch(/'m',/);
    });

    it('declares COND_VO2MAX_EST derived metric (Block B)', () => {
      expect(upSql).toContain("'COND_VO2MAX_EST'");
      expect(upSql).toContain(VO2MAX_FORMULA);
      expect(upSql).toContain("ARRAY['COND_YYIR1_DISTANCE']");
      expect(upSql).toContain('"dateMatchStrategy":"same_date"');
    });

    it('seeds D1 women\'s soccer YYIR1 rows (Block C)', () => {
      // HS Avg = 950
      expect(upSql).toMatch(/'d1-soc-yyir1-hs-avg'[\s\S]*?950\.000/);
      // D1 Avg = 1300
      expect(upSql).toMatch(/'d1-soc-yyir1-d1-avg'[\s\S]*?1300\.000/);
      // D1 Top 25% = 1650
      expect(upSql).toMatch(/'d1-soc-yyir1-d1-top25'[\s\S]*?1650\.000/);
      // Elite/Pro = 1700
      expect(upSql).toMatch(/'d1-soc-yyir1-elite'[\s\S]*?1700\.000/);
    });

    it('inline-notes DII / DIII thresholds in D1 Avg description (Option A)', () => {
      expect(upSql).toMatch(/d1-soc-yyir1-d1-avg[\s\S]*?DII threshold[\s\S]*?DIII threshold/);
    });

    it('seeds HS age-grouped soccer YYIR1 rows (Block D)', () => {
      // MS = 750 (LOW confidence)
      expect(upSql).toMatch(/'hs-ms-soc-yyir1'[\s\S]*?750\.000/);
      // JV = 950
      expect(upSql).toMatch(/'hs-jv-soc-yyir1'[\s\S]*?950\.000/);
      // Varsity Avg = 1000
      expect(upSql).toMatch(/'hs-var-soc-yyir1-avg'[\s\S]*?1000\.000/);
      // Varsity Top 25% = 1400
      expect(upSql).toMatch(/'hs-var-soc-yyir1-top25'[\s\S]*?1400\.000/);
    });

    it('flags MS-tier as LOW confidence in description', () => {
      expect(upSql).toMatch(/'hs-ms-soc-yyir1'[\s\S]*?LOW[\s\S]*?pending BTA internal data/);
    });

    it('does not seed volleyball (out of scope per spec)', () => {
      expect(upSql).not.toMatch(/'d1-vb-yyir1/);
      expect(upSql).not.toMatch(/'hs-.*-vb-yyir1/);
    });

    it('Block E linkages reference the correct PR #402 set IDs', () => {
      // Hard dependency: 0129 (PR #402) seeds these; copy-paste typos here
      // would produce FK violations on apply.
      expect(upSql).toContain("'d1-womens-soccer'");
      expect(upSql).toContain("'hs-ms-female-soccer'");
      expect(upSql).toContain("'hs-jv-female-soccer'");
      expect(upSql).toContain("'hs-varsity-female-soccer'");
    });

    it('uses ON CONFLICT for every INSERT (DO NOTHING for base metric, DO UPDATE for the rest)', () => {
      const sqlOnly = upSql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
      const insertCount = (sqlOnly.match(/INSERT INTO/g) || []).length;
      const conflictCount = (sqlOnly.match(/ON CONFLICT \([^)]+\)\s+DO\s+(UPDATE|NOTHING)/g) || []).length;
      // Blocks A, B, C, D, E = 5 INSERTs
      expect(insertCount).toBeGreaterThanOrEqual(5);
      expect(conflictCount).toBe(insertCount);
    });

    it('emits a RAISE NOTICE summary at the end', () => {
      expect(upSql).toMatch(/RAISE NOTICE\s+'Migration 0130 complete/);
    });
  });

  describe('Down-migration SQL file', () => {
    it('exists at expected path', () => {
      expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
    });

    it('orders deletes safely (set_items → benchmarks → metrics last)', () => {
      const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      const setItemsIdx = downSql.indexOf('DELETE FROM benchmark_set_items');
      const benchmarksIdx = downSql.indexOf('DELETE FROM site_benchmarks');
      const metricsIdx = downSql.indexOf('DELETE FROM site_metrics');
      expect(setItemsIdx).toBeLessThan(benchmarksIdx);
      expect(benchmarksIdx).toBeLessThan(metricsIdx);
    });

    it('preserves COND_YYIR1_DISTANCE if measurements reference it', () => {
      const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      expect(downSql).toMatch(/code = 'COND_YYIR1_DISTANCE'[\s\S]*?NOT EXISTS[\s\S]*?measurements/);
    });
  });

  // ==========================================================================
  // Layer 2 — Bangsbo VO₂max formula evaluation (no DB needed)
  // ==========================================================================
  describe('VO₂max formula (Bangsbo regression)', () => {
    it('parses and validates against COND_YYIR1_DISTANCE', () => {
      const result = validateFormula(VO2MAX_FORMULA, ['COND_YYIR1_DISTANCE']);
      expect(result.errors).toEqual([]);
      expect(result.valid).toBe(true);
    });

    it('matches spec sanity check: 1100 m → ~45.6 mL/kg/min', () => {
      const v = evaluateFormula(VO2MAX_FORMULA, { COND_YYIR1_DISTANCE: 1100 });
      expect(v).not.toBeNull();
      expect(v).toBeCloseTo(45.64, 1);
    });

    it('matches spec sanity check: 850 m → ~43.5 mL/kg/min', () => {
      const v = evaluateFormula(VO2MAX_FORMULA, { COND_YYIR1_DISTANCE: 850 });
      expect(v).not.toBeNull();
      expect(v).toBeCloseTo(43.54, 1);
    });

    it('matches spec sanity check: 1500 m → ~49.0 mL/kg/min', () => {
      const v = evaluateFormula(VO2MAX_FORMULA, { COND_YYIR1_DISTANCE: 1500 });
      expect(v).not.toBeNull();
      expect(v).toBeCloseTo(49.0, 1);
    });

    it('produces reasonable values across the soccer-D1 range', () => {
      // D1 Avg 1300 m → ~47.3 mL/kg/min (reasonable for D1 female soccer)
      const v = evaluateFormula(VO2MAX_FORMULA, { COND_YYIR1_DISTANCE: 1300 });
      expect(v).not.toBeNull();
      expect(v).toBeGreaterThanOrEqual(45);
      expect(v).toBeLessThanOrEqual(50);
    });
  });

  // ==========================================================================
  // Layer 3 — Live DB inspection
  //
  // Matches 0129/0131/0132 pattern: CI runs `db:push` (schema only) + seed
  // script, not the numbered manual migrations. Each test soft-skips on empty
  // rows so the suite only fails when run against a fully-migrated local DB.
  // ==========================================================================
  describe.skipIf(!process.env.DATABASE_URL)('Database state (when migration is applied)', () => {
    const rowsOf = (result: unknown): any[] => {
      if (Array.isArray(result)) return result;
      const r = result as { rows?: unknown };
      return Array.isArray(r.rows) ? r.rows : [];
    };

    it('COND_YYIR1_DISTANCE base metric exists', async () => {
      try {
        const r = await db.execute(sql`
          SELECT code, metric_type, unit FROM site_metrics WHERE code = 'COND_YYIR1_DISTANCE'
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('COND_YYIR1_DISTANCE not found - migration 0130 may not have been applied');
          return;
        }
        expect(rows).toHaveLength(1);
        expect(rows[0].metric_type).toBe('higher_is_better');
        expect(rows[0].unit).toBe('m');
      } catch (err) {
        // Narrow to 42P01 (relation does not exist) — re-throw real query
        // failures (column typo, permission error) so they don't silently pass.
        if ((err as { code?: string })?.code !== '42P01') throw err;
        console.warn('Skipping live-DB check — table missing, migration 0130 may not be applied');
      }
    });

    it('COND_VO2MAX_EST is registered as a derived metric', async () => {
      try {
        const r = await db.execute(sql`
          SELECT is_derived, formula, dependent_metrics FROM site_metrics WHERE code = 'COND_VO2MAX_EST'
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('COND_VO2MAX_EST not found - migration 0130 may not have been applied');
          return;
        }
        expect(rows).toHaveLength(1);
        expect(rows[0].is_derived).toBe(true);
        expect(rows[0].formula).toBe(VO2MAX_FORMULA);
        expect(rows[0].dependent_metrics).toEqual(['COND_YYIR1_DISTANCE']);
      } catch (err) {
        // Narrow to 42P01 (relation does not exist) — re-throw real query
        // failures (column typo, permission error) so they don't silently pass.
        if ((err as { code?: string })?.code !== '42P01') throw err;
        console.warn('Skipping live-DB check — table missing, migration 0130 may not be applied');
      }
    });

    it('all 4 D1 soccer YYIR1 rows exist with correct values', async () => {
      try {
        const r = await db.execute(sql`
          SELECT id, benchmark_value::numeric AS v
            FROM site_benchmarks
           WHERE id LIKE 'd1-soc-yyir1-%' ORDER BY id
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('D1 soccer YYIR1 rows not found - migration 0130 may not have been applied');
          return;
        }
        expect(rows).toHaveLength(4);
        const byId = Object.fromEntries(rows.map(row => [row.id, Number(row.v)]));
        expect(byId['d1-soc-yyir1-hs-avg']).toBe(950);
        expect(byId['d1-soc-yyir1-d1-avg']).toBe(1300);
        expect(byId['d1-soc-yyir1-d1-top25']).toBe(1650);
        expect(byId['d1-soc-yyir1-elite']).toBe(1700);
      } catch (err) {
        // Narrow to 42P01 (relation does not exist) — re-throw real query
        // failures (column typo, permission error) so they don't silently pass.
        if ((err as { code?: string })?.code !== '42P01') throw err;
        console.warn('Skipping live-DB check — table missing, migration 0130 may not be applied');
      }
    });

    it('all 4 HS-soccer YYIR1 rows exist with correct values', async () => {
      try {
        const r = await db.execute(sql`
          SELECT id, benchmark_value::numeric AS v
            FROM site_benchmarks
           WHERE id LIKE 'hs-%-soc-yyir1%' ORDER BY id
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('HS soccer YYIR1 rows not found - migration 0130 may not have been applied');
          return;
        }
        expect(rows).toHaveLength(4);
        const byId = Object.fromEntries(rows.map(row => [row.id, Number(row.v)]));
        expect(byId['hs-ms-soc-yyir1']).toBe(750);
        expect(byId['hs-jv-soc-yyir1']).toBe(950);
        expect(byId['hs-var-soc-yyir1-avg']).toBe(1000);
        expect(byId['hs-var-soc-yyir1-top25']).toBe(1400);
      } catch (err) {
        // Narrow to 42P01 (relation does not exist) — re-throw real query
        // failures (column typo, permission error) so they don't silently pass.
        if ((err as { code?: string })?.code !== '42P01') throw err;
        console.warn('Skipping live-DB check — table missing, migration 0130 may not be applied');
      }
    });
  });
});
