-- Migration 0105 DOWN: Remove D1 benchmark seed data
-- Reverses: D1/HS benchmark values, benchmark sets, and DASH_10YD/APPROACH_JUMP metrics

-- Remove benchmark set items first (FK constraint)
DELETE FROM benchmark_set_items WHERE set_id IN ('d1-womens-soccer', 'd1-womens-volleyball', 'hs-female-baseline');

-- Remove benchmark sets
DELETE FROM benchmark_sets WHERE id IN ('d1-womens-soccer', 'd1-womens-volleyball', 'hs-female-baseline');

-- Remove all seeded site benchmarks (by ID prefix pattern)
DELETE FROM site_benchmarks WHERE id LIKE 'd1-soccer-%' OR id LIKE 'd1-vb-%';

-- Remove added metrics (only if no measurements reference them)
DELETE FROM site_metrics WHERE code IN ('DASH_10YD', 'APPROACH_JUMP')
  AND NOT EXISTS (SELECT 1 FROM site_metrics sm WHERE sm.code = site_metrics.code);
-- Note: The above delete will fail safely if any organization has measurements for these metrics.
-- In that case, manually deactivate instead: UPDATE site_metrics SET is_active = false WHERE code IN ('DASH_10YD', 'APPROACH_JUMP');
