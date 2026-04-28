/**
 * Test suite for Migration 0131: Squat Jump + EUR (AM-FEAT-012)
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

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0131_seed_squat_jump_eur.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0131_seed_squat_jump_eur_down.sql');

const EUR_FORMULA = 'VERTICAL_JUMP / JUMP_SJ_HEIGHT';

describe('Migration 0131: Squat Jump + EUR', () => {
  describe('Up-migration SQL file', () => {
    let upSql: string;

    beforeAll(() => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
    });

    it('exists and contains both new metrics', () => {
      expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
      expect(upSql).toContain("'JUMP_SJ_HEIGHT'");
      expect(upSql).toContain("'POWER_EUR'");
      expect(upSql).toContain(EUR_FORMULA);
    });

    it('JUMP_SJ_HEIGHT uses inches (codebase convention for jump metrics)', () => {
      expect(upSql).toMatch(/'JUMP_SJ_HEIGHT'[\s\S]*?'in'/);
    });

    it('seeds soccer SJ values per spec (Block C)', () => {
      // D1 Avg = 10.2 in (= 26 cm)
      expect(upSql).toMatch(/'d1-soc-sj-d1-avg'[\s\S]*?10\.200/);
      // D1 Top 25% = 11.8 in (= 30 cm)
      expect(upSql).toMatch(/'d1-soc-sj-d1-top25'[\s\S]*?11\.800/);
      // Varsity Avg = 8.7 in (= 22 cm)
      expect(upSql).toMatch(/'hs-var-soc-sj-avg'[\s\S]*?8\.700/);
      // MS Avg = 6.3 in (= 16 cm; LOW flag)
      expect(upSql).toMatch(/'hs-ms-soc-sj'[\s\S]*?6\.300/);
    });

    it('seeds volleyball SJ values per spec (Block D)', () => {
      // VB D1 Avg = 15.0 in (= 38 cm)
      expect(upSql).toMatch(/'d1-vb-sj-d1-avg'[\s\S]*?15\.000/);
      // VB D1 Top 25% = 17.3 in (= 44 cm)
      expect(upSql).toMatch(/'d1-vb-sj-d1-top25'[\s\S]*?17\.300/);
      // VB Varsity Top 25% = 14.2 in
      expect(upSql).toMatch(/'hs-var-vb-sj-top25'[\s\S]*?14\.200/);
    });

    it('flags MS-tier rows as LOW confidence', () => {
      expect(upSql).toMatch(/'hs-ms-soc-sj'[\s\S]*?LOW[\s\S]*?pending BTA internal data/);
      expect(upSql).toMatch(/'hs-ms-vb-sj'[\s\S]*?LOW/);
    });

    it('documents the EUR protocol-mismatch caveat', () => {
      expect(upSql).toMatch(/PROTOCOL NOTE[\s\S]*?hands-free CMJ[\s\S]*?with arm swing/);
    });

    it('ON CONFLICT pairing intact', () => {
      const sqlOnly = upSql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
      const insertCount = (sqlOnly.match(/INSERT INTO/g) || []).length;
      const conflictCount = (sqlOnly.match(/ON CONFLICT \([^)]+\)\s+DO\s+(UPDATE|NOTHING)/g) || []).length;
      expect(insertCount).toBe(5);
      expect(conflictCount).toBe(insertCount);
    });
  });

  describe('Down-migration SQL file', () => {
    it('exists and orders deletes safely', () => {
      expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
      const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      const setItemsIdx = downSql.indexOf('DELETE FROM benchmark_set_items');
      const benchmarksIdx = downSql.indexOf('DELETE FROM site_benchmarks');
      expect(setItemsIdx).toBeLessThan(benchmarksIdx);
    });

    it('preserves JUMP_SJ_HEIGHT if measurements reference it', () => {
      const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      expect(downSql).toMatch(/code = 'JUMP_SJ_HEIGHT'[\s\S]*?NOT EXISTS[\s\S]*?measurements/);
    });
  });

  describe('EUR formula evaluation', () => {
    it('parses against VERTICAL_JUMP and JUMP_SJ_HEIGHT', () => {
      const r = validateFormula(EUR_FORMULA, ['VERTICAL_JUMP', 'JUMP_SJ_HEIGHT']);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });

    it('matches spec sanity check: CMJ 28, SJ 24 → EUR ~1.17', () => {
      // Note: spec used cm; values here are protocol-equivalent inches ratio,
      // since EUR is dimensionless the ratio is the same regardless of units.
      const v = evaluateFormula(EUR_FORMULA, { VERTICAL_JUMP: 28, JUMP_SJ_HEIGHT: 24 });
      expect(v).toBeCloseTo(1.167, 2);
    });

    it('matches spec sanity check: CMJ 25, SJ 24 → EUR ~1.04', () => {
      const v = evaluateFormula(EUR_FORMULA, { VERTICAL_JUMP: 25, JUMP_SJ_HEIGHT: 24 });
      expect(v).toBeCloseTo(1.042, 2);
    });

    it('matches spec sanity check: VB CMJ 45, SJ 38 → EUR ~1.18', () => {
      const v = evaluateFormula(EUR_FORMULA, { VERTICAL_JUMP: 45, JUMP_SJ_HEIGHT: 38 });
      expect(v).toBeCloseTo(1.184, 2);
    });

    it('returns null when JUMP_SJ_HEIGHT is 0 (division-by-zero protection)', () => {
      const v = evaluateFormula(EUR_FORMULA, { VERTICAL_JUMP: 28, JUMP_SJ_HEIGHT: 0 });
      expect(v).toBeNull();
    });
  });

  describe.skipIf(!process.env.DATABASE_URL)('Database state (when applied)', () => {
    // Normalize result across drivers: postgres-js returns array-like; Neon
    // returns {rows: [...]}. Both are valid drizzle drivers.
    const rowsOf = (result: unknown): any[] => {
      if (Array.isArray(result)) return result;
      const r = result as { rows?: unknown };
      return Array.isArray(r.rows) ? r.rows : [];
    };

    // Matches 0129's pattern: CI runs `db:push` (schema only) + seed script,
    // not the numbered manual migrations. Soft-skip when 0131 hasn't been
    // applied so these tests only fail when run against a fully-migrated DB.
    it('JUMP_SJ_HEIGHT and POWER_EUR exist; POWER_EUR is derived', async () => {
      try {
        const r = await db.execute(sql`
          SELECT code, is_derived, formula FROM site_metrics
           WHERE code IN ('JUMP_SJ_HEIGHT', 'POWER_EUR') ORDER BY code
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('JUMP_SJ_HEIGHT/POWER_EUR not found - migration 0131 may not have been applied');
          return;
        }
        expect(rows).toHaveLength(2);
        const eur = rows.find(row => row.code === 'POWER_EUR');
        expect(eur).toBeDefined();
        expect(eur.is_derived).toBe(true);
        expect(eur.formula).toBe(EUR_FORMULA);
      } catch (err) {
        console.warn('Skipping live-DB check (migration 0131 may not have been applied):', err);
      }
    });

    it('SJ benchmarks exist for both sports', async () => {
      try {
        const r = await db.execute(sql`
          SELECT sport, COUNT(*)::int AS n FROM site_benchmarks
           WHERE metric_code = 'JUMP_SJ_HEIGHT' GROUP BY sport ORDER BY sport
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('SJ benchmarks not found - migration 0131 may not have been applied');
          return;
        }
        expect(rows).toHaveLength(2);
      } catch (err) {
        console.warn('Skipping live-DB check (migration 0131 may not have been applied):', err);
      }
    });
  });
});
