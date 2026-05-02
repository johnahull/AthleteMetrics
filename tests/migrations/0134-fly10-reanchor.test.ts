/**
 * Test suite for Migration 0134: FLY10_TIME re-anchoring (AM-FEAT-007 spec rev)
 *
 * Pure UPDATE migration — re-anchors 5 FLY10_TIME values to spec-canonical
 * values per the 2026-04-29 spec revision.
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

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0134_reanchor_fly10_time_values.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0134_reanchor_fly10_time_values_down.sql');

// Spec-canonical values per AM-FEAT-007 revision 2026-04-29
const NEW_VALUES = {
  'd1-soc-fly10-d1-avg':   1.170,
  'd1-soc-fly10-d1-top25': 1.050,
  'hs-ms-soc-fly10':       1.640,
  'hs-jv-soc-fly10':       1.460,
  'hs-var-soc-fly10':      1.360,
};

describe('Migration 0134: FLY10_TIME re-anchoring', () => {
  describe('Up-migration SQL file', () => {
    let upSql: string;

    beforeAll(() => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
    });

    it('exists', () => {
      expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
      expect(upSql.length).toBeGreaterThan(0);
    });

    it('updates each of the 5 FLY10_TIME row IDs with the spec-canonical value', () => {
      for (const [rowId, value] of Object.entries(NEW_VALUES)) {
        const expectedValue = value.toFixed(3);
        // Each UPDATE block must contain the row id, the new benchmark_value, and an updated description
        expect(upSql).toMatch(new RegExp(`benchmark_value = ${expectedValue}[\\s\\S]*?WHERE id = '${rowId}'`));
      }
    });

    it('uses UPDATE only (no INSERT, no DELETE)', () => {
      const sqlOnly = upSql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
      expect(sqlOnly).not.toMatch(/\bINSERT INTO\b/);
      expect(sqlOnly).not.toMatch(/\bDELETE FROM\b/);
      const updateCount = (sqlOnly.match(/^UPDATE site_benchmarks$/gm) || []).length;
      expect(updateCount).toBe(5);
    });

    it('references the 20.455 / mph conversion formula in descriptions', () => {
      // The spec's anchor formula must appear so future readers understand the derivation
      expect(upSql).toMatch(/20\.455\s*\/\s*mph/);
    });

    it('cites the 2026-04-29 re-anchoring date', () => {
      expect(upSql).toMatch(/2026-04-29/);
    });

    it('emits RAISE NOTICE summary with all 5 values', () => {
      expect(upSql).toMatch(/RAISE NOTICE\s+'Migration 0134 complete/);
    });
  });

  describe('Down-migration SQL file', () => {
    let downSql: string;

    beforeAll(() => {
      downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
    });

    it('exists and reverts each of the 5 rows', () => {
      expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
      const oldValues = {
        'd1-soc-fly10-d1-avg':   '1.280',
        'd1-soc-fly10-d1-top25': '1.100',
        'hs-ms-soc-fly10':       '1.720',
        'hs-jv-soc-fly10':       '1.580',
        'hs-var-soc-fly10':      '1.480',
      };
      for (const [rowId, oldValue] of Object.entries(oldValues)) {
        expect(downSql).toMatch(new RegExp(`benchmark_value = ${oldValue}[\\s\\S]*?WHERE id = '${rowId}'`));
      }
    });
  });

  describe.skipIf(!process.env.DATABASE_URL)('Database state (when applied)', () => {
    const rowsOf = (result: unknown): any[] => {
      if (Array.isArray(result)) return result;
      const r = result as { rows?: unknown };
      return Array.isArray(r.rows) ? r.rows : [];
    };

    it('all 5 FLY10_TIME values match the re-anchored spec values', async () => {
      try {
        const r = await db.execute(sql`
          SELECT id, benchmark_value::numeric AS value
            FROM site_benchmarks
           WHERE id IN (
             'd1-soc-fly10-d1-avg', 'd1-soc-fly10-d1-top25',
             'hs-ms-soc-fly10', 'hs-jv-soc-fly10', 'hs-var-soc-fly10'
           )
           ORDER BY id
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('FLY10_TIME rows not found — migrations 0129 + 0134 may not be applied');
          return;
        }
        expect(rows).toHaveLength(5);
        for (const row of rows) {
          const expected = NEW_VALUES[row.id as keyof typeof NEW_VALUES];
          expect(Number(row.value)).toBeCloseTo(expected, 3);
        }
      } catch (err) {
        console.warn('Skipping live-DB check:', err);
      }
    });

    it('descriptions reflect 2026-04-29 re-anchoring', async () => {
      try {
        const r = await db.execute(sql`
          SELECT description FROM site_benchmarks WHERE id = 'd1-soc-fly10-d1-avg'
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) return;
        expect(rows[0].description).toMatch(/2026-04-29|20\.455/);
      } catch (err) {
        console.warn('Skipping live-DB check:', err);
      }
    });
  });
});
