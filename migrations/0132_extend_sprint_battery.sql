-- Migration 0132: Full Sprint Battery — DASH_30YD/40YD + DII/DIII Sets + VB Cleanup
--
-- Spec: AM-FEAT-010 (/home/hulla/devel/bta-company/specs/AM-FEAT-010_full-sprint-battery.md)
--
-- Spec/codebase metric-name reconciliations (codebase wins):
--   spec SPRINT_20YD     → codebase DASH_20YD
--   spec SPRINT_10YD_FLY → codebase FLY10_TIME
--   spec AGILITY_PRO     → codebase AGILITY_5105 (used in AM-FEAT-011, not here)
--
-- Block layout:
--   A — Ensure DASH_30YD / DASH_40YD base metrics exist
--   B — Create DII / DIII women's soccer benchmark sets
--   C — D1 women's soccer rows for the new metrics (DASH_30YD, DASH_40YD)
--   D — HS age-grouped soccer rows for the new metrics
--   E — DII soccer sprint tier rows (5 distances)
--   F — DIII soccer sprint tier rows (5 distances)
--   G — VB sprint cleanup — remove DASH_20YD linkages + rows from VB sets
--   H — benchmark_set_items linkages for new rows
--   I — RAISE NOTICE summary
--
-- Per spec resolved decisions (John 2026-04-27):
--   * Test corridor: single 40yd run with gates at 10/20/30/40 yd marks
--   * DII/DIII tier coverage: Option B — full benchmark set creation
--   * Per-segment phase analysis: parent-facing on eval one-pager (rendering deferred)
--   * MS DASH_30YD/40YD: seed with LOW-confidence flag
--   * VB sprint scope: reduced to DASH_10YD only — remove DASH_20YD linkages

-- ============================================================================
-- Block A — Ensure DASH_30YD / DASH_40YD exist
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision
) VALUES
  ('DASH_30YD', '30-yard Dash', 'Speed', 's', 'lower_is_better', true, true, 23,
   '30-yard sprint time captured as a split from a 40-yard test corridor (timing gates at 0/10/20/30/40 yd marks). Reveals max-velocity reach phase. Standalone 30yd runs also accepted.', 3),
  ('DASH_40YD', '40-yard Dash', 'Speed', 's', 'lower_is_better', true, true, 24,
   '40-yard sprint time. Primary recruiting metric in US college soccer; sub-5.0s for female = D1 elite recruiting target. Captured from 40yd corridor with 10/20/30/40 yd gates.', 3)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Block B — DII / DIII benchmark sets
