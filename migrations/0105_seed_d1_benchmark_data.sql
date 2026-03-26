-- Migration 0105: Seed D1 & HS Benchmark Data for Female Soccer & Volleyball
--
-- This migration:
-- 1. Adds DASH_10YD and APPROACH_JUMP to site_metrics (missing from initial seed)
-- 2. Creates benchmark sets for "NCAA D1 Women's Soccer" and "NCAA D1 Women's Volleyball"
-- 3. Seeds site_benchmarks with researched D1/HS values from peer-reviewed sources
-- 4. Links benchmarks to sets via benchmark_set_items
--
-- Sources: PMC5466405 (McCurdy/Lockie), PMC7725048 (Sattler), PMC6315647 (Sole/Suchomel),
--          NCSA/AVCA recruiting data, TopEndSports, SportScienceInsider
-- Full research: bta-business/docs/d1-benchmark-research.md
--
-- All benchmarks are:
--   - isSystemDefault: true (cannot be deleted by org admins)
--   - gender: 'Female'
--   - Filterable by sport: 'SOCCER' or 'VOLLEYBALL'
--
-- NOTE: RSI values use RSI-modified (CMJ-based, range 0.1-0.6) per Sole et al. 2018
--        NOT traditional RSI (drop jump, range 0.5-2.5+)

-- ============================================================================
-- STEP 1: Add missing metrics (DASH_10YD, APPROACH_JUMP)
-- ============================================================================

INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, description, decimal_precision, color, icon)
VALUES
  ('DASH_10YD', '10-Yard Dash', 'speed', 's', 'lower_is_better', true, true, 0,
   'Time to sprint 10 yards from a stationary start, measuring acceleration and first-step quickness.',
   3, 'blue', 'Timer'),
  ('APPROACH_JUMP', 'Approach Jump', 'power', 'in', 'higher_is_better', true, true, 9,
   'Maximum vertical displacement during an approach/attack jump. Primary volleyball recruiting metric.',
   1, 'purple', 'ArrowUp')
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  category = EXCLUDED.category,
  unit = EXCLUDED.unit,
  metric_type = EXCLUDED.metric_type,
  is_system_default = EXCLUDED.is_system_default,
  is_active = EXCLUDED.is_active,
  description = EXCLUDED.description,
  decimal_precision = EXCLUDED.decimal_precision,
  color = EXCLUDED.color,
  icon = EXCLUDED.icon;

-- ============================================================================
-- STEP 2: Create Benchmark Sets
-- ============================================================================

