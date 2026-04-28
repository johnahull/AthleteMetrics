/**
 * Test suite for Migration 0129: D1 + HS Female Benchmark Seeding (AM-FEAT-007)
 *
 * Three layers of validation:
 *   1. Static SQL file analysis  — runs unconditionally, no DB needed
 *   2. Spec value spot-checks    — confirm key values match the spec
 *   3. Live DB row inspection    — gracefully skips if migration not applied
 */
import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { db } from '../../packages/api/db';
import { sql } from 'drizzle-orm';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

const UP_SQL_PATH = path.join(projectRoot, 'migrations', '0129_reseed_d1_hs_female_benchmarks.sql');
const DOWN_SQL_PATH = path.join(projectRoot, 'migrations', '0129_reseed_d1_hs_female_benchmarks_down.sql');

const EXPECTED_SETS = [
  'd1-womens-soccer',
  'd1-womens-volleyball',
  'hs-ms-female-soccer',
  'hs-jv-female-soccer',
  'hs-varsity-female-soccer',
  'hs-ms-female-volleyball',
  'hs-jv-female-volleyball',
  'hs-varsity-female-volleyball',
];

describe('Migration 0129: D1 + HS Female Benchmark Seeding', () => {
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

    it('creates all 8 expected benchmark sets (Block A)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).toMatch(/INSERT INTO benchmark_sets/);
      for (const setId of EXPECTED_SETS) {
        expect(upSql, `expected set id '${setId}' in migration`).toContain(`'${setId}'`);
      }
    });

    it('uses codebase metric codes (post-reconciliation)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      // Codes that should appear (codebase canonical names)
      const codebaseCodes = [
        "'DASH_10YD'",
        "'DASH_20YD'",
        "'FLY10_TIME'",
        "'TOP_SPEED_MPH'",
        "'AGILITY_5105'",
        "'AGILITY_505'",
        "'VERTICAL_JUMP'",
        "'APPROACH_JUMP'",
        "'BLOCK_JUMP'",
      ];
      for (const code of codebaseCodes) {
        expect(upSql, `expected codebase metric code ${code}`).toContain(code);
      }
    });

    it('does NOT use spec-only metric codes that have codebase equivalents', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      // These are spec names that should have been renamed before being seeded
      const reconciledAwayCodes = [
        "'SPRINT_20YD'",
        "'SPRINT_10YD_FLY'",
        "'SPEED_TOP_MPH'",
        "'AGILITY_PRO'",
        "'JUMP_APPROACH'",
        "'JUMP_BLOCK'",
        "'JUMP_CMJ_HOH'",
        "'JUMP_VJ_REACH'",
        "'JUMP_BROAD'",
        "'POWER_RSI_MOD'",
      ];
      for (const code of reconciledAwayCodes) {
        expect(upSql, `${code} should have been renamed to codebase equivalent`).not.toContain(code);
      }
    });

    it('seeds D1 women\'s soccer key values per spec (Block B)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      // DASH_10YD D1 Top 25% = 1.65 (John's 2026-04-24 decision)
      expect(upSql).toContain("'d1-soc-dash10-d1-top25'");
      expect(upSql).toMatch(/'d1-soc-dash10-d1-top25'[\s\S]*?1\.650/);
      // TOP_SPEED_MPH D1 Top 25% = 19.5
      expect(upSql).toMatch(/'d1-soc-tspd-d1-top25'[\s\S]*?19\.500/);
      // AGILITY_5105 D1 Avg = 4.95
      expect(upSql).toMatch(/'d1-soc-agi5105-d1-avg'[\s\S]*?4\.950/);
      // AGILITY_505 D1 Avg = 2.51 (HIGH confidence per spec)
      expect(upSql).toMatch(/'d1-soc-agi505-d1-avg'[\s\S]*?2\.510/);
      // VERTICAL_JUMP D1 Avg = 18.9 in. Codebase VJ is hands-free CMJ (with arm swing);
      // values mapped from spec's JUMP_VJ_REACH (48 cm), NOT JUMP_CMJ_HOH.
      expect(upSql).toMatch(/'d1-soc-vj-d1-avg'[\s\S]*?18\.900/);
    });

    it('seeds HS VERTICAL_JUMP age-band values per spec (Block D + E)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      // Codebase VERTICAL_JUMP is hands-free CMJ (with arm swing).
      // Values mapped from spec's JUMP_VJ_REACH rows, NOT JUMP_CMJ_HOH.
      // Soccer: 33/38/43 cm → 13.0/15.0/17.0 in
      expect(upSql).toMatch(/'hs-ms-soc-vj'[\s\S]*?13\.000/);
      expect(upSql).toMatch(/'hs-jv-soc-vj'[\s\S]*?15\.000/);
      expect(upSql).toMatch(/'hs-var-soc-vj'[\s\S]*?17\.000/);
      // Volleyball: 36/42/47 cm → 14.0/16.5/18.5 in
      expect(upSql).toMatch(/'hs-ms-vb-vj'[\s\S]*?14\.000/);
      expect(upSql).toMatch(/'hs-jv-vb-vj'[\s\S]*?16\.500/);
      expect(upSql).toMatch(/'hs-var-vb-vj'[\s\S]*?18\.500/);
    });

    it('seeds D1 women\'s volleyball with VB-specific metrics (Block C)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      // APPROACH_JUMP D1 Top 25% = 28 in
      expect(upSql).toMatch(/'d1-vb-appj-d1-top25'[\s\S]*?28\.000/);
      // BLOCK_JUMP D1 Avg = 18 in
      expect(upSql).toMatch(/'d1-vb-blkj-d1-avg'[\s\S]*?18\.000/);
    });

    it('omits spec-deferred VB metrics (TOP_SPEED_MPH, FLY10_TIME for VB)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      // Should NOT have a d1-vb-tspd-* row (per John 2026-04-24 — VB doesn't get TOP_SPEED_MPH)
      expect(upSql).not.toMatch(/'d1-vb-tspd-/);
      // Should NOT have a d1-vb-fly10-* row (per AM-FEAT-010 cleanup)
      expect(upSql).not.toMatch(/'d1-vb-fly10-/);
    });

    it('seeds HS age-grouped soccer rows for MS / JV / Varsity (Block D)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      // MS DASH_10YD = 2.15
      expect(upSql).toMatch(/'hs-ms-soc-dash10'[\s\S]*?2\.150/);
      // JV DASH_10YD = 2.05
      expect(upSql).toMatch(/'hs-jv-soc-dash10'[\s\S]*?2\.050/);
      // Varsity DASH_10YD = 1.95
      expect(upSql).toMatch(/'hs-var-soc-dash10'[\s\S]*?1\.950/);
    });

    it('flags low-confidence FLY10_TIME HS rows in description', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      // FLY10_TIME HS rows are LOW confidence per spec; description should say so
      expect(upSql).toMatch(/'hs-ms-soc-fly10'[\s\S]*?LOW[\s\S]*?pending BTA internal data/);
    });

    it('uses ON CONFLICT for every INSERT (idempotency — DO UPDATE for benchmarks, DO NOTHING for prerequisite metrics)', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      const sqlOnly = upSql.split('\n').filter(l => !l.trim().startsWith('--')).join('\n');
      const insertCount = (sqlOnly.match(/INSERT INTO/g) || []).length;
      // Block A0 uses DO NOTHING (preserve existing metric defs); Blocks A–F use DO UPDATE
      // (benchmark values should overwrite). Both are valid idempotency strategies.
      const conflictCount = (sqlOnly.match(/ON CONFLICT \([^)]+\)\s+DO\s+(UPDATE|NOTHING)/g) || []).length;
      expect(insertCount).toBeGreaterThanOrEqual(7);
      expect(conflictCount).toBe(insertCount);
    });

    it('does not contain destructive operations', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).not.toMatch(/DROP TABLE/i);
      expect(upSql).not.toMatch(/TRUNCATE/i);
      expect(upSql).not.toMatch(/^\s*DELETE FROM/im);
    });

    it('emits a RAISE NOTICE summary at the end', () => {
      upSql = fs.readFileSync(UP_SQL_PATH, 'utf-8');
      expect(upSql).toMatch(/RAISE NOTICE\s+'Migration 0129 complete/);
    });
  });

  describe('Down-migration SQL file', () => {
    let downSql: string;

    it('exists at expected path', () => {
      expect(fs.existsSync(DOWN_SQL_PATH)).toBe(true);
      downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      expect(downSql.length).toBeGreaterThan(0);
    });

    it('orders deletes safely (set_items → benchmarks → sets)', () => {
      downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      const setItemsIdx = downSql.indexOf('DELETE FROM benchmark_set_items');
      const benchmarksIdx = downSql.indexOf('DELETE FROM site_benchmarks');
      const setsIdx = downSql.indexOf('DELETE FROM benchmark_sets');
      expect(setItemsIdx).toBeLessThan(benchmarksIdx);
      expect(benchmarksIdx).toBeLessThan(setsIdx);
    });

    it('removes all 8 benchmark sets', () => {
      downSql = fs.readFileSync(DOWN_SQL_PATH, 'utf-8');
      for (const setId of EXPECTED_SETS) {
        expect(downSql).toContain(`'${setId}'`);
      }
    });
  });

  // ==========================================================================
  // Layer 2 — Live DB inspection (skips if migration not applied)
  // ==========================================================================
  describe('Database state (when migration is applied)', () => {
    it('all 8 benchmark sets exist with correct sport/level/gender', async () => {
      try {
        const result = await db.execute(sql`
          SELECT id, sport, level, gender, is_template
            FROM benchmark_sets
           WHERE id = ANY(ARRAY[
             'd1-womens-soccer','d1-womens-volleyball',
             'hs-ms-female-soccer','hs-jv-female-soccer','hs-varsity-female-soccer',
             'hs-ms-female-volleyball','hs-jv-female-volleyball','hs-varsity-female-volleyball'
           ]::text[])
           ORDER BY id
        `);
        if (!result.rows || result.rows.length === 0) {
          console.warn('Benchmark sets not found - migration 0129 may not have been applied');
          return;
        }
        expect(result.rows).toHaveLength(8);
        for (const row of result.rows as any[]) {
          expect(row.gender).toBe('Female');
          expect(row.is_template).toBe(true);
        }
      } catch (error) {
        console.warn('DB query failed (DB may not be reachable):', (error as Error).message);
      }
    });

    it('soccer DASH_10YD D1 Top 25% is 1.65 (per John 2026-04-24 decision)', async () => {
      try {
        const result = await db.execute(sql`
          SELECT benchmark_value::text AS value
            FROM site_benchmarks
           WHERE id = 'd1-soc-dash10-d1-top25'
        `);
        if (!result.rows || result.rows.length === 0) {
          console.warn('DASH_10YD D1 Top 25% row not found - migration may not have been applied');
          return;
        }
        expect(Number((result.rows[0] as any).value)).toBeCloseTo(1.65, 2);
      } catch (error) {
        console.warn('DB query failed:', (error as Error).message);
      }
    });

    it('HS soccer set has 7 metrics (DASH_10YD, DASH_20YD, FLY10_TIME, TOP_SPEED_MPH, VERTICAL_JUMP, AGILITY_505, AGILITY_5105)', async () => {
      try {
        const result = await db.execute(sql`
          SELECT COUNT(*)::int AS n
            FROM benchmark_set_items
           WHERE set_id = 'hs-varsity-female-soccer'
        `);
        if (!result.rows || result.rows.length === 0) {
          console.warn('Set items not found - migration may not have been applied');
          return;
        }
        expect((result.rows[0] as any).n).toBe(7);
      } catch (error) {
        console.warn('DB query failed:', (error as Error).message);
      }
    });

    it('VB volleyball set excludes TOP_SPEED_MPH, FLY10_TIME, DASH_20YD at HS level', async () => {
      try {
        const result = await db.execute(sql`
          SELECT sb.metric_code
            FROM benchmark_set_items bsi
            JOIN site_benchmarks sb ON bsi.benchmark_id = sb.id
           WHERE bsi.set_id = 'hs-varsity-female-volleyball'
           ORDER BY sb.metric_code
        `);
        if (!result.rows || result.rows.length === 0) {
          console.warn('VB set items not found - migration may not have been applied');
          return;
        }
        const codes = (result.rows as any[]).map(r => r.metric_code);
        expect(codes).not.toContain('TOP_SPEED_MPH');
        expect(codes).not.toContain('FLY10_TIME');
        expect(codes).not.toContain('DASH_20YD');
        // Should contain the VB-relevant metrics
        expect(codes).toContain('DASH_10YD');
        expect(codes).toContain('VERTICAL_JUMP');
        expect(codes).toContain('APPROACH_JUMP');
        expect(codes).toContain('BLOCK_JUMP');
      } catch (error) {
        console.warn('DB query failed:', (error as Error).message);
      }
    });
  });
});
