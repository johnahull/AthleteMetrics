-- Down Migration 0165: restore the 12 squat jump benchmarks seeded by 0131
--
-- Literal 0131 values. Set items are restored only for sets that still exist. Forgets this migration's
-- manual_migrations row so the next forward deploy re-applies it. Athlete measurements are not touched.

INSERT INTO site_benchmarks (
  id, metric_code, name, description,
  comparison_operator, benchmark_value,
  tier_name, tier_color,
  gender, sport, level, age_min, age_max,
  is_system_default, is_active, display_order
) VALUES
  ('d1-soc-sj-d1-avg', 'JUMP_SJ_HEIGHT', 'Soccer D1 Average', '26 cm = 10.2 in. Extrapolated from CMJ-HOH baseline minus typical 15-25% SSC contribution. Confidence: LOW-MODERATE — pending BTA internal data.', 'gte', 10.200, 'D1 Average', 'blue', 'Female', 'SOCCER', 'D1', NULL, NULL, true, true, 2),
  ('d1-soc-sj-d1-top25', 'JUMP_SJ_HEIGHT', 'Soccer D1 Top 25%', '30 cm = 11.8 in. Top D1 starters concentric-power baseline. Confidence: LOW — pending BTA internal data.', 'gte', 11.800, 'D1 Top 25%', 'green', 'Female', 'SOCCER', 'D1', NULL, NULL, true, true, 3),
  ('hs-ms-soc-sj', 'JUMP_SJ_HEIGHT', 'HS MS Female Soccer (Ages 11-13) Average', '16 cm = 6.3 in. Confidence: LOW — estimated, pending BTA internal data accumulation. Limited published MS-age female SJ norms.', 'gte', 6.300, 'MS Average', 'gray', 'Female', 'SOCCER', 'HS', 11, 13, true, true, 1),
  ('hs-jv-soc-sj', 'JUMP_SJ_HEIGHT', 'HS JV Female Soccer (Ages 14-15) Average', '19 cm = 7.5 in. Confidence: LOW — extrapolated, pending BTA internal data.', 'gte', 7.500, 'JV Average', 'gray', 'Female', 'SOCCER', 'HS', 14, 15, true, true, 1),
  ('hs-var-soc-sj-avg', 'JUMP_SJ_HEIGHT', 'HS Varsity Female Soccer (Ages 16-18) Average', '22 cm = 8.7 in. Confidence: LOW — extrapolated, pending BTA internal data.', 'gte', 8.700, 'Varsity Average', 'gray', 'Female', 'SOCCER', 'HS', 16, 18, true, true, 1),
  ('hs-var-soc-sj-top25', 'JUMP_SJ_HEIGHT', 'HS Varsity Female Soccer (Ages 16-18) Top 25%', '26 cm = 10.2 in. Approaches D1 Average — high-tier HS achievable. Confidence: LOW — extrapolated.', 'gte', 10.200, 'Varsity Top 25%', 'green', 'Female', 'SOCCER', 'HS', 16, 18, true, true, 2),
  ('d1-vb-sj-d1-avg', 'JUMP_SJ_HEIGHT', 'Volleyball D1 Average', '38 cm = 15.0 in. Extrapolated from VB CMJ-HOH baseline minus typical 15-25% SSC contribution. Confidence: LOW-MODERATE — pending BTA internal data.', 'gte', 15.000, 'D1 Average', 'blue', 'Female', 'VOLLEYBALL', 'D1', NULL, NULL, true, true, 2),
  ('d1-vb-sj-d1-top25', 'JUMP_SJ_HEIGHT', 'Volleyball D1 Top 25%', '44 cm = 17.3 in. Top D1 VB MB/OH concentric-power baseline. Confidence: LOW — pending BTA internal data.', 'gte', 17.300, 'D1 Top 25%', 'green', 'Female', 'VOLLEYBALL', 'D1', NULL, NULL, true, true, 3),
  ('hs-ms-vb-sj', 'JUMP_SJ_HEIGHT', 'HS MS Female Volleyball (Ages 11-13) Average', '22 cm = 8.7 in. Confidence: LOW — estimated, pending BTA internal data.', 'gte', 8.700, 'MS Average', 'gray', 'Female', 'VOLLEYBALL', 'HS', 11, 13, true, true, 1),
  ('hs-jv-vb-sj', 'JUMP_SJ_HEIGHT', 'HS JV Female Volleyball (Ages 14-15) Average', '26 cm = 10.2 in. Confidence: LOW — extrapolated.', 'gte', 10.200, 'JV Average', 'gray', 'Female', 'VOLLEYBALL', 'HS', 14, 15, true, true, 1),
  ('hs-var-vb-sj-avg', 'JUMP_SJ_HEIGHT', 'HS Varsity Female Volleyball (Ages 16-18) Average', '30 cm = 11.8 in. Confidence: LOW — extrapolated.', 'gte', 11.800, 'Varsity Average', 'gray', 'Female', 'VOLLEYBALL', 'HS', 16, 18, true, true, 1),
  ('hs-var-vb-sj-top25', 'JUMP_SJ_HEIGHT', 'HS Varsity Female Volleyball (Ages 16-18) Top 25%', '36 cm = 14.2 in. High-tier HS volleyball. Confidence: LOW — extrapolated.', 'gte', 14.200, 'Varsity Top 25%', 'green', 'Female', 'VOLLEYBALL', 'HS', 16, 18, true, true, 2)
