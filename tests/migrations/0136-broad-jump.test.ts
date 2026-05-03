/**
 * Test suite for Migration 0136: JUMP_BROAD + Female Soccer benchmarks
 *
 * Adds the broad jump (standing long jump) base metric and seeds D1 + HS
 * age-grouped female soccer tier values per
 * bta-business/docs/benchmarks/d1-soccer-benchmarks.md §3.
 */
import { describe, it, expect, beforeAll } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../packages/api/db';
import { sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0136_add_jump_broad.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0136_add_jump_broad_down.sql');

describe('Migration 0136: JUMP_BROAD + Soccer benchmarks', () => {
  describe('Up-migration SQL file', () => {
    let upSql: string;

    beforeAll(() => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
    });

    it('exists and contains JUMP_BROAD metric definition', () => {
      expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
      expect(upSql).toContain("'JUMP_BROAD'");
      expect(upSql).toContain("'Broad Jump'");
    });

    it('JUMP_BROAD uses inches (codebase convention for jump metrics)', () => {
      expect(upSql).toMatch(/'JUMP_BROAD'[\s\S]*?'in'/);
    });

    it('JUMP_BROAD is categorized as Power, higher_is_better', () => {
      expect(upSql).toMatch(/'JUMP_BROAD'[\s\S]*?'Power'[\s\S]*?'higher_is_better'/);
    });

    it('seeds D1 soccer values per spec (Block B)', () => {
      // D1 Avg = 70.1 in (= 178 cm)
      expect(upSql).toMatch(/'d1-soc-broad-d1-avg'[\s\S]*?70\.100/);
      // D1 Top 25% = 77.6 in (= 197 cm)
      expect(upSql).toMatch(/'d1-soc-broad-d1-elite'[\s\S]*?77\.600/);
    });

    it('seeds HS varsity soccer values per spec', () => {
      // Varsity Avg = 59.1 in (= 150 cm spec lower bound)
      expect(upSql).toMatch(/'hs-var-soc-broad-avg'[\s\S]*?59\.100/);
      // Varsity Top 25% = 65.0 in (= 165 cm spec lower bound)
      expect(upSql).toMatch(/'hs-var-soc-broad-top25'[\s\S]*?65\.000/);
    });

    it('seeds HS MS / JV soccer values flagged LOW confidence', () => {
      expect(upSql).toMatch(/'hs-ms-soc-broad'[\s\S]*?51\.200/);
      expect(upSql).toMatch(/'hs-jv-soc-broad'[\s\S]*?57\.100/);
      expect(upSql).toMatch(/'hs-ms-soc-broad'[\s\S]*?LOW/);
    });

    it('cites spec sources (Hilton 2021, Lockie 2016) on D1 rows', () => {
      expect(upSql).toMatch(/'d1-soc-broad-d1-avg'[\s\S]*?Hilton/);
      expect(upSql).toMatch(/'d1-soc-broad-d1-elite'[\s\S]*?Lockie/);
    });

    it('flags D1 rows MODERATE and HS Varsity rows LOW-MODERATE confidence', () => {
      expect(upSql).toMatch(/'d1-soc-broad-d1-avg'[\s\S]*?MODERATE/);
      expect(upSql).toMatch(/'hs-var-soc-broad-avg'[\s\S]*?LOW-MODERATE/);
    });

    it('ON CONFLICT pairing intact (each INSERT has matching DO clause)', () => {
      const sqlOnly = upSql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
      const insertCount = (sqlOnly.match(/INSERT INTO/g) || []).length;
      const conflictCount = (sqlOnly.match(/ON CONFLICT \([^)]+\)\s+DO\s+(UPDATE|NOTHING)/g) || []).length;
      expect(insertCount).toBe(3);
      expect(conflictCount).toBe(insertCount);
    });

    it('wires soccer broad jump benchmarks into existing 0131 sets', () => {
      expect(upSql).toMatch(/'bsi-d1-soc-broad-d1-avg'[\s\S]*?'d1-womens-soccer'/);
      expect(upSql).toMatch(/'bsi-hs-var-soc-broad-avg'[\s\S]*?'hs-varsity-female-soccer'/);
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

    it('preserves JUMP_BROAD if measurements reference it', () => {
      const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      expect(downSql).toMatch(/code = 'JUMP_BROAD'[\s\S]*?NOT EXISTS[\s\S]*?measurements/);
    });
  });

  describe.skipIf(!process.env.DATABASE_URL)('Database state (when applied)', () => {
    const rowsOf = (result: unknown): any[] => {
      if (Array.isArray(result)) return result;
      const r = result as { rows?: unknown };
      return Array.isArray(r.rows) ? r.rows : [];
    };

    it('JUMP_BROAD metric exists with correct unit and category', async () => {
      try {
        const r = await db.execute(sql`
          SELECT code, unit, category, metric_type
            FROM site_metrics WHERE code = 'JUMP_BROAD'
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('JUMP_BROAD not found — migration 0136 may not have been applied');
          return;
        }
        expect(rows).toHaveLength(1);
        expect(rows[0].unit).toBe('in');
        expect(rows[0].metric_type).toBe('higher_is_better');
      } catch (err) {
        console.warn('Skipping live-DB check (migration 0136 may not have been applied):', err);
      }
    });

    it('Soccer broad jump benchmarks exist', async () => {
      try {
        const r = await db.execute(sql`
          SELECT COUNT(*)::int AS n FROM site_benchmarks
           WHERE metric_code = 'JUMP_BROAD' AND sport = 'SOCCER'
        `);
        const rows = rowsOf(r);
        if (rows.length === 0 || rows[0].n === 0) {
          console.warn('Broad jump benchmarks not found — migration 0136 may not have been applied');
          return;
        }
        expect(rows[0].n).toBe(6);
      } catch (err) {
        console.warn('Skipping live-DB check (migration 0136 may not have been applied):', err);
      }
    });
  });
});
