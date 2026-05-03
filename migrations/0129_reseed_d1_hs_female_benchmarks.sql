-- Migration 0129: D1 + HS Female Benchmark Seeding (Comprehensive Re-Seed)
--
-- Spec: AM-FEAT-007 (/home/hulla/devel/bta-company/specs/d1-hs-benchmark-completion.md)
--
-- Background:
--   * The prior benchmark seed attempt (commit 8c5e89a7 / migration 0105 on
--     branch feature/d1-benchmark-seed-data) was rejected by John — values
--     did not reflect BTA's authoritative interpretation of the literature.
--     That branch was never merged. None of its rows landed.
--   * AthleteMetrics has no D1 / HS benchmark sets seeded today. This
--     migration creates them from scratch, sourcing all values from the
--     BTA benchmark research docs (docs/benchmarks/ in the bta-company repo).
--
-- Spec / codebase metric-code reconciliation (resolved 2026-04-28):
--   The spec uses metric codes from an earlier draft that don't all match
--   the codebase. Where they conflict, the codebase code wins (spec is
--   updated separately). Reconciliations applied in this migration:
--     spec SPRINT_20YD     → codebase DASH_20YD
--     spec SPRINT_10YD_FLY → codebase FLY10_TIME
--     spec SPEED_TOP_MPH   → codebase TOP_SPEED_MPH
--     spec AGILITY_PRO     → codebase AGILITY_5105
--     spec JUMP_APPROACH   → codebase APPROACH_JUMP
--     spec JUMP_BLOCK      → codebase BLOCK_JUMP
--     spec POWER_RSI_MOD   → codebase RSI (deferred entirely; not seeded)
--     spec JUMP_CMJ_HOH    → codebase VERTICAL_JUMP (using CMJ-protocol values)
--     spec JUMP_VJ_REACH   → SKIPPED (no codebase equivalent; defer to follow-up)
--     spec JUMP_BROAD      → SKIPPED (no codebase equivalent; defer to follow-up)
--
-- Block layout:
--   A — 8 benchmark sets (2 D1 + 6 HS age-grouped)
--   B — D1 women's soccer benchmark rows (per spec Part 1)
--   C — D1 women's volleyball benchmark rows (per spec Part 2)
--   D — HS age-grouped soccer rows (Part 3, MS/JV/Varsity × 7 metrics)
--   E — HS age-grouped volleyball rows (Part 3, MS/JV/Varsity × 6 metrics)
--   F — benchmark_set_items linking everything
--   G — RAISE NOTICE summary
--
-- All inserts use ON CONFLICT … DO UPDATE for idempotency. Down migration
-- removes by deterministic ID.
--
-- Per spec resolved decisions:
--   * RSI / RSI_MOD seeding deferred entirely (decision 2026-04-24)
--   * VB SPEED_TOP_MPH (TOP_SPEED_MPH) omitted (decision 2026-04-24)
--   * VB FLY10_TIME omitted (per AM-FEAT-010 VB cleanup, decision 2026-04-27)

