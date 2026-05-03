-- Migration 0133: DII / DIII Non-Sprint Recruiting-Tier Extension
--
-- Spec: AM-FEAT-011 (/home/hulla/devel/bta-company/specs/AM-FEAT-011_dii-diii-non-sprint-tiers.md)
--
-- AM-FEAT-010 (PR #405, merged) created dii-womens-soccer and diii-womens-soccer
-- benchmark sets with full sprint-family DII/DIII coverage (10/20/30/40 yd + Fly 10).
-- AM-FEAT-009 (PR #403, merged) added COND_YYIR1_DISTANCE with D1 baseline tiers.
--
-- This migration completes parent-facing DII/DIII recruiting-tier visibility for
-- non-sprint test families on the eval one-pager:
--   - AGILITY_505 (5-0-5 change of direction)
--   - AGILITY_5105 (Pro Agility / 5-10-5)  -- spec called AGILITY_PRO; codebase code wins
--   - COND_YYIR1_DISTANCE (Yo-Yo IR1)
--
-- Spec/codebase metric-name reconciliation:
--   spec AGILITY_PRO → codebase AGILITY_5105
--
-- Block layout:
--   A — DII threshold rows (3 metrics × 1 tier = 3 rows)
--   B — DIII threshold rows (3 metrics × 1 tier = 3 rows)
--   C — benchmark_set_items linkages (6 rows total)
--   D — RAISE NOTICE summary
--
-- Per spec (no open questions; pure additive seeding):
--   - Strength metrics deferred (not yet in AthleteMetrics base metrics)
--   - RSA metrics deferred (Tier 3 of roadmap)
--   - Jump metrics deferred (no DII/DIII threshold table in source docs)
--   - Volleyball DII/DIII deferred (separate VB-focused spec)

-- ============================================================================
-- Block A — DII soccer non-sprint thresholds
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level,
  is_system_default, is_active, display_order
) VALUES
  ('dii-soc-505-thresh',
   'AGILITY_505', 'Soccer DII Threshold',
   '< 2.68s. Jones 2018 (D2 mean 2.64-2.68s); midpoint of D2 collegiate female cohort. Confidence: MEDIUM-HIGH.',
   'lte', 2.680, 'DII Threshold', 'blue', 'Female', 'SOCCER', 'DII', true, true, 6),

  ('dii-soc-pro-thresh',
   'AGILITY_5105', 'Soccer DII Threshold',
   '< 5.30s. Extrapolated from D1 baseline (4.95s) and recruiting standards literature; less direct DII cohort data than 5-0-5. Confidence: MEDIUM.',
   'lte', 5.300, 'DII Threshold', 'blue', 'Female', 'SOCCER', 'DII', true, true, 7),

  ('dii-soc-yyir1-thresh',
   'COND_YYIR1_DISTANCE', 'Soccer DII Threshold',
   '> 1,200 m. Extrapolated below D1 mean (~1,323 m); BTA d1-soccer-benchmarks.md §5 Female Recruiting-Level Thresholds. Confidence: MEDIUM.',
   'gte', 1200.000, 'DII Threshold', 'blue', 'Female', 'SOCCER', 'DII', true, true, 8)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block B — DIII soccer non-sprint thresholds
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level,
  is_system_default, is_active, display_order
) VALUES
  ('diii-soc-505-thresh',
   'AGILITY_505', 'Soccer DIII Threshold',
   '< 2.70s. Extrapolated from recruiting standards literature; close to DII threshold given limited DIII-specific data. Confidence: MEDIUM.',
   'lte', 2.700, 'DIII Threshold', 'gray', 'Female', 'SOCCER', 'DIII', true, true, 6),

  ('diii-soc-pro-thresh',
   'AGILITY_5105', 'Soccer DIII Threshold',
   '< 5.50s. Extrapolated; less direct cohort data than 5-0-5. Confidence: MEDIUM.',
   'lte', 5.500, 'DIII Threshold', 'gray', 'Female', 'SOCCER', 'DIII', true, true, 7),

  ('diii-soc-yyir1-thresh',
   'COND_YYIR1_DISTANCE', 'Soccer DIII Threshold',
   '> 1,000 m. Extrapolated below DII threshold; BTA d1-soccer-benchmarks.md §5 Female Recruiting-Level Thresholds. Confidence: MEDIUM.',
   'gte', 1000.000, 'DIII Threshold', 'gray', 'Female', 'SOCCER', 'DIII', true, true, 8)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block C — benchmark_set_items linking the new rows
-- ============================================================================
INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
VALUES
  -- DII soccer (extends sprint-family rows from AM-FEAT-010)
  ('bsi-dii-soc-505',   'dii-womens-soccer',  'dii-soc-505-thresh',   'site', 6),
  ('bsi-dii-soc-pro',   'dii-womens-soccer',  'dii-soc-pro-thresh',   'site', 7),
  ('bsi-dii-soc-yyir1', 'dii-womens-soccer',  'dii-soc-yyir1-thresh', 'site', 8),
  -- DIII soccer
  ('bsi-diii-soc-505',   'diii-womens-soccer','diii-soc-505-thresh',   'site', 6),
  ('bsi-diii-soc-pro',   'diii-womens-soccer','diii-soc-pro-thresh',   'site', 7),
  ('bsi-diii-soc-yyir1', 'diii-womens-soccer','diii-soc-yyir1-thresh', 'site', 8)
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block D — Summary
-- ============================================================================
DO $$
DECLARE
  v_dii  INTEGER;
  v_diii INTEGER;
  v_set_items INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dii  FROM site_benchmarks WHERE id IN ('dii-soc-505-thresh','dii-soc-pro-thresh','dii-soc-yyir1-thresh');
  SELECT COUNT(*) INTO v_diii FROM site_benchmarks WHERE id IN ('diii-soc-505-thresh','diii-soc-pro-thresh','diii-soc-yyir1-thresh');
  SELECT COUNT(*) INTO v_set_items FROM benchmark_set_items WHERE id LIKE 'bsi-d%-soc-505' OR id LIKE 'bsi-d%-soc-pro' OR id LIKE 'bsi-d%-soc-yyir1';

  RAISE NOTICE 'Migration 0133 complete: % DII rows + % DIII rows for non-sprint metrics, % set_items.',
    v_dii, v_diii, v_set_items;
END $$;
