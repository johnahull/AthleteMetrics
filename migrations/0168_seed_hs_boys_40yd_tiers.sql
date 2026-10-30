-- Migration 0168: HS boys 40-yard dash tier group + site benchmark set
--
-- Source: OVR Performance, "Average High School 40-Yard Dash" (boys, laser timing gates, rolling start).
-- The source lists cumulative shares (<= time = % of athletes). Five cutoffs are seeded as an `lte` tier group:
--   Elite <= 4.60 s (1.2%) | Excellent <= 4.80 s (12.2%) | Above Average <= 5.00 s (38.4%)
--   Average <= 5.20 s (62.7%) | Below Average <= 5.50 s (83.3%)
-- Times slower than 5.50 s are graded Below Average by the tier evaluator's fallback.
--
-- Rolling-start times run faster than standing-start times; the cutoffs are used as published.
-- Boys only: the athlete-profile tier lookup does not filter on gender, so an organization that enables this group
-- also grades its girls against it. Sport and ages stay NULL, so eval reports never use these rows.
--
-- Block A — five tier benchmarks (shared tier_group_id; tier_order 1 = best)
-- Block B — site benchmark set
-- Block C — set items
-- Block D — summary

INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_group_id, tier_order, tier_name, tier_color,
  gender, level,
  is_system_default, is_active, display_order
) VALUES
  ('bench-hs-boys-40yd-elite', 'DASH_40YD', 'HS Boys 40 yd - Elite (≤4.60)',
   'OVR Performance HS boys 40-yard dash data, laser timed, rolling start: 4.60 s or faster = 1.2% of athletes. Rolling-start times run faster than standing-start times. Boys only.',
   'lte', 4.60, 'b0400000-0168-4000-8000-000000000040'::uuid, 1, 'Elite', 'green', 'Male', 'HS', true, true, 1),

  ('bench-hs-boys-40yd-excellent', 'DASH_40YD', 'HS Boys 40 yd - Excellent (≤4.80)',
   'OVR Performance HS boys 40-yard dash data, laser timed, rolling start: 4.80 s or faster = 12.2% of athletes. Rolling-start times run faster than standing-start times. Boys only.',
   'lte', 4.80, 'b0400000-0168-4000-8000-000000000040'::uuid, 2, 'Excellent', 'blue', 'Male', 'HS', true, true, 2),

  ('bench-hs-boys-40yd-above-avg', 'DASH_40YD', 'HS Boys 40 yd - Above Average (≤5.00)',
   'OVR Performance HS boys 40-yard dash data, laser timed, rolling start: 5.00 s or faster = 38.4% of athletes. Rolling-start times run faster than standing-start times. Boys only.',
   'lte', 5.00, 'b0400000-0168-4000-8000-000000000040'::uuid, 3, 'Above Average', 'gray', 'Male', 'HS', true, true, 3),

  ('bench-hs-boys-40yd-average', 'DASH_40YD', 'HS Boys 40 yd - Average (≤5.20)',
   'OVR Performance HS boys 40-yard dash data, laser timed, rolling start: 5.20 s or faster = 62.7% of athletes. Rolling-start times run faster than standing-start times. Boys only.',
   'lte', 5.20, 'b0400000-0168-4000-8000-000000000040'::uuid, 4, 'Average', 'yellow', 'Male', 'HS', true, true, 4),

  ('bench-hs-boys-40yd-below-avg', 'DASH_40YD', 'HS Boys 40 yd - Below Average (≤5.50)',
   'OVR Performance HS boys 40-yard dash data, laser timed, rolling start: 5.50 s or faster = 83.3% of athletes; slower times are also graded here. Rolling-start times run faster than standing-start times. Boys only.',
   'lte', 5.50, 'b0400000-0168-4000-8000-000000000040'::uuid, 5, 'Below Average', 'orange', 'Male', 'HS', true, true, 5)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_group_id = EXCLUDED.tier_group_id,
  tier_order = EXCLUDED.tier_order,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  gender = EXCLUDED.gender,
  level = EXCLUDED.level,
  display_order = EXCLUDED.display_order,
  is_active = true,
  updated_at = NOW();

INSERT INTO benchmark_sets (
  id, organization_id, name, description, sport, level, gender,
  is_template, is_active
) VALUES (
  'set-hs-boys-40yd-ovr',
  NULL,
  'HS Boys 40-Yard Dash (OVR)',
  'Five-tier high school boys 40-yard dash grading from OVR Performance data (laser timed, rolling start).',
  NULL,
  'HS',
  'Male',
  true, true
)
ON CONFLICT (id) DO UPDATE SET
  name = EXCLUDED.name,
  description = EXCLUDED.description,
  level = EXCLUDED.level,
  gender = EXCLUDED.gender,
  is_template = EXCLUDED.is_template,
  is_active = true,
  updated_at = NOW();

INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
VALUES
  ('bsi-hs-boys-40yd-elite',     'set-hs-boys-40yd-ovr', 'bench-hs-boys-40yd-elite',     'site', 1),
  ('bsi-hs-boys-40yd-excellent', 'set-hs-boys-40yd-ovr', 'bench-hs-boys-40yd-excellent', 'site', 2),
  ('bsi-hs-boys-40yd-above-avg', 'set-hs-boys-40yd-ovr', 'bench-hs-boys-40yd-above-avg', 'site', 3),
  ('bsi-hs-boys-40yd-average',   'set-hs-boys-40yd-ovr', 'bench-hs-boys-40yd-average',   'site', 4),
  ('bsi-hs-boys-40yd-below-avg', 'set-hs-boys-40yd-ovr', 'bench-hs-boys-40yd-below-avg', 'site', 5)
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

DO $$
DECLARE
  v_tiers INTEGER;
  v_items INTEGER;
BEGIN
  SELECT COUNT(*) INTO v_tiers FROM site_benchmarks WHERE id LIKE 'bench-hs-boys-40yd-%';
  SELECT COUNT(*) INTO v_items FROM benchmark_set_items WHERE set_id = 'set-hs-boys-40yd-ovr';
  RAISE NOTICE 'Migration 0168 complete: % HS boys 40 yd tier rows, % set items.', v_tiers, v_items;
END $$;
