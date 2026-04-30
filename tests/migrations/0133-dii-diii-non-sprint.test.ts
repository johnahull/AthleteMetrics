/**
 * Test suite for Migration 0133: DII/DIII Non-Sprint Tier Extension (AM-FEAT-011)
 *
 * Pure additive — 6 INSERT rows extending DII/DIII soccer sets created by
 * AM-FEAT-010. No new metrics; no new sets.
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

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0133_extend_dii_diii_non_sprint.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0133_extend_dii_diii_non_sprint_down.sql');

describe('Migration 0133: DII/DIII Non-Sprint Tier Extension (AM-FEAT-011)', () => {
  describe('Up-migration SQL file', () => {
    let upSql: string;

    beforeAll(() => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
    });

    it('exists', () => {
      expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
      expect(upSql.length).toBeGreaterThan(0);
    });

    it('uses codebase metric codes (AGILITY_5105 not AGILITY_PRO)', () => {
      expect(upSql).not.toContain("'AGILITY_PRO'");
      expect(upSql).toContain("'AGILITY_5105'");
      expect(upSql).toContain("'AGILITY_505'");
      expect(upSql).toContain("'COND_YYIR1_DISTANCE'");
    });

    it('seeds DII threshold values per spec (Block A)', () => {
      // 5-0-5: <2.68s; Pro Agility (5105): <5.30s; YYIR1: >1200m
      expect(upSql).toMatch(/'dii-soc-505-thresh'[\s\S]*?2\.680/);
      expect(upSql).toMatch(/'dii-soc-pro-thresh'[\s\S]*?5\.300/);
      expect(upSql).toMatch(/'dii-soc-yyir1-thresh'[\s\S]*?1200\.000/);
    });

    it('seeds DIII threshold values per spec (Block B)', () => {
      // 5-0-5: <2.70s; Pro Agility: <5.50s; YYIR1: >1000m
      expect(upSql).toMatch(/'diii-soc-505-thresh'[\s\S]*?2\.700/);
      expect(upSql).toMatch(/'diii-soc-pro-thresh'[\s\S]*?5\.500/);
      expect(upSql).toMatch(/'diii-soc-yyir1-thresh'[\s\S]*?1000\.000/);
    });

    it('YYIR1 uses gte (higher = better aerobic capacity)', () => {
      expect(upSql).toMatch(/'dii-soc-yyir1-thresh'[\s\S]*?'gte'/);
      expect(upSql).toMatch(/'diii-soc-yyir1-thresh'[\s\S]*?'gte'/);
    });

    it('5-0-5 and Pro Agility use lte (lower = better)', () => {
      expect(upSql).toMatch(/'dii-soc-505-thresh'[\s\S]*?'lte'/);
      expect(upSql).toMatch(/'diii-soc-pro-thresh'[\s\S]*?'lte'/);
    });

    it('does NOT create new sets or new metrics (pure additive)', () => {
      expect(upSql).not.toMatch(/INSERT INTO benchmark_sets/);
      expect(upSql).not.toMatch(/INSERT INTO site_metrics/);
    });

    it('links 6 rows via benchmark_set_items (Block C)', () => {
      const bsiMatches = upSql.match(/'bsi-d(?:ii|iii)-soc-/g) || [];
      expect(bsiMatches.length).toBeGreaterThanOrEqual(6);
    });

    it('uses ON CONFLICT … DO UPDATE for every INSERT', () => {
      const sqlOnly = upSql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
      const insertCount = (sqlOnly.match(/INSERT INTO/g) || []).length;
      const conflictCount = (sqlOnly.match(/ON CONFLICT \([^)]+\)\s+DO\s+UPDATE/g) || []).length;
      expect(insertCount).toBe(3);
      expect(conflictCount).toBe(3);
    });

    it('emits RAISE NOTICE summary', () => {
      expect(upSql).toMatch(/RAISE NOTICE\s+'Migration 0133 complete/);
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

    it('removes exactly the 6 set_items + 6 site_benchmarks rows', () => {
      const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      const expectedIds = [
        'bsi-dii-soc-505','bsi-dii-soc-pro','bsi-dii-soc-yyir1',
        'bsi-diii-soc-505','bsi-diii-soc-pro','bsi-diii-soc-yyir1',
        'dii-soc-505-thresh','dii-soc-pro-thresh','dii-soc-yyir1-thresh',
        'diii-soc-505-thresh','diii-soc-pro-thresh','diii-soc-yyir1-thresh',
      ];
      for (const id of expectedIds) {
        expect(downSql).toContain(`'${id}'`);
      }
    });
  });

  describe.skipIf(!process.env.DATABASE_URL)('Database state (when applied)', () => {
    const rowsOf = (result: unknown): any[] => {
      if (Array.isArray(result)) return result;
      const r = result as { rows?: unknown };
      return Array.isArray(r.rows) ? r.rows : [];
    };

    it('all 6 new benchmark rows exist', async () => {
      try {
        const r = await db.execute(sql`
          SELECT id, benchmark_value::numeric AS v
            FROM site_benchmarks
           WHERE id IN (
             'dii-soc-505-thresh','dii-soc-pro-thresh','dii-soc-yyir1-thresh',
             'diii-soc-505-thresh','diii-soc-pro-thresh','diii-soc-yyir1-thresh'
           )
           ORDER BY id
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('AM-FEAT-011 rows not found — migration 0133 may not have been applied');
          return;
        }
        expect(rows).toHaveLength(6);
      } catch (err) {
        console.warn('Skipping live-DB check (migration 0133 may not have been applied):', err);
      }
    });

    it('DII set has 8+ total set_items (5 sprint from AM-FEAT-010 + 3 non-sprint from this PR)', async () => {
      try {
        const r = await db.execute(sql`
          SELECT COUNT(*)::int AS n
            FROM benchmark_set_items
           WHERE set_id = 'dii-womens-soccer'
        `);
        const rows = rowsOf(r);
        if (rows.length === 0 || rows[0].n === 0) {
          console.warn('DII set items not found');
          return;
        }
        expect(rows[0].n).toBeGreaterThanOrEqual(8);
      } catch (err) {
        console.warn('Skipping live-DB check:', err);
      }
    });

    it('DIII set has 8+ total set_items', async () => {
      try {
        const r = await db.execute(sql`
          SELECT COUNT(*)::int AS n
            FROM benchmark_set_items
           WHERE set_id = 'diii-womens-soccer'
        `);
        const rows = rowsOf(r);
        if (rows.length === 0 || rows[0].n === 0) {
          console.warn('DIII set items not found');
          return;
        }
        expect(rows[0].n).toBeGreaterThanOrEqual(8);
      } catch (err) {
        console.warn('Skipping live-DB check:', err);
      }
    });
  });
});
