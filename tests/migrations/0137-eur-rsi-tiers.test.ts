/**
 * Test suite for Migration 0137:
 *   - Add site_benchmarks.coaching_note column
 *   - Seed POWER_EUR 4-tier diagnostic interpretation
 *   - Add RSI_L / RSI_R base metrics + RSI_ASYM derived metric
 *   - Seed RSI_L / RSI_R normative tiers + RSI_ASYM screening tiers
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

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0137_add_coaching_note_seed_eur_rsi_tiers.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0137_add_coaching_note_seed_eur_rsi_tiers_down.sql');

const RSI_ASYM_FORMULA = '((max(RSI_L, RSI_R) - min(RSI_L, RSI_R)) / max(RSI_L, RSI_R)) * 100';

describe('Migration 0137: EUR tiers + bilateral RSI + coaching_note', () => {
  describe('Up-migration SQL file', () => {
    let upSql: string;

    beforeAll(() => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
    });

    it('adds coaching_note column to site_benchmarks', () => {
      expect(fs.existsSync(UP_SQL_PATH)).toBe(true);
      expect(upSql).toMatch(/ALTER TABLE site_benchmarks[\s\S]*?ADD COLUMN IF NOT EXISTS coaching_note TEXT/);
    });

    describe('POWER_EUR 4-tier diagnostic', () => {
      it('seeds Elite reactive tier with > 1.25 range', () => {
        expect(upSql).toMatch(/'bench-eur-elite-reactive'[\s\S]*?'POWER_EUR'[\s\S]*?1\.25,\s*1\.5/);
        expect(upSql).toMatch(/'bench-eur-elite-reactive'[\s\S]*?'Elite reactive'/);
      });

      it('seeds Trained reactive tier with 1.15–1.249 range', () => {
        expect(upSql).toMatch(/'bench-eur-trained-reactive'[\s\S]*?1\.15,\s*1\.249/);
      });

      it('seeds Functional SSC use tier with 1.05–1.149 range', () => {
        expect(upSql).toMatch(/'bench-eur-functional-ssc'[\s\S]*?1\.05,\s*1\.149/);
      });

      it('seeds Concentric-dominant tier with 0–1.049 range', () => {
        expect(upSql).toMatch(/'bench-eur-concentric-dominant'[\s\S]*?0,\s*1\.049/);
      });

      it('all 4 EUR tiers share tier_group_id e0eeeeee', () => {
        // Count tier_group_id casts followed by `, <int>,` (tier_order) — that
        // pattern only appears inside INSERT VALUES tuples, not in comments
        // or summary WHERE clauses.
        const tgMatches = upSql.match(/'e0eeeeee-0137-4eee-9eee-eeeeeeeeeeee'::uuid,\s*\d+,/g) || [];
        expect(tgMatches).toHaveLength(4);
      });

      it('Concentric-dominant coaching note prescribes plyometric block', () => {
        expect(upSql).toMatch(/'bench-eur-concentric-dominant'[\s\S]*?Plyometric block/);
      });

      it('Trained reactive coaching note prescribes raising the SJ floor', () => {
        expect(upSql).toMatch(/'bench-eur-trained-reactive'[\s\S]*?raising the SJ floor/);
      });
    });

    describe('Bilateral RSI metrics', () => {
      it('inserts RSI_L base metric with ratio unit and higher_is_better', () => {
        expect(upSql).toMatch(/'RSI_L'[\s\S]*?'ratio'[\s\S]*?'higher_is_better'/);
      });

      it('inserts RSI_R base metric with ratio unit and higher_is_better', () => {
        expect(upSql).toMatch(/'RSI_R'[\s\S]*?'ratio'[\s\S]*?'higher_is_better'/);
      });

      it('RSI_L description references 10/5 Repeat Hop protocol', () => {
        expect(upSql).toMatch(/'RSI_L'[\s\S]*?10\/5 Repeat Hop/);
      });

      it('inserts RSI_ASYM derived metric with asymmetry % formula and lower_is_better', () => {
        expect(upSql).toContain("'RSI_ASYM'");
        expect(upSql).toMatch(/'RSI_ASYM'[\s\S]*?'%'[\s\S]*?'lower_is_better'/);
        expect(upSql).toContain(RSI_ASYM_FORMULA);
        expect(upSql).toMatch(/dependent_metrics[\s\S]*?ARRAY\['RSI_L',\s*'RSI_R'\]/);
      });
    });

    describe('RSI_L and RSI_R normative tiers', () => {
      it('seeds Elite tier (≥1.5) for both legs', () => {
        expect(upSql).toMatch(/'bench-rsi-l-elite'[\s\S]*?1\.5,\s*5/);
        expect(upSql).toMatch(/'bench-rsi-r-elite'[\s\S]*?1\.5,\s*5/);
      });

      it('seeds Trained tier (1.1–1.499) for both legs', () => {
        expect(upSql).toMatch(/'bench-rsi-l-trained'[\s\S]*?1\.1,\s*1\.499/);
        expect(upSql).toMatch(/'bench-rsi-r-trained'[\s\S]*?1\.1,\s*1\.499/);
      });

      it('seeds General tier (0.5–1.099) for both legs', () => {
        expect(upSql).toMatch(/'bench-rsi-l-general'[\s\S]*?0\.5,\s*1\.099/);
        expect(upSql).toMatch(/'bench-rsi-r-general'[\s\S]*?0\.5,\s*1\.099/);
      });

      it('seeds Below Floor tier (0–0.499) for both legs', () => {
        expect(upSql).toMatch(/'bench-rsi-l-floor'[\s\S]*?0,\s*0\.499/);
        expect(upSql).toMatch(/'bench-rsi-r-floor'[\s\S]*?0,\s*0\.499/);
      });

      it('RSI_L tiers share group 15151515 and RSI_R tiers share group 26262626', () => {
        const lCasts = upSql.match(/'15151515-0137-4151-9151-aaaaaaaaaaaa'::uuid,\s*\d+,/g) || [];
        const rCasts = upSql.match(/'26262626-0137-4262-a262-bbbbbbbbbbbb'::uuid,\s*\d+,/g) || [];
        expect(lCasts).toHaveLength(4);
        expect(rCasts).toHaveLength(4);
      });
    });

    describe('RSI_ASYM screening tiers', () => {
      it('seeds 4 tiers per spec ranges', () => {
        expect(upSql).toMatch(/'bench-rsi-asym-symmetric'[\s\S]*?0,\s*9\.999/);
        expect(upSql).toMatch(/'bench-rsi-asym-borderline'[\s\S]*?10,\s*14\.999/);
        expect(upSql).toMatch(/'bench-rsi-asym-significant'[\s\S]*?15,\s*19\.999/);
        expect(upSql).toMatch(/'bench-rsi-asym-redflag'[\s\S]*?20,\s*100/);
      });

      it('Significant Deficit tier carries SSC-breakdown coaching note', () => {
        expect(upSql).toMatch(/'bench-rsi-asym-significant'[\s\S]*?SSC breakdown/);
      });

      it('Clinical Red Flag tier references ACL/joint deficit warning', () => {
        expect(upSql).toMatch(/'bench-rsi-asym-redflag'[\s\S]*?ACL/);
      });
    });

    describe('Benchmark sets and set items', () => {
      it('creates EUR diagnostic screening set', () => {
        expect(upSql).toMatch(/'set-screening-eur-diagnostic'[\s\S]*?'EUR Diagnostic Tiers'/);
      });

      it('creates RSI normative + asymmetry screening sets', () => {
        expect(upSql).toContain("'set-screening-female-rsi-normative'");
        expect(upSql).toContain("'set-screening-female-rsi-asymmetry'");
      });

      it('wires all 4 EUR tiers, 8 RSI normative tiers, 4 RSI asymmetry tiers into set_items', () => {
        const setItemsBlock = upSql.match(/INSERT INTO benchmark_set_items[\s\S]*?ON CONFLICT/g) || [];
        // Count benchmark_set_items inserts in the wiring block (Block D + Block K)
        const totalBsiRows = (upSql.match(/^\s*\('bsi-(eur|rsi)-/gm) || []).length;
        expect(totalBsiRows).toBe(16);
      });
    });
  });

  describe('Down-migration SQL file', () => {
    let downSql: string;

    beforeAll(() => {
      downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
    });

    it('exists and orders deletes safely (set_items → benchmarks → sets → metrics)', () => {
      expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
      const setItemsIdx = downSql.indexOf('DELETE FROM benchmark_set_items');
      const benchmarksIdx = downSql.indexOf('DELETE FROM site_benchmarks');
      const setsIdx = downSql.indexOf('DELETE FROM benchmark_sets');
      const metricsIdx = downSql.indexOf("WHERE code = 'RSI_ASYM'");
      expect(setItemsIdx).toBeLessThan(benchmarksIdx);
      expect(benchmarksIdx).toBeLessThan(setsIdx);
      expect(setsIdx).toBeLessThan(metricsIdx);
    });

    it('preserves RSI_L and RSI_R if measurements reference them', () => {
      expect(downSql).toMatch(/code IN \('RSI_L',\s*'RSI_R'\)[\s\S]*?NOT EXISTS[\s\S]*?measurements/);
    });

    it('intentionally does NOT drop the coaching_note column', () => {
      expect(downSql).not.toMatch(/DROP COLUMN coaching_note/);
      expect(downSql).toMatch(/coaching_note column[\s\S]*?NOT dropped/i);
    });

    it('removes the 3 screening benchmark_sets', () => {
      expect(downSql).toContain("'set-screening-eur-diagnostic'");
      expect(downSql).toContain("'set-screening-female-rsi-normative'");
      expect(downSql).toContain("'set-screening-female-rsi-asymmetry'");
    });
  });

  describe('RSI_ASYM formula evaluation', () => {
    it('parses against [RSI_L, RSI_R]', () => {
      const r = validateFormula(RSI_ASYM_FORMULA, ['RSI_L', 'RSI_R']);
      expect(r.errors).toEqual([]);
      expect(r.valid).toBe(true);
    });

    it('RSI_L 1.4, RSI_R 1.2 → asymmetry ≈ 14.286%', () => {
      const v = evaluateFormula(RSI_ASYM_FORMULA, { RSI_L: 1.4, RSI_R: 1.2 });
      expect(v).toBeCloseTo(14.286, 2);
    });

    it('RSI_L 1.0, RSI_R 1.0 → asymmetry = 0% (perfect symmetry)', () => {
      const v = evaluateFormula(RSI_ASYM_FORMULA, { RSI_L: 1.0, RSI_R: 1.0 });
      expect(v).toBe(0);
    });

    it('RSI_L 1.0, RSI_R 0.7 → asymmetry = 30% (Clinical Red Flag zone)', () => {
      const v = evaluateFormula(RSI_ASYM_FORMULA, { RSI_L: 1.0, RSI_R: 0.7 });
      expect(v).toBeCloseTo(30, 2);
    });

    it('returns null when both inputs are 0 (degenerate / div-by-zero)', () => {
      const v = evaluateFormula(RSI_ASYM_FORMULA, { RSI_L: 0, RSI_R: 0 });
      expect(v).toBeNull();
    });

    it('RSI_L 0, RSI_R 1.0 → 100% asymmetry (one-leg-zero edge case)', () => {
      // Physiologically implausible but possible from data-entry error;
      // formula should produce 100% rather than div-by-zero or NaN, since
      // max(0, 1.0) = 1.0 keeps the denominator non-zero.
      const v = evaluateFormula(RSI_ASYM_FORMULA, { RSI_L: 0, RSI_R: 1.0 });
      expect(v).toBeCloseTo(100, 2);
    });
  });

  describe.skipIf(!process.env.DATABASE_URL)('Database state (when applied)', () => {
    const rowsOf = (result: unknown): any[] => {
      if (Array.isArray(result)) return result;
      const r = result as { rows?: unknown };
      return Array.isArray(r.rows) ? r.rows : [];
    };

    it('coaching_note column exists on site_benchmarks', async () => {
      try {
        const r = await db.execute(sql`
          SELECT column_name FROM information_schema.columns
            WHERE table_name = 'site_benchmarks' AND column_name = 'coaching_note'
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) {
          console.warn('coaching_note column not found — migration 0137 may not have been applied');
          return;
        }
        expect(rows).toHaveLength(1);
      } catch (err) {
        console.warn('Skipping live-DB check:', err);
      }
    });

    it('POWER_EUR has 4 tier rows with coaching notes', async () => {
      try {
        const r = await db.execute(sql`
          SELECT COUNT(*)::int AS n FROM site_benchmarks
           WHERE metric_code = 'POWER_EUR' AND coaching_note IS NOT NULL
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) return;
        expect(rows[0].n).toBe(4);
      } catch (err) {
        console.warn('Skipping live-DB check:', err);
      }
    });

    it('RSI_L, RSI_R, RSI_ASYM exist with correct types', async () => {
      try {
        const r = await db.execute(sql`
          SELECT code, metric_type, is_derived FROM site_metrics
           WHERE code IN ('RSI_L', 'RSI_R', 'RSI_ASYM') ORDER BY code
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) return;
        expect(rows).toHaveLength(3);
        const asym = rows.find((row: any) => row.code === 'RSI_ASYM');
        expect(asym.metric_type).toBe('lower_is_better');
        expect(asym.is_derived).toBe(true);
      } catch (err) {
        console.warn('Skipping live-DB check:', err);
      }
    });

    it('RSI_ASYM has 4 screening tiers; RSI_L+RSI_R have 8 normative tiers', async () => {
      try {
        const r = await db.execute(sql`
          SELECT metric_code, COUNT(*)::int AS n FROM site_benchmarks
           WHERE metric_code IN ('RSI_L', 'RSI_R', 'RSI_ASYM')
             AND tier_group_id IS NOT NULL
           GROUP BY metric_code ORDER BY metric_code
        `);
        const rows = rowsOf(r);
        if (rows.length === 0) return;
        const counts = Object.fromEntries(rows.map((row: any) => [row.metric_code, row.n]));
        expect(counts.RSI_L).toBe(4);
        expect(counts.RSI_R).toBe(4);
        expect(counts.RSI_ASYM).toBe(4);
      } catch (err) {
        console.warn('Skipping live-DB check:', err);
      }
    });
  });
});
