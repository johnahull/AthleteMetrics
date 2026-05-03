/**
 * Test suite for Migration 0134: Deactivate 'd1-soc-yyir1-elite'
 *
 * Two layers:
 *   1. Static SQL file analysis  — runs unconditionally, no DB needed
 *   2. Live DB row inspection    — soft-skips if migration not applied
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

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0134_deactivate_yyir1_elite.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0134_deactivate_yyir1_elite_down.sql');

describe('Migration 0134: Deactivate d1-soc-yyir1-elite', () => {
  describe('Up-migration SQL file', () => {
    let upSql: string;

    beforeAll(() => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
    });

    it('exists at expected path', () => {
      expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
      expect(upSql.length).toBeGreaterThan(0);
    });

    it('targets only d1-soc-yyir1-elite', () => {
      expect(upSql).toContain("WHERE id = 'd1-soc-yyir1-elite'");
    });

    it('sets is_active = false', () => {
      expect(upSql).toMatch(/SET\s+is_active\s*=\s*false/);
    });

    it('is idempotent (no-op if already inactive)', () => {
      // The AND clause prevents the UPDATE from re-touching an already-
      // inactive row, keeping updated_at stable on re-apply.
      expect(upSql).toMatch(/AND\s+is_active\s*=\s*true/);
    });

    it('emits a verification NOTICE', () => {
      expect(upSql).toMatch(/RAISE NOTICE\s+'Migration 0134 complete/);
    });
  });

  describe('Down-migration SQL file', () => {
    it('exists at expected path', () => {
      expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
    });

    it('reactivates the row (is_active = true) gated on current inactive state', () => {
      const downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      expect(downSql).toMatch(/SET\s+is_active\s*=\s*true/);
      expect(downSql).toMatch(/AND\s+is_active\s*=\s*false/);
      expect(downSql).toContain("WHERE id = 'd1-soc-yyir1-elite'");
    });
  });

  describe.skipIf(!process.env.DATABASE_URL)('Database state (when migration is applied)', () => {
    const rowsOf = (result: unknown): any[] => {
      if (Array.isArray(result)) return result;
      const r = result as { rows?: unknown };
      return Array.isArray(r.rows) ? r.rows : [];
    };

    it("'d1-soc-yyir1-elite' is inactive in the live DB", async () => {
      try {
        const r = await db.execute(sql`
          SELECT is_active FROM site_benchmarks WHERE id = 'd1-soc-yyir1-elite'
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('d1-soc-yyir1-elite not present - migration 0130 may not have been applied');
          return;
        }
        expect(rows[0].is_active).toBe(false);
      } catch (err) {
        if ((err as { code?: string })?.code !== '42P01') throw err;
        console.warn('Skipping live-DB check — site_benchmarks missing, migrations may not be applied');
      }
    });
  });
});