ON CONFLICT (metric_code, name) DO UPDATE SET
  description = EXCLUDED.description,
  comparison_operator = EXCLUDED.comparison_operator,
  benchmark_value = EXCLUDED.benchmark_value,
  tier_name = EXCLUDED.tier_name,
  tier_color = EXCLUDED.tier_color,
  is_active = true,
  updated_at = NOW();

INSERT INTO benchmark_set_items (id, set_id, benchmark_id, benchmark_type, display_order)
SELECT v.id, v.set_id, v.benchmark_id, v.benchmark_type, v.display_order
  FROM (VALUES
  ('bsi-d1-soc-sj-d1-avg', 'd1-womens-soccer', 'd1-soc-sj-d1-avg', 'site', 60),
  ('bsi-d1-soc-sj-d1-top25', 'd1-womens-soccer', 'd1-soc-sj-d1-top25', 'site', 61),
  ('bsi-hs-ms-soc-sj', 'hs-ms-female-soccer', 'hs-ms-soc-sj', 'site', 60),
  ('bsi-hs-jv-soc-sj', 'hs-jv-female-soccer', 'hs-jv-soc-sj', 'site', 60),
  ('bsi-hs-var-soc-sj-avg', 'hs-varsity-female-soccer', 'hs-var-soc-sj-avg', 'site', 60),
  ('bsi-hs-var-soc-sj-top25', 'hs-varsity-female-soccer', 'hs-var-soc-sj-top25', 'site', 61),
  ('bsi-d1-vb-sj-d1-avg', 'd1-womens-volleyball', 'd1-vb-sj-d1-avg', 'site', 60),
  ('bsi-d1-vb-sj-d1-top25', 'd1-womens-volleyball', 'd1-vb-sj-d1-top25', 'site', 61),
  ('bsi-hs-ms-vb-sj', 'hs-ms-female-volleyball', 'hs-ms-vb-sj', 'site', 60),
  ('bsi-hs-jv-vb-sj', 'hs-jv-female-volleyball', 'hs-jv-vb-sj', 'site', 60),
  ('bsi-hs-var-vb-sj-avg', 'hs-varsity-female-volleyball', 'hs-var-vb-sj-avg', 'site', 60),
  ('bsi-hs-var-vb-sj-top25', 'hs-varsity-female-volleyball', 'hs-var-vb-sj-top25', 'site', 61)
  ) AS v(id, set_id, benchmark_id, benchmark_type, display_order)
  JOIN benchmark_sets s ON s.id = v.set_id
ON CONFLICT (set_id, benchmark_id, benchmark_type) DO UPDATE SET
  display_order = EXCLUDED.display_order;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0165_remove_squat_jump_benchmarks';
  END IF;
END $$;
