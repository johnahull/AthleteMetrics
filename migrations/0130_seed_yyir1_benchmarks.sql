-- Migration 0130: Yo-Yo IR1 Benchmark Seeding + VO₂max Derived Metric
--
-- Spec: AM-FEAT-009 (/home/hulla/devel/bta-company/specs/AM-FEAT-009_yo-yo-ir1-seeding.md)
--
-- Adds the COND_YYIR1_DISTANCE base metric (intermittent aerobic capacity) and
-- the COND_VO2MAX_EST derived metric (Bangsbo regression formula). Seeds D1
-- women's soccer + HS age-grouped soccer benchmark tiers per the spec.
--
-- Volleyball NOT in scope per spec (YYIR1 doesn't match VB match demands —
-- short rallies + long rests vs. soccer's continuous intermittent profile).
--
-- Block layout:
--   A — COND_YYIR1_DISTANCE base metric (ON CONFLICT DO NOTHING — preserve
--       existing definition if one exists)
--   B — COND_VO2MAX_EST derived metric (ON CONFLICT DO UPDATE — formula is
--       authoritative from this migration)
--   C — D1 women's soccer YYIR1 benchmark rows
--   D — HS age-grouped soccer YYIR1 benchmark rows (MS / JV / Varsity)
--   E — benchmark_set_items linkages
--   F — RAISE NOTICE summary
--
-- Per spec resolved decisions (John 2026-04-27):
--   * VO₂max derived metric: defined as proper derived metric using Bangsbo
--     regression; same pattern as AGILITY_505_LSI in AM-FEAT-008.
--   * MS-tier value (~750 m): seed with LOW-confidence flag.
--   * DII/DIII thresholds: inline note in D1 row descriptions (Option A);
--     proper DII/DIII benchmark sets land in AM-FEAT-011.
--   * Volleyball: not in scope.
--   * RSI / position-specific norms: explicitly out of scope.

-- ============================================================================
-- Block A — COND_YYIR1_DISTANCE base metric
-- ON CONFLICT DO NOTHING preserves any existing definition.
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max
) VALUES (
  'COND_YYIR1_DISTANCE',
  'Yo-Yo IR1 Distance',
  'conditioning',
  'm',
  'higher_is_better',
  true, true,
  60,
  'Yo-Yo Intermittent Recovery Test Level 1 — total distance covered (meters). Bangsbo et al. protocol: shuttle runs over 20m with progressive speed cues; athletes drop out when they fail to reach the line on time. Validated indicator of intermittent aerobic capacity in soccer; correlates strongly with high-intensity match-running and VO₂max.',
  0, 'orange', 'Activity',
  0, 4000
)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Block B — COND_VO2MAX_EST derived metric
-- Bangsbo regression formula: VO₂max ≈ (distance × 0.0084) + 36.4
-- Pattern matches AGILITY_505_LSI from migration 0128.
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max,
  is_derived, formula, dependent_metrics, calculation_config
) VALUES (
  'COND_VO2MAX_EST',
  'Estimated VO₂max (from YYIR1)',
  'conditioning',
  'mL/kg/min',
  'higher_is_better',
  true, true,
  61,
  'Estimated maximal oxygen uptake derived from YYIR1 distance via the Bangsbo regression: (distance × 0.0084) + 36.4. Provides a parent-comprehensible fitness translation alongside the raw YYIR1 distance. Standard conversion in soccer S&C literature.',
  1, 'orange', 'Activity',
  20, 80,
  true,
  '(COND_YYIR1_DISTANCE * 0.0084) + 36.4',
  ARRAY['COND_YYIR1_DISTANCE'],
  '{"dateMatchStrategy":"same_date","missingSourceBehavior":"skip"}'::jsonb
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  formula = EXCLUDED.formula,
  dependent_metrics = EXCLUDED.dependent_metrics,
  calculation_config = EXCLUDED.calculation_config,
  is_derived = EXCLUDED.is_derived,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  display_order = EXCLUDED.display_order,
  decimal_precision = EXCLUDED.decimal_precision,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon,
  category = EXCLUDED.category,
  is_system_default = EXCLUDED.is_system_default,
  is_active = true;

-- ============================================================================
-- Block C — D1 women's soccer YYIR1 benchmark rows
-- Per spec Part 2 + Part 4 inline DII/DIII threshold notes (Option A).
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level,
  is_system_default, is_active, display_order
) VALUES
  ('d1-soc-yyir1-hs-avg',
   'COND_YYIR1_DISTANCE', 'Soccer HS Average',
   'HS-female aerobic baseline: 800-1100 m range (midpoint 950 m), speed level ~14.0-15.5. Confidence: MEDIUM. Source: aggregated youth aerobic data.',
   'gte', 950.000, 'HS Average', 'gray', 'Female', 'SOCCER', 'HS', true, true, 1),

  ('d1-soc-yyir1-d1-avg',
   'COND_YYIR1_DISTANCE', 'Soccer D1 Average',
   'D1 women''s soccer baseline: 1200-1400 m range (Lockie 2016 PMC5466405-style multi-program: ~1323 ± 211 m), speed level ~16.0. Confidence: HIGH. Cross-tier recruiting note: DII threshold > 1,200 m; DIII threshold > 1,000 m. Sources: Lockie 2016, Compton 2025 meta.',
   'gte', 1300.000, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', true, true, 2),

  ('d1-soc-yyir1-d1-top25',
   'COND_YYIR1_DISTANCE', 'Soccer D1 Top 25%',
   'D1 starters: 1500-1800 m range (Lockie & Moreno 2016 D1 starters: 1628 ± 481 m), speed level 16.5-17.5. Confidence: HIGH.',
   'gte', 1650.000, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', true, true, 3),

  ('d1-soc-yyir1-elite',
   'COND_YYIR1_DISTANCE', 'Soccer Elite/Pro Threshold',
   'Elite / pro female cohorts: > 1700 m, speed level 17.5+. Multi-source pro female aggregated data. Confidence: HIGH.',
   'gte', 1700.000, 'Elite/Pro', 'green', 'Female', 'SOCCER', 'D1', true, true, 4)
-- Conflict target is the explicit id PK so re-runs don't trip the PK before
-- the arbiter index (see ON CONFLICT index inference: only conflicts on the
-- inferred constraint are caught; PK conflicts on any other constraint raise).
-- TODO AM-FEAT-011: 'd1-soc-yyir1-elite' uses level='D1' because there is no
-- 'Pro' value in the level enum yet. Change to level='Pro' once the enum is
-- extended; level='D1' filters currently include this Elite/Pro row, which
-- inflates D1 ranges in level-filtered comparisons.
ON CONFLICT (id) DO UPDATE SET
  metric_code = EXCLUDED.metric_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  display_order = EXCLUDED.display_order,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block D — HS age-grouped soccer YYIR1 rows
-- Per spec Part 3.
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level, age_min, age_max,
  is_system_default, is_active, display_order
) VALUES
  ('hs-ms-soc-yyir1',
   'COND_YYIR1_DISTANCE', 'HS MS Female Soccer (Ages 11-13) Average',
   '~750 m. Confidence: LOW — estimated from youth aerobic literature, pending BTA internal data accumulation. Limited published MS-age female YYIR1 norms.',
   'gte', 750.000, 'MS Average', 'gray', 'Female', 'SOCCER', 'HS', 11, 13, true, true, 1),

  ('hs-jv-soc-yyir1',
   'COND_YYIR1_DISTANCE', 'HS JV Female Soccer (Ages 14-15) Average',
   '~950 m. Confidence: MEDIUM. Extrapolated from youth aerobic development curves and youth soccer cohorts.',
   'gte', 950.000, 'JV Average', 'gray', 'Female', 'SOCCER', 'HS', 14, 15, true, true, 1),

  ('hs-var-soc-yyir1-avg',
   'COND_YYIR1_DISTANCE', 'HS Varsity Female Soccer (Ages 16-18) Average',
   '~1000 m. Confidence: MEDIUM. Aggregated HS-varsity female aerobic data.',
   'gte', 1000.000, 'Varsity Average', 'gray', 'Female', 'SOCCER', 'HS', 16, 18, true, true, 1),

  ('hs-var-soc-yyir1-top25',
   'COND_YYIR1_DISTANCE', 'HS Varsity Female Soccer (Ages 16-18) Top 25%',
   '~1400 m. Approaches D1 Average — high-tier HS achievable. Confidence: MEDIUM.',
   'gte', 1400.000, 'Varsity Top 25%', 'green', 'Female', 'SOCCER', 'HS', 16, 18, true, true, 2)
ON CONFLICT (id) DO UPDATE SET
  metric_code = EXCLUDED.metric_code,
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  display_order = EXCLUDED.display_order,
  age_min = EXCLUDED.age_min,
  age_max = EXCLUDED.age_max,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block E — benchmark_set_items linkages
--
-- Requires: migration 0129 (PR #402) must have seeded the d1-womens-soccer
-- set and the three hs-{ms,jv,varsity}-female-soccer sets. If 0129 has not
-- been applied first, these inserts will fail with a foreign-key violation.
-- ============================================================================
INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
VALUES
  -- D1 women's soccer
  ('bsi-d1-soc-yyir1-hs-avg',   'd1-womens-soccer',         'd1-soc-yyir1-hs-avg',   'site', 50),
  ('bsi-d1-soc-yyir1-d1-avg',   'd1-womens-soccer',         'd1-soc-yyir1-d1-avg',   'site', 51),
  ('bsi-d1-soc-yyir1-d1-top25', 'd1-womens-soccer',         'd1-soc-yyir1-d1-top25', 'site', 52),
  ('bsi-d1-soc-yyir1-elite',    'd1-womens-soccer',         'd1-soc-yyir1-elite',    'site', 53),

  -- HS age-grouped soccer
  ('bsi-hs-ms-soc-yyir1',         'hs-ms-female-soccer',      'hs-ms-soc-yyir1',         'site', 50),
  ('bsi-hs-jv-soc-yyir1',         'hs-jv-female-soccer',      'hs-jv-soc-yyir1',         'site', 50),
  ('bsi-hs-var-soc-yyir1-avg',    'hs-varsity-female-soccer', 'hs-var-soc-yyir1-avg',    'site', 50),
  ('bsi-hs-var-soc-yyir1-top25',  'hs-varsity-female-soccer', 'hs-var-soc-yyir1-top25',  'site', 51)
ON CONFLICT (id) DO UPDATE SET
  set_id = EXCLUDED.set_id,
  benchmark_id = EXCLUDED.benchmark_id,
  benchmark_type = EXCLUDED.benchmark_type,
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block F — Summary
-- ============================================================================
DO $$
DECLARE
  v_yyir1_rows INTEGER;
  v_set_items  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_yyir1_rows FROM site_benchmarks WHERE metric_code = 'COND_YYIR1_DISTANCE';
  SELECT COUNT(*) INTO v_set_items FROM benchmark_set_items WHERE benchmark_id LIKE '%yyir1%';

  RAISE NOTICE 'Migration 0130 complete: COND_YYIR1_DISTANCE + COND_VO2MAX_EST metrics, % YYIR1 benchmark rows, % YYIR1 set_items.',
    v_yyir1_rows, v_set_items;
END $$;