-- NCAA D1 Women's Soccer benchmark set (site-level template)
-- Using deterministic IDs so this migration is idempotent
INSERT INTO benchmark_sets (id, name, description, sport, level, gender, is_template, is_active)
VALUES (
  'd1-womens-soccer',
  'NCAA D1 Women''s Soccer',
  'Benchmark values for NCAA Division 1 women''s soccer athletes. Compiled from peer-reviewed research (PMC5466405, PMC7725048) and D1 program data (Stanford, Auburn, Mississippi State). Values represent electronic timing.',
  'SOCCER',
  'D1',
  'Female',
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  gender = EXCLUDED.gender,
  is_template = EXCLUDED.is_template;

-- NCAA D1 Women's Volleyball benchmark set (site-level template)
INSERT INTO benchmark_sets (id, name, description, sport, level, gender, is_template, is_active)
VALUES (
  'd1-womens-volleyball',
  'NCAA D1 Women''s Volleyball',
  'Benchmark values for NCAA Division 1 women''s volleyball athletes. Compiled from peer-reviewed research (PMC7725048, NCSA/AVCA recruiting data, Dynamite Sports). Values represent electronic timing.',
  'VOLLEYBALL',
  'D1',
  'Female',
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  gender = EXCLUDED.gender,
  is_template = EXCLUDED.is_template;

-- HS Female baseline benchmark set
INSERT INTO benchmark_sets (id, name, description, sport, level, gender, is_template, is_active)
VALUES (
  'hs-female-baseline',
  'HS Female Athlete Baseline',
  'Average high school female athlete performance values across soccer and volleyball. Used as the baseline tier in the evaluation report gauge bars. Sources: NSCA norms, TopEndSports, general population studies.',
  NULL,
  'HS',
  'Female',
  true,
  true
)
ON CONFLICT (id) DO UPDATE SET
  description = EXCLUDED.description,
  level = EXCLUDED.level,
  gender = EXCLUDED.gender,
  is_template = EXCLUDED.is_template;

-- ============================================================================
-- STEP 3: Seed Site Benchmarks — NCAA D1 Women's Soccer
-- ============================================================================
-- Naming convention: "{Sport} {Level} {Tier}" e.g., "Soccer D1 Average"
-- Tier system: hs_avg → d1_avg → d1_top25 (maps to eval report gauge bar zones)

-- DASH_10YD — Soccer
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-soccer-dash10-hs', 'DASH_10YD', 'Soccer HS Average', 1.900, 'lte', 'Female', 'SOCCER', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Average HS female soccer athlete 10yd dash. Estimated from published 10m data with conversion.'),
  ('d1-soccer-dash10-avg', 'DASH_10YD', 'Soccer D1 Average', 1.750, 'lte', 'Female', 'SOCCER', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'D1 avg from PMC5466405 (Lockie 2016, n=22, electronic timing). 10m starters 1.98±0.05s, converted to 10yd.'),
  ('d1-soccer-dash10-top25', 'DASH_10YD', 'Soccer D1 Top 25%', 1.620, 'lte', 'Female', 'SOCCER', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'D1 top 25% estimated from PMC5466405 mean - 1SD. Auburn program data: many sub-1.7s at 10m.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  comparison_operator = EXCLUDED.comparison_operator,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- FLY10_TIME — Soccer
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-soccer-fly10-hs', 'FLY10_TIME', 'Soccer HS Average', 1.420, 'lte', 'Female', 'SOCCER', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Estimated HS avg. Low confidence — no published flying 10 norms exist for female athletes.'),
  ('d1-soccer-fly10-avg', 'FLY10_TIME', 'Soccer D1 Average', 1.280, 'lte', 'Female', 'SOCCER', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'Estimated from Vescovi 2012 peak speed derivation. Flag as "BTA Internal Benchmark" until BTA data validates.'),
  ('d1-soccer-fly10-top25', 'FLY10_TIME', 'Soccer D1 Top 25%', 1.130, 'lte', 'Female', 'SOCCER', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated from Auburn 15yd fly ~1.1s data. Needs validation with internal data.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- VERTICAL_JUMP — Soccer
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-soccer-vj-hs', 'VERTICAL_JUMP', 'Soccer HS Average', 15.000, 'gte', 'Female', 'SOCCER', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Average HS female VJ from TopEndSports/NSCA norms (14-16 inch range, midpoint 15.0).'),
  ('d1-soccer-vj-avg', 'VERTICAL_JUMP', 'Soccer D1 Average', 19.700, 'gte', 'Female', 'SOCCER', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'D1 avg from PMC5466405: 0.50±0.04m = 19.7±1.6" (n=22). High confidence.'),
  ('d1-soccer-vj-top25', 'VERTICAL_JUMP', 'Soccer D1 Top 25%', 22.000, 'gte', 'Female', 'SOCCER', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated from PMC5466405 mean + 1SD (~21.3") rounded to 22.0".')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  comparison_operator = EXCLUDED.comparison_operator,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- AGILITY_505 — Soccer
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-soccer-505-hs', 'AGILITY_505', 'Soccer HS Average', 2.800, 'lte', 'Female', 'SOCCER', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Estimated HS avg from SportScienceInsider female norms (2.80-3.00 range).'),
  ('d1-soccer-505-avg', 'AGILITY_505', 'Soccer D1 Average', 2.200, 'lte', 'Female', 'SOCCER', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'Mississippi State D1 program data: 2.2s avg. Much faster than general published norms (D2: 2.64-2.68s).'),
  ('d1-soccer-505-top25', 'AGILITY_505', 'Soccer D1 Top 25%', 2.050, 'lte', 'Female', 'SOCCER', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated elite from Miss State data. Medium confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- AGILITY_5105 (Pro Agility) — Soccer
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-soccer-5105-hs', 'AGILITY_5105', 'Soccer HS Average', 5.300, 'lte', 'Female', 'SOCCER', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Estimated HS avg from D1 data with typical HS-to-D1 gap (~0.25s).'),
  ('d1-soccer-5105-avg', 'AGILITY_5105', 'Soccer D1 Average', 5.060, 'lte', 'Female', 'SOCCER', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'D1 avg from PMC5466405 (Lockie 2016): starters 5.04±0.17s, non-starters 5.09±0.17s (n=22). HIGH confidence.'),
  ('d1-soccer-5105-top25', 'AGILITY_5105', 'Soccer D1 Top 25%', 4.900, 'lte', 'Female', 'SOCCER', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated from PMC5466405 mean - 1SD (5.06 - 0.17 ≈ 4.89, rounded to 4.90). HIGH confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- RSI (RSImod) — Soccer (using multi-sport D1 female data)
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-soccer-rsi-hs', 'RSI', 'Soccer HS Average', 0.220, 'gte', 'Female', 'SOCCER', 'HS', true, true, 1, 'HS Average', '#6B7280', 'RSImod 25th percentile from Sole/Suchomel 2018 (PMC6315647, n=75 D1 females). Used as HS baseline.'),
  ('d1-soccer-rsi-avg', 'RSI', 'Soccer D1 Average', 0.308, 'gte', 'Female', 'SOCCER', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'RSImod 50th percentile (median) from Sole/Suchomel 2018 (PMC6315647, n=75 D1 females). HIGH confidence.'),
  ('d1-soccer-rsi-top25', 'RSI', 'Soccer D1 Top 25%', 0.379, 'gte', 'Female', 'SOCCER', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'RSImod 75th percentile from Sole/Suchomel 2018 (PMC6315647). Sport-specific estimate: 0.35-0.42.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  comparison_operator = EXCLUDED.comparison_operator,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- DASH_40YD — Soccer
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-soccer-40yd-hs', 'DASH_40YD', 'Soccer HS Average', 5.500, 'lte', 'Female', 'SOCCER', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Average HS female sport athlete 40yd. General HS data: 5.2-5.6s (sport athletes).'),
  ('d1-soccer-40yd-avg', 'DASH_40YD', 'Soccer D1 Average', 5.050, 'lte', 'Female', 'SOCCER', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'D1 avg from SoccerTalented (D1 <5.0s). Lockie 2016 30m extrapolation: ~5.0-5.2s. MEDIUM confidence.'),
  ('d1-soccer-40yd-top25', 'DASH_40YD', 'Soccer D1 Top 25%', 4.850, 'lte', 'Female', 'SOCCER', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated. Elite HS female: 4.7-5.0s (track sprinters). MEDIUM confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- T_TEST — Soccer
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-soccer-ttest-hs', 'T_TEST', 'Soccer HS Average', 12.000, 'lte', 'Female', 'SOCCER', 'HS', true, true, 1, 'HS Average', '#6B7280', 'TopEndSports female norms: Average 11.5-12.5s. Midpoint 12.0s.'),
  ('d1-soccer-ttest-avg', 'T_TEST', 'Soccer D1 Average', 10.500, 'lte', 'Female', 'SOCCER', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'TopEndSports: Excellent <10.5s. Cross-sectional female footballers: 11.27±0.84s. MEDIUM confidence.'),
  ('d1-soccer-ttest-top25', 'T_TEST', 'Soccer D1 Top 25%', 9.800, 'lte', 'Female', 'SOCCER', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated. MEDIUM confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- ============================================================================
-- STEP 4: Seed Site Benchmarks — NCAA D1 Women's Volleyball
-- ============================================================================

-- DASH_10YD — Volleyball
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-vb-dash10-hs', 'DASH_10YD', 'Volleyball HS Average', 1.950, 'lte', 'Female', 'VOLLEYBALL', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Estimated HS avg. PMC7725048 D1 VB 0-10m = 2.03±0.12s, with 10yd conversion.'),
  ('d1-vb-dash10-avg', 'DASH_10YD', 'Volleyball D1 Average', 1.820, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'D1 avg from PMC7725048 (Sattler): 0-10m = 2.03±0.12s, converted to 10yd (~-0.06s). MEDIUM confidence.'),
  ('d1-vb-dash10-top25', 'DASH_10YD', 'Volleyball D1 Top 25%', 1.700, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated from PMC7725048 mean - 1SD. MEDIUM confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- FLY10_TIME — Volleyball
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-vb-fly10-hs', 'FLY10_TIME', 'Volleyball HS Average', 1.500, 'lte', 'Female', 'VOLLEYBALL', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Estimated. VERY LOW confidence — no published VB flying sprint data exists.'),
  ('d1-vb-fly10-avg', 'FLY10_TIME', 'Volleyball D1 Average', 1.350, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'Estimated from soccer data + body comp offset. VERY LOW confidence.'),
  ('d1-vb-fly10-top25', 'FLY10_TIME', 'Volleyball D1 Top 25%', 1.200, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated. VERY LOW confidence. Replace with BTA internal data ASAP.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- VERTICAL_JUMP — Volleyball
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-vb-vj-hs', 'VERTICAL_JUMP', 'Volleyball HS Average', 15.000, 'gte', 'Female', 'VOLLEYBALL', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Average HS female VJ from TopEndSports/NSCA norms.'),
  ('d1-vb-vj-avg', 'VERTICAL_JUMP', 'Volleyball D1 Average', 20.000, 'gte', 'Female', 'VOLLEYBALL', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'NCSA/AVCA composite D1 avg: OH 19.9-20.5, MB 19.8-20.5, S 18.9, L 18.3. Midpoint ~20.0. HIGH confidence.'),
  ('d1-vb-vj-top25', 'VERTICAL_JUMP', 'Volleyball D1 Top 25%', 23.000, 'gte', 'Female', 'VOLLEYBALL', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'NCSA 80th percentile: OH 22.6, MB 23.1-23.2. Rounded to 23.0. HIGH confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  comparison_operator = EXCLUDED.comparison_operator,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- APPROACH_JUMP — Volleyball only
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-vb-approach-hs', 'APPROACH_JUMP', 'Volleyball HS Average', 20.000, 'gte', 'Female', 'VOLLEYBALL', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Estimated HS avg approach jump displacement (18-22 range, midpoint 20.0).'),
  ('d1-vb-approach-avg', 'APPROACH_JUMP', 'Volleyball D1 Average', 24.000, 'gte', 'Female', 'VOLLEYBALL', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'PMC7725048 (Sattler): D1 VB approach jump = 59.81±9.71cm (23.5±3.8"). Rounded to 24.0". HIGH confidence.'),
  ('d1-vb-approach-top25', 'APPROACH_JUMP', 'Volleyball D1 Top 25%', 28.000, 'gte', 'Female', 'VOLLEYBALL', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated from NCSA/Dynamite Sports D1 Tier 1 targets. MEDIUM confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  comparison_operator = EXCLUDED.comparison_operator,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- AGILITY_505 — Volleyball
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-vb-505-hs', 'AGILITY_505', 'Volleyball HS Average', 2.900, 'lte', 'Female', 'VOLLEYBALL', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Estimated from general female norms. LOW confidence.'),
  ('d1-vb-505-avg', 'AGILITY_505', 'Volleyball D1 Average', 2.550, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'Estimated. No volleyball-specific 505 data found. LOW confidence.'),
  ('d1-vb-505-top25', 'AGILITY_505', 'Volleyball D1 Top 25%', 2.350, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated. LOW confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- AGILITY_5105 (Pro Agility) — Volleyball
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-vb-5105-hs', 'AGILITY_5105', 'Volleyball HS Average', 5.200, 'lte', 'Female', 'VOLLEYBALL', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Estimated from D1 data with typical HS-to-D1 gap.'),
  ('d1-vb-5105-avg', 'AGILITY_5105', 'Volleyball D1 Average', 4.880, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'D1 avg from PMC7725048 (Sattler): 4.88±0.19s (n=15). HIGH confidence.'),
  ('d1-vb-5105-top25', 'AGILITY_5105', 'Volleyball D1 Top 25%', 4.700, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated from PMC7725048 mean - 1SD (4.88 - 0.19 ≈ 4.69, rounded to 4.70). HIGH confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- RSI (RSImod) — Volleyball
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-vb-rsi-hs', 'RSI', 'Volleyball HS Average', 0.220, 'gte', 'Female', 'VOLLEYBALL', 'HS', true, true, 1, 'HS Average', '#6B7280', 'RSImod 25th percentile from Sole/Suchomel 2018 (PMC6315647). Used as HS baseline.'),
  ('d1-vb-rsi-avg', 'RSI', 'Volleyball D1 Average', 0.350, 'gte', 'Female', 'VOLLEYBALL', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'Sport-specific estimate: VB D1 avg 0.33-0.38 (higher than multi-sport 0.314 due to jump training emphasis). MEDIUM confidence.'),
  ('d1-vb-rsi-top25', 'RSI', 'Volleyball D1 Top 25%', 0.440, 'gte', 'Female', 'VOLLEYBALL', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Sport-specific estimate: VB D1 75th 0.40-0.48. Midpoint 0.44. MEDIUM confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  comparison_operator = EXCLUDED.comparison_operator,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- DASH_40YD — Volleyball
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-vb-40yd-hs', 'DASH_40YD', 'Volleyball HS Average', 5.450, 'lte', 'Female', 'VOLLEYBALL', 'HS', true, true, 1, 'HS Average', '#6B7280', 'Estimated. Not a standard VB test. LOW confidence.'),
  ('d1-vb-40yd-avg', 'DASH_40YD', 'Volleyball D1 Average', 5.150, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'Estimated from 20m data extrapolation. LOW confidence.'),
  ('d1-vb-40yd-top25', 'DASH_40YD', 'Volleyball D1 Top 25%', 4.900, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated. LOW confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- T_TEST — Volleyball
INSERT INTO site_benchmarks (id, metric_code, name, benchmark_value, comparison_operator, gender, sport, level, is_system_default, is_active, display_order, tier_name, tier_color, description)
VALUES
  ('d1-vb-ttest-hs', 'T_TEST', 'Volleyball HS Average', 12.000, 'lte', 'Female', 'VOLLEYBALL', 'HS', true, true, 1, 'HS Average', '#6B7280', 'TopEndSports female norms: Average 11.5-12.5s.'),
  ('d1-vb-ttest-avg', 'T_TEST', 'Volleyball D1 Average', 11.000, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 2, 'D1 Average', '#3B82F6', 'Estimated from TopEndSports general norms. MEDIUM confidence.'),
  ('d1-vb-ttest-top25', 'T_TEST', 'Volleyball D1 Top 25%', 10.300, 'lte', 'Female', 'VOLLEYBALL', 'D1', true, true, 3, 'D1 Elite', '#10B981', 'Estimated. MEDIUM confidence.')
ON CONFLICT (metric_code, name) DO UPDATE SET
  benchmark_value = EXCLUDED.benchmark_value,
  gender = EXCLUDED.gender,
  sport = EXCLUDED.sport,
  level = EXCLUDED.level,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  description = EXCLUDED.description;

-- ============================================================================
-- STEP 5: Link Benchmarks to Sets via benchmark_set_items
-- ============================================================================

-- Soccer D1 set: all soccer benchmarks (24 items: 8 metrics × 3 tiers)
INSERT INTO benchmark_set_items (set_id, benchmark_id, benchmark_type, display_order, custom_label)
VALUES
  -- DASH_10YD
  ('d1-womens-soccer', 'd1-soccer-dash10-hs', 'site', 1, NULL),
  ('d1-womens-soccer', 'd1-soccer-dash10-avg', 'site', 2, NULL),
  ('d1-womens-soccer', 'd1-soccer-dash10-top25', 'site', 3, NULL),
  -- FLY10_TIME
  ('d1-womens-soccer', 'd1-soccer-fly10-hs', 'site', 4, NULL),
  ('d1-womens-soccer', 'd1-soccer-fly10-avg', 'site', 5, NULL),
  ('d1-womens-soccer', 'd1-soccer-fly10-top25', 'site', 6, NULL),
  -- VERTICAL_JUMP
  ('d1-womens-soccer', 'd1-soccer-vj-hs', 'site', 7, NULL),
  ('d1-womens-soccer', 'd1-soccer-vj-avg', 'site', 8, NULL),
  ('d1-womens-soccer', 'd1-soccer-vj-top25', 'site', 9, NULL),
  -- AGILITY_505
  ('d1-womens-soccer', 'd1-soccer-505-hs', 'site', 10, NULL),
  ('d1-womens-soccer', 'd1-soccer-505-avg', 'site', 11, NULL),
  ('d1-womens-soccer', 'd1-soccer-505-top25', 'site', 12, NULL),
  -- AGILITY_5105
  ('d1-womens-soccer', 'd1-soccer-5105-hs', 'site', 13, NULL),
  ('d1-womens-soccer', 'd1-soccer-5105-avg', 'site', 14, NULL),
  ('d1-womens-soccer', 'd1-soccer-5105-top25', 'site', 15, NULL),
  -- RSI
  ('d1-womens-soccer', 'd1-soccer-rsi-hs', 'site', 16, NULL),
  ('d1-womens-soccer', 'd1-soccer-rsi-avg', 'site', 17, NULL),
  ('d1-womens-soccer', 'd1-soccer-rsi-top25', 'site', 18, NULL),
  -- DASH_40YD
  ('d1-womens-soccer', 'd1-soccer-40yd-hs', 'site', 19, NULL),
  ('d1-womens-soccer', 'd1-soccer-40yd-avg', 'site', 20, NULL),
  ('d1-womens-soccer', 'd1-soccer-40yd-top25', 'site', 21, NULL),
  -- T_TEST
  ('d1-womens-soccer', 'd1-soccer-ttest-hs', 'site', 22, NULL),
  ('d1-womens-soccer', 'd1-soccer-ttest-avg', 'site', 23, NULL),
  ('d1-womens-soccer', 'd1-soccer-ttest-top25', 'site', 24, NULL)
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- Volleyball D1 set: all volleyball benchmarks (27 items: 9 metrics × 3 tiers)
INSERT INTO benchmark_set_items (set_id, benchmark_id, benchmark_type, display_order, custom_label)
VALUES
  -- DASH_10YD
  ('d1-womens-volleyball', 'd1-vb-dash10-hs', 'site', 1, NULL),
  ('d1-womens-volleyball', 'd1-vb-dash10-avg', 'site', 2, NULL),
  ('d1-womens-volleyball', 'd1-vb-dash10-top25', 'site', 3, NULL),
  -- FLY10_TIME
  ('d1-womens-volleyball', 'd1-vb-fly10-hs', 'site', 4, NULL),
  ('d1-womens-volleyball', 'd1-vb-fly10-avg', 'site', 5, NULL),
  ('d1-womens-volleyball', 'd1-vb-fly10-top25', 'site', 6, NULL),
  -- VERTICAL_JUMP
  ('d1-womens-volleyball', 'd1-vb-vj-hs', 'site', 7, NULL),
  ('d1-womens-volleyball', 'd1-vb-vj-avg', 'site', 8, NULL),
  ('d1-womens-volleyball', 'd1-vb-vj-top25', 'site', 9, NULL),
  -- APPROACH_JUMP
  ('d1-womens-volleyball', 'd1-vb-approach-hs', 'site', 10, NULL),
  ('d1-womens-volleyball', 'd1-vb-approach-avg', 'site', 11, NULL),
  ('d1-womens-volleyball', 'd1-vb-approach-top25', 'site', 12, NULL),
  -- AGILITY_505
  ('d1-womens-volleyball', 'd1-vb-505-hs', 'site', 13, NULL),
  ('d1-womens-volleyball', 'd1-vb-505-avg', 'site', 14, NULL),
  ('d1-womens-volleyball', 'd1-vb-505-top25', 'site', 15, NULL),
  -- AGILITY_5105
  ('d1-womens-volleyball', 'd1-vb-5105-hs', 'site', 16, NULL),
  ('d1-womens-volleyball', 'd1-vb-5105-avg', 'site', 17, NULL),
  ('d1-womens-volleyball', 'd1-vb-5105-top25', 'site', 18, NULL),
  -- RSI
  ('d1-womens-volleyball', 'd1-vb-rsi-hs', 'site', 19, NULL),
  ('d1-womens-volleyball', 'd1-vb-rsi-avg', 'site', 20, NULL),
  ('d1-womens-volleyball', 'd1-vb-rsi-top25', 'site', 21, NULL),
  -- DASH_40YD
  ('d1-womens-volleyball', 'd1-vb-40yd-hs', 'site', 22, NULL),
  ('d1-womens-volleyball', 'd1-vb-40yd-avg', 'site', 23, NULL),
  ('d1-womens-volleyball', 'd1-vb-40yd-top25', 'site', 24, NULL),
  -- T_TEST
  ('d1-womens-volleyball', 'd1-vb-ttest-hs', 'site', 25, NULL),
  ('d1-womens-volleyball', 'd1-vb-ttest-avg', 'site', 26, NULL),
  ('d1-womens-volleyball', 'd1-vb-ttest-top25', 'site', 27, NULL)
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- HS Baseline set: soccer HS averages (serves as the "baseline" tier for gauge bars)
INSERT INTO benchmark_set_items (set_id, benchmark_id, benchmark_type, display_order, custom_label)
VALUES
  ('hs-female-baseline', 'd1-soccer-dash10-hs', 'site', 1, '10-Yard Dash'),
  ('hs-female-baseline', 'd1-soccer-fly10-hs', 'site', 2, '10-Yard Fly'),
  ('hs-female-baseline', 'd1-soccer-vj-hs', 'site', 3, 'Vertical Jump'),
  ('hs-female-baseline', 'd1-soccer-505-hs', 'site', 4, '5-0-5 Agility'),
  ('hs-female-baseline', 'd1-soccer-5105-hs', 'site', 5, 'Pro Agility'),
  ('hs-female-baseline', 'd1-soccer-rsi-hs', 'site', 6, 'RSI'),
  ('hs-female-baseline', 'd1-soccer-40yd-hs', 'site', 7, '40-Yard Dash'),
  ('hs-female-baseline', 'd1-soccer-ttest-hs', 'site', 8, 'T-Test')
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order,
  custom_label = EXCLUDED.custom_label;
