-- Migration 0136: Add JUMP_BROAD base metric + D1/HS Female Soccer benchmarks
--
-- Adds the standing long jump (a.k.a. broad jump) as a first-class base metric
-- and seeds D1 + HS age-grouped tier values for female soccer per
-- bta-business/docs/benchmarks/d1-soccer-benchmarks.md §3 ("Broad Jump /
-- Standing Long Jump"). MODERATE confidence at D1; LOW / LOW-MODERATE at HS
-- (extrapolated from spec's Elite HS / Average HS anchors using the same
-- pattern as 0131's age-grouped HS rows).
--
-- VB / basketball / football benchmarks are deferred — those sports are not
-- tabulated in the BTA spec at this time.
--
-- Storage convention: inches (matches VERTICAL_JUMP, JUMP_SJ_HEIGHT,
-- APPROACH_JUMP, BLOCK_JUMP). Spec source values are in cm; conversion shown
-- in the description on each benchmark row.
--
-- Block layout:
--   A — JUMP_BROAD base metric
--   B — Soccer benchmark rows (D1 + HS age-grouped, female)
--   C — benchmark_set_items linkages
--   D — RAISE NOTICE summary

-- ============================================================================
-- Block A — JUMP_BROAD base metric
-- ============================================================================
INSERT INTO site_metrics (
  code, label, category, unit, metric_type, is_system_default, is_active,
  display_order, description, decimal_precision, color, icon,
  validation_min, validation_max
) VALUES (
  'JUMP_BROAD',
  'Broad Jump',
  'Power',
  'in',
  'higher_is_better',
  true, true,
  64,
  'Standing long jump (broad jump): athlete stands behind a marked line, performs a two-foot take-off with a counter-movement, and jumps horizontally for maximum distance. Distance is measured from the take-off line to the nearest heel landing. Tests horizontal explosive power; complements VERTICAL_JUMP (vertical) and JUMP_SJ_HEIGHT (concentric-only) in a power profile. Position-neutral for soccer (Lockie & Moreno 2016 — no significant positional differences).',
  1, 'red', 'ArrowRight',
  12, 170
)
ON CONFLICT (code) DO UPDATE SET
  label = EXCLUDED.label,
  description = EXCLUDED.description,
  metric_type = EXCLUDED.metric_type,
  unit = EXCLUDED.unit,
  validation_min = EXCLUDED.validation_min,
  validation_max = EXCLUDED.validation_max,
  is_active = true;

-- ============================================================================
-- Block B — Soccer Broad Jump benchmark rows
--
-- Source values from d1-soccer-benchmarks.md §3 (cm); inches conversion shown
-- in parentheticals. `gte` operator with lower bound of spec range (matches
-- 0131's seeding choice). HS age-grouped rows are extrapolated from spec's
-- 'Elite HS' (165 cm = 65 in) and 'Average HS' (150 cm = 59.1 in) anchors.
-- ============================================================================
INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level, age_min, age_max,
  is_system_default, is_active, display_order
) VALUES
  -- D1 women's soccer
  ('d1-soc-broad-d1-avg',
   'JUMP_BROAD', 'Soccer D1 Average',
   '178 cm = 70.1 in (lower bound of spec D1 Average range 178–197 cm). Source: Hilton 2021. Confidence: MODERATE.',
   'gte', 70.100, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', NULL, NULL, true, true, 4),

  ('d1-soc-broad-d1-elite',
   'JUMP_BROAD', 'Soccer D1 Top 25%',
   '197 cm = 77.6 in (lower bound of spec D1 Elite range 197–210 cm). Source: Lockie & Moreno 2016 (D1 starters). Confidence: MODERATE.',
   'gte', 77.600, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', NULL, NULL, true, true, 5),

  -- HS age-grouped soccer
  ('hs-ms-soc-broad',
   'JUMP_BROAD', 'HS MS Female Soccer (Ages 11-13) Average',
   '~130 cm = 51.2 in. Confidence: LOW — extrapolated below spec''s ''Average HS'' floor (150 cm), pending BTA internal data. Limited published MS-age female broad jump norms.',
   'gte', 51.200, 'MS Average', 'gray', 'Female', 'SOCCER', 'HS', 11, 13, true, true, 4),

  ('hs-jv-soc-broad',
   'JUMP_BROAD', 'HS JV Female Soccer (Ages 14-15) Average',
   '~145 cm = 57.1 in. Confidence: LOW — extrapolated between MS and Varsity Average anchors, pending BTA internal data.',
   'gte', 57.100, 'JV Average', 'gray', 'Female', 'SOCCER', 'HS', 14, 15, true, true, 4),

  ('hs-var-soc-broad-avg',
   'JUMP_BROAD', 'HS Varsity Female Soccer (Ages 16-18) Average',
   '150 cm = 59.1 in (spec ''Average HS'' lower bound). Confidence: LOW-MODERATE — extrapolated from HS-tier anchor in d1-soccer-benchmarks.md §3.',
   'gte', 59.100, 'Varsity Average', 'gray', 'Female', 'SOCCER', 'HS', 16, 18, true, true, 4),

  ('hs-var-soc-broad-top25',
   'JUMP_BROAD', 'HS Varsity Female Soccer (Ages 16-18) Top 25%',
   '165 cm = 65.0 in (spec ''Elite HS'' lower bound, approaches D1 Average — high-tier HS achievable). Confidence: LOW-MODERATE.',
   'gte', 65.000, 'Varsity Top 25%', 'green', 'Female', 'SOCCER', 'HS', 16, 18, true, true, 5)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true,
  updated_at = NOW();

-- ============================================================================
-- Block C — benchmark_set_items linkages
-- ============================================================================
INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
VALUES
  ('bsi-d1-soc-broad-d1-avg',     'd1-womens-soccer',         'd1-soc-broad-d1-avg',     'site', 70),
  ('bsi-d1-soc-broad-d1-elite',   'd1-womens-soccer',         'd1-soc-broad-d1-elite',   'site', 71),
  ('bsi-hs-ms-soc-broad',         'hs-ms-female-soccer',      'hs-ms-soc-broad',         'site', 70),
  ('bsi-hs-jv-soc-broad',         'hs-jv-female-soccer',      'hs-jv-soc-broad',         'site', 70),
  ('bsi-hs-var-soc-broad-avg',    'hs-varsity-female-soccer', 'hs-var-soc-broad-avg',    'site', 70),
  ('bsi-hs-var-soc-broad-top25',  'hs-varsity-female-soccer', 'hs-var-soc-broad-top25',  'site', 71)
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

-- ============================================================================
-- Block D — Summary
-- ============================================================================
DO $$
DECLARE
  v_broad_rows  INTEGER;
  v_set_items   INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_broad_rows FROM site_benchmarks WHERE metric_code = 'JUMP_BROAD';
  SELECT COUNT(*) INTO v_set_items FROM benchmark_set_items WHERE benchmark_id LIKE '%-broad-%' OR benchmark_id LIKE '%-broad';

  RAISE NOTICE 'Migration 0136 complete: JUMP_BROAD metric, % soccer benchmark rows, % set_items.',
    v_broad_rows, v_set_items;
END $$;