-- ============================================================================
-- Block A0 — Ensure prerequisite site_metrics rows exist
--
-- Defensively idempotent: ON CONFLICT (code) DO NOTHING preserves any
-- existing metric definitions. Migration 0107 was supposed to seed these,
-- but environments have drifted (dev DB is missing some, testing has all).
-- This block makes the migration self-contained against any environment.
-- ============================================================================
INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, description, decimal_precision)
VALUES
  ('DASH_10YD',     '10yd Dash',         'Acceleration', 's',   'lower_is_better',  true, true, 0, '10-yard sprint time, primary acceleration metric.', 3),
  ('DASH_20YD',     '20-yard Dash',      'Speed',        's',   'lower_is_better',  true, true, 0, '20-yard sprint time, drive + transition phase.', 3),
  ('FLY10_TIME',    '10-Yard Fly Time',  'Speed',        's',   'lower_is_better',  true, true, 0, '10-yard fly time after a flying start; max-velocity capture.', 3),
  ('TOP_SPEED_MPH', 'Top Speed (MPH)',   'Speed',        'mph', 'higher_is_better', true, true, 0, 'Maximum sprint speed in miles per hour, derived from gate splits.', 3),
  ('AGILITY_505',   '5-0-5 Agility',     'Agility',      's',   'lower_is_better',  true, true, 0, '5-0-5 change-of-direction test; 10m approach + 5m to turn line + 5m back.', 3),
  ('AGILITY_5105',  '5-10-5 Agility',    'Agility',      's',   'lower_is_better',  true, true, 0, '5-10-5 Pro Agility shuttle.', 3),
  ('VERTICAL_JUMP', 'Vertical Jump (in)','Power',        'in',  'higher_is_better', true, true, 0, 'Vertical jump height in inches.', 1),
  ('APPROACH_JUMP', 'Approach Jump (in)','Power',        'in',  'higher_is_better', true, true, 0, 'Volleyball attack approach jump touch height; primary VB recruiting metric.', 3),
  ('BLOCK_JUMP',    'Block Jump (in)',   'Power',        'in',  'higher_is_better', true, true, 0, 'Volleyball block jump touch height.', 3)
ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- Block A — Benchmark sets
-- ============================================================================
INSERT INTO benchmark_sets (id, name, description, sport, level, gender, is_template, is_active)
VALUES
  ('d1-womens-soccer',
   'NCAA D1 Women''s Soccer',
   'Benchmark values for NCAA Division 1 women''s soccer athletes. Sourced from BTA''s benchmark research docs (docs/benchmarks/d1-soccer-benchmarks.md), drawing on Lockie 2016 (PMC5466405), Vescovi 2012, Hilton 2021, Stankovic 2025, Compton 2025 meta, and Stanford / Auburn / Mississippi State program data. Values represent electronic timing where applicable.',
   'SOCCER', 'D1', 'Female', true, true),
  ('d1-womens-volleyball',
   'NCAA D1 Women''s Volleyball',
   'Benchmark values for NCAA Division 1 women''s volleyball athletes. Sourced from BTA''s benchmark research docs (docs/benchmarks/jump-power-benchmarks.md), drawing on Sattler 2020 (PMC7725048), NCSA/AVCA recruiting data, IHSVCA touch-height data, and 2aDays NCAA D1 VB norms. Values represent electronic timing where applicable.',
   'VOLLEYBALL', 'D1', 'Female', true, true),
  ('hs-ms-female-soccer',
   'HS Female MS (Ages 11-13) — Soccer',
   'Middle-school-age (11-13) female soccer baseline. Sourced from PMC8381494 (Spanish female soccer academy, n=80), NSCA youth norms, and BTA''s extrapolations in d1-soccer-benchmarks.md.',
   'SOCCER', 'HS', 'Female', true, true),
  ('hs-jv-female-soccer',
   'HS Female JV (Ages 14-15) — Soccer',
   'JV-age (14-15) female soccer baseline. Sourced from PMC8381494, Vescovi 2012, NSCA youth norms.',
   'SOCCER', 'HS', 'Female', true, true),
  ('hs-varsity-female-soccer',
   'HS Female Varsity (Ages 16-18) — Soccer',
   'Varsity-age (16-18) female soccer baseline (pre-D1). Sourced from PMC8381494 + extrapolation, Vescovi 2012, NSCA, BTA d1-soccer-benchmarks.md HS-tier ranges.',
   'SOCCER', 'HS', 'Female', true, true),
  ('hs-ms-female-volleyball',
   'HS Female MS (Ages 11-13) — Volleyball',
   'Middle-school-age (11-13) female volleyball baseline. Sourced from PMC8393901 (junior female VB anthropometrics + VJ by position), Wrzesniewska 2025 (BMC Sports Sci), NCSA/AVCA youth data.',
   'VOLLEYBALL', 'HS', 'Female', true, true),
  ('hs-jv-female-volleyball',
   'HS Female JV (Ages 14-15) — Volleyball',
   'JV-age (14-15) female volleyball baseline. Sourced from PMC8393901, NCSA/AVCA, BTA jump-power-benchmarks.md.',
   'VOLLEYBALL', 'HS', 'Female', true, true),
  ('hs-varsity-female-volleyball',
   'HS Female Varsity (Ages 16-18) — Volleyball',
   'Varsity-age (16-18) female volleyball baseline (pre-D1). Sourced from PMC8393901, NCSA/AVCA, BTA jump-power-benchmarks.md.',
   'VOLLEYBALL', 'HS', 'Female', true, true)
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
-- Block B — D1 women's soccer benchmark rows
--   Tier convention: row's name encodes the tier ("Soccer D1 Average", etc.)
--   tier_color: gray for HS Avg, blue for D1 Avg, green for D1 Top 25%
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level,
  is_system_default, is_active, display_order
) VALUES
  -- DASH_10YD (no HS Avg row per spec; only D1 Avg + D1 Top 25%)
  ('d1-soc-dash10-d1-avg',  'DASH_10YD', 'Soccer D1 Average',
   'Mid of 1.82-1.92 (Lockie 2016 PMC5466405 starters: 1.98s 10m → 1.82s 9.14m); Mississippi State program 1.9s. Confidence: HIGH. Source: docs/benchmarks/d1-soccer-benchmarks.md.',
   'lte', 1.870, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', true, true, 2),
  ('d1-soc-dash10-d1-top25', 'DASH_10YD', 'Soccer D1 Top 25%',
   'Auburn program (many sub-1.7s at 10m); conservative parent-facing value per John decision 2026-04-24 (1.65s vs 1.62s extrapolation). Confidence: MEDIUM.',
   'lte', 1.650, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', true, true, 3),

  -- DASH_20YD (formerly SPRINT_20YD in spec)
  ('d1-soc-dash20-hs-avg',  'DASH_20YD', 'Soccer HS Average',
   'Extrapolated from 10yd HS avg + published 10-20yd split. Confidence: MEDIUM.',
   'lte', 3.450, 'HS Average', 'gray', 'Female', 'SOCCER', 'HS', true, true, 1),
  ('d1-soc-dash20-d1-avg',  'DASH_20YD', 'Soccer D1 Average',
   'Mid of 3.05-3.20 (Lockie 30m derived); externally corroborated by recruiting standards. Confidence: MEDIUM-HIGH.',
   'lte', 3.120, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', true, true, 2),
  ('d1-soc-dash20-d1-top25','DASH_20YD', 'Soccer D1 Top 25%',
   'Auburn extrapolated. Confidence: MEDIUM.',
   'lte', 2.950, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', true, true, 3),

  -- FLY10_TIME (formerly SPRINT_10YD_FLY in spec)
  ('d1-soc-fly10-d1-avg',   'FLY10_TIME', 'Soccer D1 Average',
   'Mid of 1.22-1.34 (Vescovi 2012 peak speed 27.3 km/h derived). Confidence: LOW-MODERATE.',
   'lte', 1.280, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', true, true, 2),
  ('d1-soc-fly10-d1-top25', 'FLY10_TIME', 'Soccer D1 Top 25%',
   'Auburn 15yd fly ~1.1s; 10yd fly faster. Confidence: LOW-MODERATE.',
   'lte', 1.100, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', true, true, 3),

  -- TOP_SPEED_MPH (formerly SPEED_TOP_MPH in spec)
  ('d1-soc-tspd-hs-avg',    'TOP_SPEED_MPH', 'Soccer HS Average',
   'NSCA / extrapolated. Confidence: MEDIUM.',
   'gte', 15.000, 'HS Average', 'gray', 'Female', 'SOCCER', 'HS', true, true, 1),
  ('d1-soc-tspd-d1-avg',    'TOP_SPEED_MPH', 'Soccer D1 Average',
   'Mid of 17-18 mph (Mississippi State 17.8 avg; Stanford team 18). Confidence: HIGH.',
   'gte', 17.500, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', true, true, 2),
  ('d1-soc-tspd-d1-top25',  'TOP_SPEED_MPH', 'Soccer D1 Top 25%',
   'Stanford (3 athletes 20 mph); Auburn ~20 mph. Confidence: HIGH.',
   'gte', 19.500, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', true, true, 3),

  -- AGILITY_5105 (formerly AGILITY_PRO / Pro Agility / 5-10-5 in spec)
  ('d1-soc-agi5105-d1-avg', 'AGILITY_5105', 'Soccer D1 Average',
   'Mid of 4.80-5.10 (Lockie 2016 starters 5.04 ± 0.17s). Confidence: HIGH.',
   'lte', 4.950, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', true, true, 2),
  ('d1-soc-agi5105-d1-top25','AGILITY_5105', 'Soccer D1 Top 25%',
   'Top D1 program / pro tryout cuts. Confidence: MEDIUM-HIGH.',
   'lte', 4.700, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', true, true, 3),

  -- AGILITY_505
  ('d1-soc-agi505-d1-avg',  'AGILITY_505', 'Soccer D1 Average',
   'Broader D1 research mean (~2.51 ± 0.14s); pro female ICC 0.99. Confidence: HIGH.',
   'lte', 2.510, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', true, true, 2),
  ('d1-soc-agi505-d1-top25','AGILITY_505', 'Soccer D1 Top 25%',
   'Top D1 program upper end. Confidence: MEDIUM-HIGH.',
   'lte', 2.400, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', true, true, 3),

  -- VERTICAL_JUMP — codebase metric is a HANDS-FREE CMJ (with arm swing / Abalakov-style).
  -- Mapped from spec's JUMP_VJ_REACH values, NOT JUMP_CMJ_HOH (which is a hands-on-hips
  -- constrained protocol producing lower numbers — no codebase equivalent, deferred).
  -- Stored in inches (codebase metric unit). Spec source values are in cm; converted here.
  ('d1-soc-vj-d1-avg',      'VERTICAL_JUMP', 'Soccer D1 Average',
   'Mid of 46-50 cm = 18.1-19.7 in (Hilton 2021 D1: 46.2 ± 6.3cm; Lockie 2016 starters: 50 ± 4cm). With-arm-swing CMJ. Confidence: HIGH.',
   'gte', 18.900, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', true, true, 2),
  ('d1-soc-vj-d1-top25',    'VERTICAL_JUMP', 'Soccer D1 Top 25%',
   'Mid of 50-58 cm = 19.7-22.8 in (extrapolated from Lockie starters). With-arm-swing CMJ. Confidence: MEDIUM.',
   'gte', 21.300, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', true, true, 3)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block C — D1 women's volleyball benchmark rows
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level,
  is_system_default, is_active, display_order
) VALUES
  -- DASH_10YD
  ('d1-vb-dash10-d1-avg',   'DASH_10YD', 'Volleyball D1 Average',
   'VB-extrapolated; less direct data than soccer. Confidence: MEDIUM.',
   'lte', 1.950, 'D1 Average', 'blue', 'Female', 'VOLLEYBALL', 'D1', true, true, 2),
  ('d1-vb-dash10-d1-top25', 'DASH_10YD', 'Volleyball D1 Top 25%',
   'Extrapolated. Confidence: MEDIUM.',
   'lte', 1.850, 'D1 Top 25%', 'green', 'Female', 'VOLLEYBALL', 'D1', true, true, 3),

  -- DASH_20YD
  ('d1-vb-dash20-hs-avg',   'DASH_20YD', 'Volleyball HS Average',
   'Extrapolated. Confidence: MEDIUM.',
   'lte', 3.500, 'HS Average', 'gray', 'Female', 'VOLLEYBALL', 'HS', true, true, 1),
  ('d1-vb-dash20-d1-avg',   'DASH_20YD', 'Volleyball D1 Average',
   'Sattler 2020 PMC7725048 (D1 VB n=15, 20m derived). Confidence: MEDIUM.',
   'lte', 3.180, 'D1 Average', 'blue', 'Female', 'VOLLEYBALL', 'D1', true, true, 2),
  ('d1-vb-dash20-d1-top25', 'DASH_20YD', 'Volleyball D1 Top 25%',
   'Extrapolated from D1 avg minus 1SD. Confidence: LOW-MEDIUM.',
   'lte', 3.000, 'D1 Top 25%', 'green', 'Female', 'VOLLEYBALL', 'D1', true, true, 3),

  -- AGILITY_5105
  ('d1-vb-agi5105-d1-avg',  'AGILITY_5105', 'Volleyball D1 Average',
   'Mid of 4.70-5.00 (NCSA/AVCA D1 VB). Confidence: MEDIUM-HIGH.',
   'lte', 4.850, 'D1 Average', 'blue', 'Female', 'VOLLEYBALL', 'D1', true, true, 2),
  ('d1-vb-agi5105-d1-top25','AGILITY_5105', 'Volleyball D1 Top 25%',
   'Extrapolated. Confidence: MEDIUM.',
   'lte', 4.650, 'D1 Top 25%', 'green', 'Female', 'VOLLEYBALL', 'D1', true, true, 3),

  -- AGILITY_505
  ('d1-vb-agi505-d1-avg',   'AGILITY_505', 'Volleyball D1 Average',
   'Mid of 2.55-2.70 (extrapolated; less VB-specific data than soccer). Confidence: MEDIUM.',
   'lte', 2.620, 'D1 Average', 'blue', 'Female', 'VOLLEYBALL', 'D1', true, true, 2),
  ('d1-vb-agi505-d1-top25', 'AGILITY_505', 'Volleyball D1 Top 25%',
   'Extrapolated. Confidence: LOW-MEDIUM.',
   'lte', 2.550, 'D1 Top 25%', 'green', 'Female', 'VOLLEYBALL', 'D1', true, true, 3),

  -- VERTICAL_JUMP — codebase metric is a HANDS-FREE CMJ (with arm swing).
  -- Mapped from spec's JUMP_VJ_REACH values (51-66 cm range for D1 VB), NOT JUMP_CMJ_HOH (45-50 cm).
  ('d1-vb-vj-d1-avg',       'VERTICAL_JUMP', 'Volleyball D1 Average',
   'Mid of 51-56 cm = 20.1-22.0 in (consistent with NCSA college range). With-arm-swing CMJ. Confidence: MEDIUM.',
   'gte', 20.900, 'D1 Average', 'blue', 'Female', 'VOLLEYBALL', 'D1', true, true, 2),
  ('d1-vb-vj-d1-top25',     'VERTICAL_JUMP', 'Volleyball D1 Top 25%',
   'Mid of 56-66 cm = 22.0-26.0 in. With-arm-swing CMJ. Confidence: MEDIUM.',
   'gte', 24.000, 'D1 Top 25%', 'green', 'Female', 'VOLLEYBALL', 'D1', true, true, 3),

  -- APPROACH_JUMP (formerly JUMP_APPROACH in spec; volleyball touch-height attack jump)
  ('d1-vb-appj-d1-avg',     'APPROACH_JUMP', 'Volleyball D1 Average',
   'NCSA/AVCA: D1 MB/OH avg approach 9''5"-10''0" touch (24 in vertical). Confidence: HIGH.',
   'gte', 24.000, 'D1 Average', 'blue', 'Female', 'VOLLEYBALL', 'D1', true, true, 2),
  ('d1-vb-appj-d1-top25',   'APPROACH_JUMP', 'Volleyball D1 Top 25%',
   'NCSA/AVCA: elite D1 MB/OH 10''0"-10''2" minimum (28 in vertical). Confidence: HIGH.',
   'gte', 28.000, 'D1 Top 25%', 'green', 'Female', 'VOLLEYBALL', 'D1', true, true, 3),

  -- BLOCK_JUMP (formerly JUMP_BLOCK in spec; volleyball touch-height block jump)
  ('d1-vb-blkj-d1-avg',     'BLOCK_JUMP', 'Volleyball D1 Average',
   'IHSVCA: MB block avg 9''1", 80th pctile 9''5" (18 in vertical). Confidence: HIGH.',
   'gte', 18.000, 'D1 Average', 'blue', 'Female', 'VOLLEYBALL', 'D1', true, true, 2),
  ('d1-vb-blkj-d1-top25',   'BLOCK_JUMP', 'Volleyball D1 Top 25%',
   'Derived: attack touch minus 25-27% of vertical (22 in vertical). Confidence: MEDIUM.',
   'gte', 22.000, 'D1 Top 25%', 'green', 'Female', 'VOLLEYBALL', 'D1', true, true, 3)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block D — HS age-grouped soccer rows
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level, age_min, age_max,
  is_system_default, is_active, display_order
) VALUES
  -- DASH_10YD
  ('hs-ms-soc-dash10',  'DASH_10YD', 'HS MS Female Soccer (Ages 11-13) Average', 'PMC8381494 age bands, converted 10m→10yd. Confidence: MEDIUM.',  'lte', 2.150, 'MS Average',      'gray',  'Female','SOCCER','HS',11,13,true,true,1),
  ('hs-jv-soc-dash10',  'DASH_10YD', 'HS JV Female Soccer (Ages 14-15) Average', 'PMC8381494 + extrapolation. Confidence: MEDIUM.',                    'lte', 2.050, 'JV Average',      'gray',  'Female','SOCCER','HS',14,15,true,true,1),
  ('hs-var-soc-dash10', 'DASH_10YD', 'HS Varsity Female Soccer (Ages 16-18) Average','PMC8381494 + Vescovi 2012. Confidence: MEDIUM.',                  'lte', 1.950, 'Varsity Average', 'gray',  'Female','SOCCER','HS',16,18,true,true,1),

  -- DASH_20YD
  ('hs-ms-soc-dash20',  'DASH_20YD', 'HS MS Female Soccer (Ages 11-13) Average', 'PMC8381494 + extrapolation. Confidence: MEDIUM.',                    'lte', 3.850, 'MS Average',      'gray',  'Female','SOCCER','HS',11,13,true,true,1),
  ('hs-jv-soc-dash20',  'DASH_20YD', 'HS JV Female Soccer (Ages 14-15) Average', 'PMC8381494 + extrapolation. Confidence: MEDIUM.',                    'lte', 3.650, 'JV Average',      'gray',  'Female','SOCCER','HS',14,15,true,true,1),
  ('hs-var-soc-dash20', 'DASH_20YD', 'HS Varsity Female Soccer (Ages 16-18) Average','PMC8381494 + Vescovi 2012. Confidence: MEDIUM.',                  'lte', 3.500, 'Varsity Average', 'gray',  'Female','SOCCER','HS',16,18,true,true,1),

  -- FLY10_TIME (LOW confidence — flagged in description per spec)
  ('hs-ms-soc-fly10',   'FLY10_TIME','HS MS Female Soccer (Ages 11-13) Average', 'Extrapolated from sprint development curves. Confidence: LOW — estimated, pending BTA internal data.', 'lte', 1.720, 'MS Average',      'gray', 'Female','SOCCER','HS',11,13,true,true,1),
  ('hs-jv-soc-fly10',   'FLY10_TIME','HS JV Female Soccer (Ages 14-15) Average', 'Extrapolated from sprint development curves. Confidence: LOW — estimated, pending BTA internal data.', 'lte', 1.580, 'JV Average',      'gray', 'Female','SOCCER','HS',14,15,true,true,1),
  ('hs-var-soc-fly10',  'FLY10_TIME','HS Varsity Female Soccer (Ages 16-18) Average','Extrapolated from sprint development curves. Confidence: LOW — estimated, pending BTA internal data.','lte', 1.480, 'Varsity Average', 'gray', 'Female','SOCCER','HS',16,18,true,true,1),

  -- TOP_SPEED_MPH
  ('hs-ms-soc-tspd',    'TOP_SPEED_MPH','HS MS Female Soccer (Ages 11-13) Average','NSCA youth + sprint development curves. Confidence: MEDIUM.','gte',13.000,'MS Average',     'gray','Female','SOCCER','HS',11,13,true,true,1),
  ('hs-jv-soc-tspd',    'TOP_SPEED_MPH','HS JV Female Soccer (Ages 14-15) Average','NSCA youth + sprint development curves. Confidence: MEDIUM.','gte',14.000,'JV Average',     'gray','Female','SOCCER','HS',14,15,true,true,1),
  ('hs-var-soc-tspd',   'TOP_SPEED_MPH','HS Varsity Female Soccer (Ages 16-18) Average','NSCA youth + sprint development curves. Confidence: MEDIUM.','gte',15.000,'Varsity Average','gray','Female','SOCCER','HS',16,18,true,true,1),

  -- VERTICAL_JUMP — codebase metric is a HANDS-FREE CMJ (with arm swing).
  -- Mapped from spec's JUMP_VJ_REACH values (33/38/43 cm = 13.0/15.0/17.0 in), NOT JUMP_CMJ_HOH.
  ('hs-ms-soc-vj',      'VERTICAL_JUMP','HS MS Female Soccer (Ages 11-13) Average','33 cm = 13.0 in. NSCA youth female norms; with-arm-swing CMJ. Confidence: MEDIUM.','gte',13.000,'MS Average',     'gray','Female','SOCCER','HS',11,13,true,true,1),
  ('hs-jv-soc-vj',      'VERTICAL_JUMP','HS JV Female Soccer (Ages 14-15) Average','38 cm = 15.0 in. NSCA youth female norms; with-arm-swing CMJ. Confidence: MEDIUM.','gte',15.000,'JV Average',     'gray','Female','SOCCER','HS',14,15,true,true,1),
  ('hs-var-soc-vj',     'VERTICAL_JUMP','HS Varsity Female Soccer (Ages 16-18) Average','43 cm = 17.0 in. NSCA youth female norms; with-arm-swing CMJ. Confidence: MEDIUM.','gte',17.000,'Varsity Average','gray','Female','SOCCER','HS',16,18,true,true,1),

  -- AGILITY_505
  ('hs-ms-soc-agi505',  'AGILITY_505','HS MS Female Soccer (Ages 11-13) Average','Extrapolated from D1 baseline + published HS ranges. Confidence: MEDIUM.','lte',3.200,'MS Average',     'gray','Female','SOCCER','HS',11,13,true,true,1),
  ('hs-jv-soc-agi505',  'AGILITY_505','HS JV Female Soccer (Ages 14-15) Average','Extrapolated from D1 baseline + published HS ranges. Confidence: MEDIUM.','lte',2.950,'JV Average',     'gray','Female','SOCCER','HS',14,15,true,true,1),
  ('hs-var-soc-agi505', 'AGILITY_505','HS Varsity Female Soccer (Ages 16-18) Average','Extrapolated from D1 baseline + published HS ranges. Confidence: MEDIUM.','lte',2.750,'Varsity Average','gray','Female','SOCCER','HS',16,18,true,true,1),

  -- AGILITY_5105 (formerly AGILITY_PRO in spec)
  ('hs-ms-soc-agi5105', 'AGILITY_5105','HS MS Female Soccer (Ages 11-13) Average','Extrapolated. Confidence: MEDIUM.','lte',5.950,'MS Average',     'gray','Female','SOCCER','HS',11,13,true,true,1),
  ('hs-jv-soc-agi5105', 'AGILITY_5105','HS JV Female Soccer (Ages 14-15) Average','Extrapolated. Confidence: MEDIUM.','lte',5.550,'JV Average',     'gray','Female','SOCCER','HS',14,15,true,true,1),
  ('hs-var-soc-agi5105','AGILITY_5105','HS Varsity Female Soccer (Ages 16-18) Average','Extrapolated. Confidence: MEDIUM.','lte',5.250,'Varsity Average','gray','Female','SOCCER','HS',16,18,true,true,1)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block E — HS age-grouped volleyball rows
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level, age_min, age_max,
  is_system_default, is_active, display_order
) VALUES
  -- DASH_10YD (only sprint metric for VB per AM-FEAT-010 cleanup)
  ('hs-ms-vb-dash10',  'DASH_10YD',  'HS MS Female Volleyball (Ages 11-13) Average','Extrapolated from soccer + small sport adjustment. Confidence: MEDIUM-LOW.','lte',2.200,'MS Average',     'gray','Female','VOLLEYBALL','HS',11,13,true,true,1),
  ('hs-jv-vb-dash10',  'DASH_10YD',  'HS JV Female Volleyball (Ages 14-15) Average','Extrapolated. Confidence: MEDIUM-LOW.','lte',2.050,'JV Average',     'gray','Female','VOLLEYBALL','HS',14,15,true,true,1),
  ('hs-var-vb-dash10', 'DASH_10YD',  'HS Varsity Female Volleyball (Ages 16-18) Average','Extrapolated. Confidence: MEDIUM-LOW.','lte',1.950,'Varsity Average','gray','Female','VOLLEYBALL','HS',16,18,true,true,1),

  -- VERTICAL_JUMP — codebase metric is a HANDS-FREE CMJ (with arm swing).
  -- Mapped from spec's JUMP_VJ_REACH values (36/42/47 cm = 14.0/16.5/18.5 in), NOT JUMP_CMJ_HOH.
  ('hs-ms-vb-vj',      'VERTICAL_JUMP','HS MS Female Volleyball (Ages 11-13) Average','36 cm = 14.0 in. PMC8393901; NCSA/AVCA youth data; with-arm-swing CMJ. Confidence: MEDIUM-HIGH.','gte',14.000,'MS Average',     'gray','Female','VOLLEYBALL','HS',11,13,true,true,1),
  ('hs-jv-vb-vj',      'VERTICAL_JUMP','HS JV Female Volleyball (Ages 14-15) Average','42 cm = 16.5 in. PMC8393901; NCSA/AVCA youth data; with-arm-swing CMJ. Confidence: MEDIUM-HIGH.','gte',16.500,'JV Average',     'gray','Female','VOLLEYBALL','HS',14,15,true,true,1),
  ('hs-var-vb-vj',     'VERTICAL_JUMP','HS Varsity Female Volleyball (Ages 16-18) Average','47 cm = 18.5 in. PMC8393901; NCSA/AVCA youth data; with-arm-swing CMJ. Confidence: MEDIUM-HIGH.','gte',18.500,'Varsity Average','gray','Female','VOLLEYBALL','HS',16,18,true,true,1),

  -- APPROACH_JUMP (volleyball recruiting metric)
  ('hs-ms-vb-appj',    'APPROACH_JUMP','HS MS Female Volleyball (Ages 11-13) Average','NCSA/AVCA youth approach data; Dynamite Sports. Confidence: MEDIUM.','gte',16.000,'MS Average',     'gray','Female','VOLLEYBALL','HS',11,13,true,true,1),
  ('hs-jv-vb-appj',    'APPROACH_JUMP','HS JV Female Volleyball (Ages 14-15) Average','NCSA/AVCA. Confidence: MEDIUM.','gte',19.500,'JV Average',     'gray','Female','VOLLEYBALL','HS',14,15,true,true,1),
  ('hs-var-vb-appj',   'APPROACH_JUMP','HS Varsity Female Volleyball (Ages 16-18) Average','NCSA/AVCA. Confidence: MEDIUM.','gte',22.500,'Varsity Average','gray','Female','VOLLEYBALL','HS',16,18,true,true,1),

  -- BLOCK_JUMP (volleyball block touch-height)
  ('hs-ms-vb-blkj',    'BLOCK_JUMP','HS MS Female Volleyball (Ages 11-13) Average','IHSVCA youth block data, extrapolated. Confidence: LOW-MEDIUM.','gte',12.000,'MS Average',     'gray','Female','VOLLEYBALL','HS',11,13,true,true,1),
  ('hs-jv-vb-blkj',    'BLOCK_JUMP','HS JV Female Volleyball (Ages 14-15) Average','IHSVCA youth block data, extrapolated. Confidence: LOW-MEDIUM.','gte',15.000,'JV Average',     'gray','Female','VOLLEYBALL','HS',14,15,true,true,1),
  ('hs-var-vb-blkj',   'BLOCK_JUMP','HS Varsity Female Volleyball (Ages 16-18) Average','IHSVCA youth block data, extrapolated. Confidence: LOW-MEDIUM.','gte',18.000,'Varsity Average','gray','Female','VOLLEYBALL','HS',16,18,true,true,1),

  -- AGILITY_505 (LOW confidence — flagged)
  ('hs-ms-vb-agi505',  'AGILITY_505','HS MS Female Volleyball (Ages 11-13) Average','Extrapolated. Confidence: LOW — estimated, pending BTA internal data.','lte',3.300,'MS Average',     'gray','Female','VOLLEYBALL','HS',11,13,true,true,1),
  ('hs-jv-vb-agi505',  'AGILITY_505','HS JV Female Volleyball (Ages 14-15) Average','Extrapolated. Confidence: LOW — estimated, pending BTA internal data.','lte',3.050,'JV Average',     'gray','Female','VOLLEYBALL','HS',14,15,true,true,1),
  ('hs-var-vb-agi505', 'AGILITY_505','HS Varsity Female Volleyball (Ages 16-18) Average','Extrapolated. Confidence: LOW — estimated, pending BTA internal data.','lte',2.850,'Varsity Average','gray','Female','VOLLEYBALL','HS',16,18,true,true,1),

  -- AGILITY_5105
  ('hs-ms-vb-agi5105', 'AGILITY_5105','HS MS Female Volleyball (Ages 11-13) Average','PMC7725048 extrapolated to youth. Confidence: MEDIUM.','lte',5.800,'MS Average',     'gray','Female','VOLLEYBALL','HS',11,13,true,true,1),
  ('hs-jv-vb-agi5105', 'AGILITY_5105','HS JV Female Volleyball (Ages 14-15) Average','PMC7725048 extrapolated to youth. Confidence: MEDIUM.','lte',5.400,'JV Average',     'gray','Female','VOLLEYBALL','HS',14,15,true,true,1),
  ('hs-var-vb-agi5105','AGILITY_5105','HS Varsity Female Volleyball (Ages 16-18) Average','PMC7725048 extrapolated to youth. Confidence: MEDIUM.','lte',5.100,'Varsity Average','gray','Female','VOLLEYBALL','HS',16,18,true,true,1)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block F — benchmark_set_items linking benchmarks to their sets
-- ============================================================================
INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
VALUES
  -- D1 women's soccer set items
  ('bsi-d1-soc-dash10-d1-avg',   'd1-womens-soccer','d1-soc-dash10-d1-avg',   'site',1),
  ('bsi-d1-soc-dash10-d1-top25', 'd1-womens-soccer','d1-soc-dash10-d1-top25', 'site',2),
  ('bsi-d1-soc-dash20-hs-avg',   'd1-womens-soccer','d1-soc-dash20-hs-avg',   'site',3),
  ('bsi-d1-soc-dash20-d1-avg',   'd1-womens-soccer','d1-soc-dash20-d1-avg',   'site',4),
  ('bsi-d1-soc-dash20-d1-top25', 'd1-womens-soccer','d1-soc-dash20-d1-top25', 'site',5),
  ('bsi-d1-soc-fly10-d1-avg',    'd1-womens-soccer','d1-soc-fly10-d1-avg',    'site',6),
  ('bsi-d1-soc-fly10-d1-top25',  'd1-womens-soccer','d1-soc-fly10-d1-top25',  'site',7),
  ('bsi-d1-soc-tspd-hs-avg',     'd1-womens-soccer','d1-soc-tspd-hs-avg',     'site',8),
  ('bsi-d1-soc-tspd-d1-avg',     'd1-womens-soccer','d1-soc-tspd-d1-avg',     'site',9),
  ('bsi-d1-soc-tspd-d1-top25',   'd1-womens-soccer','d1-soc-tspd-d1-top25',   'site',10),
  ('bsi-d1-soc-agi5105-d1-avg',  'd1-womens-soccer','d1-soc-agi5105-d1-avg',  'site',11),
  ('bsi-d1-soc-agi5105-d1-top25','d1-womens-soccer','d1-soc-agi5105-d1-top25','site',12),
  ('bsi-d1-soc-agi505-d1-avg',   'd1-womens-soccer','d1-soc-agi505-d1-avg',   'site',13),
  ('bsi-d1-soc-agi505-d1-top25', 'd1-womens-soccer','d1-soc-agi505-d1-top25', 'site',14),
  ('bsi-d1-soc-vj-d1-avg',       'd1-womens-soccer','d1-soc-vj-d1-avg',       'site',15),
  ('bsi-d1-soc-vj-d1-top25',     'd1-womens-soccer','d1-soc-vj-d1-top25',     'site',16),

  -- D1 women's volleyball set items
  ('bsi-d1-vb-dash10-d1-avg',    'd1-womens-volleyball','d1-vb-dash10-d1-avg',  'site',1),
  ('bsi-d1-vb-dash10-d1-top25',  'd1-womens-volleyball','d1-vb-dash10-d1-top25','site',2),
  ('bsi-d1-vb-dash20-hs-avg',    'd1-womens-volleyball','d1-vb-dash20-hs-avg',  'site',3),
  ('bsi-d1-vb-dash20-d1-avg',    'd1-womens-volleyball','d1-vb-dash20-d1-avg',  'site',4),
  ('bsi-d1-vb-dash20-d1-top25',  'd1-womens-volleyball','d1-vb-dash20-d1-top25','site',5),
  ('bsi-d1-vb-agi5105-d1-avg',   'd1-womens-volleyball','d1-vb-agi5105-d1-avg', 'site',6),
  ('bsi-d1-vb-agi5105-d1-top25', 'd1-womens-volleyball','d1-vb-agi5105-d1-top25','site',7),
  ('bsi-d1-vb-agi505-d1-avg',    'd1-womens-volleyball','d1-vb-agi505-d1-avg',  'site',8),
  ('bsi-d1-vb-agi505-d1-top25',  'd1-womens-volleyball','d1-vb-agi505-d1-top25','site',9),
  ('bsi-d1-vb-vj-d1-avg',        'd1-womens-volleyball','d1-vb-vj-d1-avg',      'site',10),
  ('bsi-d1-vb-vj-d1-top25',      'd1-womens-volleyball','d1-vb-vj-d1-top25',    'site',11),
  ('bsi-d1-vb-appj-d1-avg',      'd1-womens-volleyball','d1-vb-appj-d1-avg',    'site',12),
  ('bsi-d1-vb-appj-d1-top25',    'd1-womens-volleyball','d1-vb-appj-d1-top25',  'site',13),
  ('bsi-d1-vb-blkj-d1-avg',      'd1-womens-volleyball','d1-vb-blkj-d1-avg',    'site',14),
  ('bsi-d1-vb-blkj-d1-top25',    'd1-womens-volleyball','d1-vb-blkj-d1-top25',  'site',15),

  -- HS soccer set items (MS / JV / Varsity)
  ('bsi-hs-ms-soc-dash10',  'hs-ms-female-soccer','hs-ms-soc-dash10','site',1),
  ('bsi-hs-ms-soc-dash20',  'hs-ms-female-soccer','hs-ms-soc-dash20','site',2),
  ('bsi-hs-ms-soc-fly10',   'hs-ms-female-soccer','hs-ms-soc-fly10','site',3),
  ('bsi-hs-ms-soc-tspd',    'hs-ms-female-soccer','hs-ms-soc-tspd','site',4),
  ('bsi-hs-ms-soc-vj',      'hs-ms-female-soccer','hs-ms-soc-vj','site',5),
  ('bsi-hs-ms-soc-agi505',  'hs-ms-female-soccer','hs-ms-soc-agi505','site',6),
  ('bsi-hs-ms-soc-agi5105', 'hs-ms-female-soccer','hs-ms-soc-agi5105','site',7),
  ('bsi-hs-jv-soc-dash10',  'hs-jv-female-soccer','hs-jv-soc-dash10','site',1),
  ('bsi-hs-jv-soc-dash20',  'hs-jv-female-soccer','hs-jv-soc-dash20','site',2),
  ('bsi-hs-jv-soc-fly10',   'hs-jv-female-soccer','hs-jv-soc-fly10','site',3),
  ('bsi-hs-jv-soc-tspd',    'hs-jv-female-soccer','hs-jv-soc-tspd','site',4),
  ('bsi-hs-jv-soc-vj',      'hs-jv-female-soccer','hs-jv-soc-vj','site',5),
  ('bsi-hs-jv-soc-agi505',  'hs-jv-female-soccer','hs-jv-soc-agi505','site',6),
  ('bsi-hs-jv-soc-agi5105', 'hs-jv-female-soccer','hs-jv-soc-agi5105','site',7),
  ('bsi-hs-var-soc-dash10', 'hs-varsity-female-soccer','hs-var-soc-dash10','site',1),
  ('bsi-hs-var-soc-dash20', 'hs-varsity-female-soccer','hs-var-soc-dash20','site',2),
  ('bsi-hs-var-soc-fly10',  'hs-varsity-female-soccer','hs-var-soc-fly10','site',3),
  ('bsi-hs-var-soc-tspd',   'hs-varsity-female-soccer','hs-var-soc-tspd','site',4),
  ('bsi-hs-var-soc-vj',     'hs-varsity-female-soccer','hs-var-soc-vj','site',5),
  ('bsi-hs-var-soc-agi505', 'hs-varsity-female-soccer','hs-var-soc-agi505','site',6),
  ('bsi-hs-var-soc-agi5105','hs-varsity-female-soccer','hs-var-soc-agi5105','site',7),

  -- HS volleyball set items
  ('bsi-hs-ms-vb-dash10',  'hs-ms-female-volleyball','hs-ms-vb-dash10','site',1),
  ('bsi-hs-ms-vb-vj',      'hs-ms-female-volleyball','hs-ms-vb-vj','site',2),
  ('bsi-hs-ms-vb-appj',    'hs-ms-female-volleyball','hs-ms-vb-appj','site',3),
  ('bsi-hs-ms-vb-blkj',    'hs-ms-female-volleyball','hs-ms-vb-blkj','site',4),
  ('bsi-hs-ms-vb-agi505',  'hs-ms-female-volleyball','hs-ms-vb-agi505','site',5),
  ('bsi-hs-ms-vb-agi5105', 'hs-ms-female-volleyball','hs-ms-vb-agi5105','site',6),
  ('bsi-hs-jv-vb-dash10',  'hs-jv-female-volleyball','hs-jv-vb-dash10','site',1),
  ('bsi-hs-jv-vb-vj',      'hs-jv-female-volleyball','hs-jv-vb-vj','site',2),
  ('bsi-hs-jv-vb-appj',    'hs-jv-female-volleyball','hs-jv-vb-appj','site',3),
  ('bsi-hs-jv-vb-blkj',    'hs-jv-female-volleyball','hs-jv-vb-blkj','site',4),
  ('bsi-hs-jv-vb-agi505',  'hs-jv-female-volleyball','hs-jv-vb-agi505','site',5),
  ('bsi-hs-jv-vb-agi5105', 'hs-jv-female-volleyball','hs-jv-vb-agi5105','site',6),
  ('bsi-hs-var-vb-dash10', 'hs-varsity-female-volleyball','hs-var-vb-dash10','site',1),
  ('bsi-hs-var-vb-vj',     'hs-varsity-female-volleyball','hs-var-vb-vj','site',2),
  ('bsi-hs-var-vb-appj',   'hs-varsity-female-volleyball','hs-var-vb-appj','site',3),
  ('bsi-hs-var-vb-blkj',   'hs-varsity-female-volleyball','hs-var-vb-blkj','site',4),
  ('bsi-hs-var-vb-agi505', 'hs-varsity-female-volleyball','hs-var-vb-agi505','site',5),
  ('bsi-hs-var-vb-agi5105','hs-varsity-female-volleyball','hs-var-vb-agi5105','site',6)
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block G — Summary
-- ============================================================================
DO $$
DECLARE
  v_sets       INTEGER;
  v_d1_rows    INTEGER;
  v_hs_rows    INTEGER;
  v_set_items  INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_sets FROM benchmark_sets WHERE id LIKE 'd1-womens-%' OR id LIKE 'hs-%-female-%';
  SELECT COUNT(*) INTO v_d1_rows FROM site_benchmarks WHERE id LIKE 'd1-soc-%' OR id LIKE 'd1-vb-%';
  SELECT COUNT(*) INTO v_hs_rows FROM site_benchmarks WHERE id LIKE 'hs-ms-%' OR id LIKE 'hs-jv-%' OR id LIKE 'hs-var-%';
  SELECT COUNT(*) INTO v_set_items FROM benchmark_set_items
   WHERE set_id IN (
     'd1-womens-soccer','d1-womens-volleyball',
     'hs-ms-female-soccer','hs-jv-female-soccer','hs-varsity-female-soccer',
     'hs-ms-female-volleyball','hs-jv-female-volleyball','hs-varsity-female-volleyball'
   );

  RAISE NOTICE 'Migration 0129 complete: % benchmark sets, % D1 benchmark rows (soccer + VB), % HS benchmark rows, % benchmark_set_items.',
    v_sets, v_d1_rows, v_hs_rows, v_set_items;
END $$;
