-- Down Migration 0136: Reverse JUMP_BROAD addition
--
-- Reverses 0136 in dependency-safe order:
--   Step 1 — benchmark_set_items
--   Step 2 — site_benchmarks rows for JUMP_BROAD
--   Step 3 — JUMP_BROAD base metric (CONDITIONAL — only if no measurements
--            reference it; parallel to 0131-down's protection of JUMP_SJ_HEIGHT)

DELETE FROM benchmark_set_items
 WHERE benchmark_id IN (
   'd1-soc-broad-d1-avg', 'd1-soc-broad-d1-elite',
   'hs-ms-soc-broad', 'hs-jv-soc-broad',
   'hs-var-soc-broad-avg', 'hs-var-soc-broad-top25'
 );

DELETE FROM site_benchmarks
 WHERE id IN (
   'd1-soc-broad-d1-avg', 'd1-soc-broad-d1-elite',
   'hs-ms-soc-broad', 'hs-jv-soc-broad',
   'hs-var-soc-broad-avg', 'hs-var-soc-broad-top25'
 );

DELETE FROM site_metrics
 WHERE code = 'JUMP_BROAD'
   AND NOT EXISTS (SELECT 1 FROM measurements WHERE metric_code = 'JUMP_BROAD');

DO $$
BEGIN
  RAISE NOTICE 'Migration 0136 (down): Removed JUMP_BROAD benchmarks. JUMP_BROAD metric preserved if measurements reference it.';
END $$;
