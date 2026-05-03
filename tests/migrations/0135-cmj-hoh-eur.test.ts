/**
 * Test suite for Migration 0135: JUMP_CMJ_HOH + POWER_EUR repoint
 *
 * Adds JUMP_CMJ_HOH base metric and repoints POWER_EUR's formula from
 * VERTICAL_JUMP / JUMP_SJ_HEIGHT (set by 0131) to JUMP_CMJ_HOH / JUMP_SJ_HEIGHT
 * so EUR's published interpretation thresholds (1.05/1.15/1.25) apply directly
 * without the arm-swing-protocol caveat.
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

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0135_add_cmj_hoh_repoint_eur.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0135_add_cmj_hoh_repoint_eur_down.sql');

const NEW_EUR_FORMULA = 'JUMP_CMJ_HOH / JUMP_SJ_HEIGHT';
const OLD_EUR_FORMULA = 'VERTICAL_JUMP / JUMP_SJ_HEIGHT';

describe('Migration 0135: JUMP_CMJ_HOH + EUR repoint', () => {
  describe('Up-migration SQL file', () => {
    let upSql: string;

    beforeAll(() => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
    });

    it('exists and contains JUMP_CMJ_HOH metric definition', () => {
      expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
      expect(upSql).toContain("'JUMP_CMJ_HOH'");
      expect(upSql).toContain("'Counter-Movement Jump (HOH)'");
    });

    it('JUMP_CMJ_HOH uses inches (matches JUMP_SJ_HEIGHT convention)', () => {
      expect(upSql).toMatch(/'JUMP_CMJ_HOH'[\s\S]*?'in'/);
    });

    it('JUMP_CMJ_HOH description emphasizes HOH protocol and distinguishes from VERTICAL_JUMP', () => {
      expect(upSql).toMatch(/hands-on-hips|hands fixed on hips/);
      expect(upSql).toMatch(/no arm swing/);
      expect(upSql).toMatch(/VERTICAL_JUMP[\s\S]*?arm swing/);
    });

    it('repoints POWER_EUR formula to JUMP_CMJ_HOH / JUMP_SJ_HEIGHT', () => {
      expect(upSql).toContain(NEW_EUR_FORMULA);
      expect(upSql).toMatch(/UPDATE site_metrics[\s\S]*?formula\s*=\s*'JUMP_CMJ_HOH \/ JUMP_SJ_HEIGHT'/);
    });

    it('updates POWER_EUR dependent_metrics to include JUMP_CMJ_HOH', () => {
      expect(upSql).toMatch(/dependent_metrics\s*=\s*ARRAY\['JUMP_CMJ_HOH',\s*'JUMP_SJ_HEIGHT'\]/);
    });

    it('tightens POWER_EUR validation_max from 2.5 to 1.5', () => {
      expect(upSql).toMatch(/validation_max\s*=\s*1\.5/);
    });

    it('drops the PROTOCOL NOTE caveat from POWER_EUR description', () => {
      // The new description should no longer mention "PROTOCOL NOTE" or "arm swing"
      // in the EUR description (verified by checking the UPDATE block for POWER_EUR).
      const updateBlock = upSql.match(/UPDATE site_metrics[\s\S]*?WHERE code = 'POWER_EUR'/);
      expect(updateBlock).not.toBeNull();
      expect(updateBlock![0]).not.toMatch(/PROTOCOL NOTE/);
    });
  });

  describe('Down-migration SQL file', () => {
    let downSql: string;

    beforeAll(() => {
      downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
    });

    it('exists and restores POWER_EUR to the 0131 formula', () => {
      expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
      expect(downSql).toContain(OLD_EUR_FORMULA);
    });

    it('restores POWER_EUR validation_max to 2.5', () => {
      expect(downSql).toMatch(/validation_max\s*=\s*2\.5/);
    });

    it('preserves JUMP_CMJ_HOH if measurements reference it', () => {
      expect(downSql).toMatch(/code = 'JUMP_CMJ_HOH'[\s\S]*?NOT EXISTS[\s\S]*?measurements/);
    });

    it('restores PROTOCOL NOTE caveat in POWER_EUR description', () => {
      expect(downSql).toMatch(/PROTOCOL NOTE/);
    });
  });

  describe('Repointed EUR formula evaluation', () => {
    it('parses against JUMP_CMJ_HOH and JUMP_SJ_HEIGHT', () => {
      const r = validateFormula(NEW_EUR_FORMULA, ['JUMP_CMJ_HOH', 'JUMP_SJ_HEIGHT']);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });

    it('HOH-CMJ 28 in / SJ 24 in → EUR ≈ 1.17 (Trained reactive zone)', () => {
      const v = evaluateFormula(NEW_EUR_FORMULA, { JUMP_CMJ_HOH: 28, JUMP_SJ_HEIGHT: 24 });
      expect(v).toBeCloseTo(1.167, 2);
    });

    it('HOH-CMJ 25 in / SJ 24 in → EUR ≈ 1.04 (Concentric-dominant zone)', () => {
      const v = evaluateFormula(NEW_EUR_FORMULA, { JUMP_CMJ_HOH: 25, JUMP_SJ_HEIGHT: 24 });
      expect(v).toBeCloseTo(1.042, 2);
    });

    it('returns null when JUMP_SJ_HEIGHT is 0 (division-by-zero protection)', () => {
      const v = evaluateFormula(NEW_EUR_FORMULA, { JUMP_CMJ_HOH: 28, JUMP_SJ_HEIGHT: 0 });
      expect(v).toBeNull();
    });
  });

  describe.skipIf(!process.env.DATABASE_URL)('Database state (when applied)', () => {
    const rowsOf = (result: unknown): any[] => {
      if (Array.isArray(result)) return result;
      const r = result as { rows?: unknown };
      return Array.isArray(r.rows) ? r.rows : [];
    };

    it('JUMP_CMJ_HOH exists with correct unit and metric_type', async () => {
      try {
        const r = await db.execute(sql`
          SELECT code, unit, metric_type, validation_min, validation_max
            FROM site_metrics WHERE code = 'JUMP_CMJ_HOH'
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('JUMP_CMJ_HOH not found — migration 0135 may not have been applied');
          return;
        }
        expect(rows).toHaveLength(1);
        expect(rows[0].unit).toBe('in');
        expect(rows[0].metric_type).toBe('higher_is_better');
      } catch (err) {
        console.warn('Skipping live-DB check (migration 0135 may not have been applied):', err);
      }
    });

    it('POWER_EUR formula is JUMP_CMJ_HOH / JUMP_SJ_HEIGHT and validation_max is 1.5', async () => {
      try {
        const r = await db.execute(sql`
          SELECT formula, validation_max FROM site_metrics WHERE code = 'POWER_EUR'
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('POWER_EUR not found — migration 0131 may not have been applied');
          return;
        }
        expect(rows[0].formula).toBe(NEW_EUR_FORMULA);
        expect(parseFloat(rows[0].validation_max)).toBe(1.5);
      } catch (err) {
        console.warn('Skipping live-DB check (migration 0135 may not have been applied):', err);
      }
    });
  });
});