-- ============================================================================
INSERT INTO benchmark_sets (id, name, description, sport, level, gender, is_template, is_active)
VALUES
  ('dii-womens-soccer',
   'NCAA DII Women''s Soccer',
   'Benchmark values for NCAA Division II women''s soccer recruiting. Sourced from BTA''s d1-soccer-benchmarks.md §1.3 "Female Recruiting-Level Thresholds". This set initially covers sprint family (10yd, 20yd, 30yd, 40yd, Fly 10); AM-FEAT-011 extends with non-sprint families (5-0-5, Pro Agility, YYIR1).',
   'SOCCER', 'DII', 'Female', true, true),
  ('diii-womens-soccer',
   'NCAA DIII Women''s Soccer',
   'Benchmark values for NCAA Division III women''s soccer recruiting. Sourced from BTA''s d1-soccer-benchmarks.md §1.3. Sprint family seeded here; AM-FEAT-011 extends with non-sprint families.',
   'SOCCER', 'DIII', 'Female', true, true)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  gender = EXCLUDED.gender,
  is_template = EXCLUDED.is_template,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block C — D1 women's soccer rows for DASH_30YD / DASH_40YD
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level,
  is_system_default, is_active, display_order
) VALUES
  ('d1-soc-dash30-d1-avg',
   'DASH_30YD', 'Soccer D1 Average',
   '~4.20s. Stankovic 2025 (national-team-selected female 30m: 4.49-4.78s × 0.914 yd conversion). Confidence: MEDIUM.',
   'lte', 4.200, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', true, true, 2),
  ('d1-soc-dash30-d1-top25',
   'DASH_30YD', 'Soccer D1 Top 25%',
   '~4.05s. Extrapolated from D1 elite 30m thresholds. Confidence: MEDIUM-LOW.',
   'lte', 4.050, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', true, true, 3),
  ('d1-soc-dash40-d1-avg',
   'DASH_40YD', 'Soccer D1 Average',
   '~5.10s. Aggregated US recruiting data (NCSA, college program data). Confidence: MEDIUM-HIGH.',
   'lte', 5.100, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', true, true, 2),
  ('d1-soc-dash40-d1-top25',
   'DASH_40YD', 'Soccer D1 Top 25%',
   '~4.95s. Sub-5.0s = recruiting elite threshold; All-American level. Confidence: MEDIUM-HIGH.',
   'lte', 4.950, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', true, true, 3)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true, updated_at = NOW();

-- ============================================================================
-- Block D — HS age-grouped soccer rows for DASH_30YD / DASH_40YD
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level, age_min, age_max,
  is_system_default, is_active, display_order
) VALUES
  -- DASH_30YD HS rows
  ('hs-ms-soc-dash30',
   'DASH_30YD', 'HS MS Female Soccer (Ages 11-13) Average',
   '~5.10s. Confidence: LOW — estimated, pending BTA internal data accumulation.',
   'lte', 5.100, 'MS Average', 'gray', 'Female', 'SOCCER', 'HS', 11, 13, true, true, 1),
  ('hs-jv-soc-dash30',
   'DASH_30YD', 'HS JV Female Soccer (Ages 14-15) Average',
   '~4.70s. Confidence: MEDIUM. Extrapolated from age-band sprint development curves.',
   'lte', 4.700, 'JV Average', 'gray', 'Female', 'SOCCER', 'HS', 14, 15, true, true, 1),
  ('hs-var-soc-dash30',
   'DASH_30YD', 'HS Varsity Female Soccer (Ages 16-18) Average',
   '~4.40s. Confidence: MEDIUM.',
   'lte', 4.400, 'Varsity Average', 'gray', 'Female', 'SOCCER', 'HS', 16, 18, true, true, 1),

  -- DASH_40YD HS rows
  ('hs-ms-soc-dash40',
   'DASH_40YD', 'HS MS Female Soccer (Ages 11-13) Average',
   '~6.30s. Confidence: LOW — estimated, pending BTA internal data.',
   'lte', 6.300, 'MS Average', 'gray', 'Female', 'SOCCER', 'HS', 11, 13, true, true, 1),
  ('hs-jv-soc-dash40',
   'DASH_40YD', 'HS JV Female Soccer (Ages 14-15) Average',
   '~5.85s. Confidence: MEDIUM.',
   'lte', 5.850, 'JV Average', 'gray', 'Female', 'SOCCER', 'HS', 14, 15, true, true, 1),
  ('hs-var-soc-dash40-avg',
   'DASH_40YD', 'HS Varsity Female Soccer (Ages 16-18) Average',
   '~5.50s. Confidence: MEDIUM.',
   'lte', 5.500, 'Varsity Average', 'gray', 'Female', 'SOCCER', 'HS', 16, 18, true, true, 1),
  ('hs-var-soc-dash40-top25',
   'DASH_40YD', 'HS Varsity Female Soccer (Ages 16-18) Top 25%',
   '~5.20s. Approaches D1 Average — high-tier HS achievable. Confidence: MEDIUM.',
   'lte', 5.200, 'Varsity Top 25%', 'green', 'Female', 'SOCCER', 'HS', 16, 18, true, true, 2)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true, updated_at = NOW();

-- ============================================================================
-- Block E — DII soccer sprint tier rows (5 distances)
-- Per spec Part 3 table — Female Recruiting-Level Thresholds
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level,
  is_system_default, is_active, display_order
) VALUES
  ('dii-soc-dash10-thresh',
   'DASH_10YD', 'Soccer DII Threshold',
   '< 1.89s. NCSA/AVCA recruiting standards. Confidence: MEDIUM-HIGH.',
   'lte', 1.890, 'DII Threshold', 'blue', 'Female', 'SOCCER', 'DII', true, true, 1),
  ('dii-soc-dash20-thresh',
   'DASH_20YD', 'Soccer DII Threshold',
   '< 3.20s. Extrapolated from D1 thresholds. Confidence: MEDIUM.',
   'lte', 3.200, 'DII Threshold', 'blue', 'Female', 'SOCCER', 'DII', true, true, 2),
  ('dii-soc-dash30-thresh',
   'DASH_30YD', 'Soccer DII Threshold',
   '< 4.30s. Extrapolated from D1 thresholds. Confidence: MEDIUM.',
   'lte', 4.300, 'DII Threshold', 'blue', 'Female', 'SOCCER', 'DII', true, true, 3),
  ('dii-soc-dash40-thresh',
   'DASH_40YD', 'Soccer DII Threshold',
   '< 5.30s. NCSA recruiting standards. Confidence: MEDIUM-HIGH.',
   'lte', 5.300, 'DII Threshold', 'blue', 'Female', 'SOCCER', 'DII', true, true, 4),
  ('dii-soc-fly10-thresh',
   'FLY10_TIME', 'Soccer DII Threshold',
   '< 1.19s. Recruiting standards. Confidence: MEDIUM-HIGH.',
   'lte', 1.190, 'DII Threshold', 'blue', 'Female', 'SOCCER', 'DII', true, true, 5)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true, updated_at = NOW();

-- ============================================================================
-- Block F — DIII soccer sprint tier rows (5 distances)
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level,
  is_system_default, is_active, display_order
) VALUES
  ('diii-soc-dash10-thresh',
   'DASH_10YD', 'Soccer DIII Threshold',
   '< 1.98s. NCSA recruiting standards. Confidence: MEDIUM-HIGH.',
   'lte', 1.980, 'DIII Threshold', 'gray', 'Female', 'SOCCER', 'DIII', true, true, 1),
  ('diii-soc-dash20-thresh',
   'DASH_20YD', 'Soccer DIII Threshold',
   '< 3.30s. Extrapolated. Confidence: MEDIUM.',
   'lte', 3.300, 'DIII Threshold', 'gray', 'Female', 'SOCCER', 'DIII', true, true, 2),
  ('diii-soc-dash30-thresh',
   'DASH_30YD', 'Soccer DIII Threshold',
   '< 4.50s. Extrapolated. Confidence: MEDIUM.',
   'lte', 4.500, 'DIII Threshold', 'gray', 'Female', 'SOCCER', 'DIII', true, true, 3),
  ('diii-soc-dash40-thresh',
   'DASH_40YD', 'Soccer DIII Threshold',
   '< 5.60s. NCSA recruiting standards. Confidence: MEDIUM-HIGH.',
   'lte', 5.600, 'DIII Threshold', 'gray', 'Female', 'SOCCER', 'DIII', true, true, 4),
  ('diii-soc-fly10-thresh',
   'FLY10_TIME', 'Soccer DIII Threshold',
   '< 1.28s. Recruiting standards. Confidence: MEDIUM-HIGH.',
   'lte', 1.280, 'DIII Threshold', 'gray', 'Female', 'SOCCER', 'DIII', true, true, 5)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true, updated_at = NOW();

-- ============================================================================
-- Block G — VB sprint scope cleanup
-- Remove benchmark_set_items linking DASH_20YD to d1-womens-volleyball
-- (per AM-FEAT-007, that set has 3 DASH_20YD rows: HS Avg, D1 Avg, D1 Top 25%)
-- and remove the orphan site_benchmarks rows.
-- Soft deprecation — preserves measurement data; only the comparison surface removed.
-- ============================================================================
DELETE FROM benchmark_set_items
 WHERE set_id = 'd1-womens-volleyball'
   AND benchmark_id IN ('d1-vb-dash20-hs-avg','d1-vb-dash20-d1-avg','d1-vb-dash20-d1-top25');

DELETE FROM site_benchmarks
 WHERE id IN ('d1-vb-dash20-hs-avg','d1-vb-dash20-d1-avg','d1-vb-dash20-d1-top25');

-- ============================================================================
-- Block H — benchmark_set_items linkages for new rows
-- ============================================================================
INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
VALUES
  -- D1 soccer (new metrics)
  ('bsi-d1-soc-dash30-d1-avg',   'd1-womens-soccer','d1-soc-dash30-d1-avg',   'site',20),
  ('bsi-d1-soc-dash30-d1-top25', 'd1-womens-soccer','d1-soc-dash30-d1-top25', 'site',21),
  ('bsi-d1-soc-dash40-d1-avg',   'd1-womens-soccer','d1-soc-dash40-d1-avg',   'site',22),
  ('bsi-d1-soc-dash40-d1-top25', 'd1-womens-soccer','d1-soc-dash40-d1-top25', 'site',23),

  -- HS soccer (new metrics)
  ('bsi-hs-ms-soc-dash30',         'hs-ms-female-soccer',     'hs-ms-soc-dash30',         'site',20),
  ('bsi-hs-jv-soc-dash30',         'hs-jv-female-soccer',     'hs-jv-soc-dash30',         'site',20),
  ('bsi-hs-var-soc-dash30',        'hs-varsity-female-soccer','hs-var-soc-dash30',        'site',20),
  ('bsi-hs-ms-soc-dash40',         'hs-ms-female-soccer',     'hs-ms-soc-dash40',         'site',21),
  ('bsi-hs-jv-soc-dash40',         'hs-jv-female-soccer',     'hs-jv-soc-dash40',         'site',21),
  ('bsi-hs-var-soc-dash40-avg',    'hs-varsity-female-soccer','hs-var-soc-dash40-avg',    'site',21),
  ('bsi-hs-var-soc-dash40-top25',  'hs-varsity-female-soccer','hs-var-soc-dash40-top25',  'site',22),

  -- DII soccer
  ('bsi-dii-soc-dash10', 'dii-womens-soccer','dii-soc-dash10-thresh','site',1),
  ('bsi-dii-soc-dash20', 'dii-womens-soccer','dii-soc-dash20-thresh','site',2),
  ('bsi-dii-soc-dash30', 'dii-womens-soccer','dii-soc-dash30-thresh','site',3),
  ('bsi-dii-soc-dash40', 'dii-womens-soccer','dii-soc-dash40-thresh','site',4),
  ('bsi-dii-soc-fly10',  'dii-womens-soccer','dii-soc-fly10-thresh','site',5),

  -- DIII soccer
  ('bsi-diii-soc-dash10','diii-womens-soccer','diii-soc-dash10-thresh','site',1),
  ('bsi-diii-soc-dash20','diii-womens-soccer','diii-soc-dash20-thresh','site',2),
  ('bsi-diii-soc-dash30','diii-womens-soccer','diii-soc-dash30-thresh','site',3),
  ('bsi-diii-soc-dash40','diii-womens-soccer','diii-soc-dash40-thresh','site',4),
  ('bsi-diii-soc-fly10', 'diii-womens-soccer','diii-soc-fly10-thresh','site',5)
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block I — Summary
-- ============================================================================
DO $$
DECLARE
  v_dii  INTEGER;
  v_diii INTEGER;
  v_d1_new INTEGER;
  v_hs_new INTEGER;
  v_vb_cleanup INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_dii  FROM site_benchmarks WHERE id LIKE 'dii-soc-%';
  SELECT COUNT(*) INTO v_diii FROM site_benchmarks WHERE id LIKE 'diii-soc-%';
  SELECT COUNT(*) INTO v_d1_new FROM site_benchmarks WHERE id LIKE 'd1-soc-dash30-%' OR id LIKE 'd1-soc-dash40-%';
  SELECT COUNT(*) INTO v_hs_new FROM site_benchmarks WHERE (id LIKE 'hs-%-soc-dash30%' OR id LIKE 'hs-%-soc-dash40%');
  SELECT COUNT(*) INTO v_vb_cleanup FROM site_benchmarks WHERE id IN ('d1-vb-dash20-hs-avg','d1-vb-dash20-d1-avg','d1-vb-dash20-d1-top25');

  RAISE NOTICE 'Migration 0132 complete: DII/DIII sets created, % DII rows + % DIII rows, % D1 + % HS rows for new metrics, % VB DASH_20YD rows removed (expected 0 after cleanup).',
    v_dii, v_diii, v_d1_new, v_hs_new, v_vb_cleanup;
END $$;
