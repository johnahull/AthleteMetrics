-- Down Migration 0131: Reverse Squat Jump + EUR
--
-- Reverses migration 0131 in dependency-safe order:
--   Step 1 — benchmark_set_items
--   Step 2 — site_benchmarks rows for JUMP_SJ_HEIGHT
--   Step 3 — POWER_EUR derived metric (safe — no direct measurements)
--   Step 4 — JUMP_SJ_HEIGHT base metric (CONDITIONAL — only if no measurements)

DELETE FROM benchmark_set_items
 WHERE benchmark_id IN (
   'd1-soc-sj-d1-avg', 'd1-soc-sj-d1-top25',
   'hs-ms-soc-sj', 'hs-jv-soc-sj',
   'hs-var-soc-sj-avg', 'hs-var-soc-sj-top25',
   'd1-vb-sj-d1-avg', 'd1-vb-sj-d1-top25',
   'hs-ms-vb-sj', 'hs-jv-vb-sj',
   'hs-var-vb-sj-avg', 'hs-var-vb-sj-top25'
 );

DELETE FROM site_benchmarks
 WHERE id IN (
   'd1-soc-sj-d1-avg', 'd1-soc-sj-d1-top25',
   'hs-ms-soc-sj', 'hs-jv-soc-sj',
   'hs-var-soc-sj-avg', 'hs-var-soc-sj-top25',
   'd1-vb-sj-d1-avg', 'd1-vb-sj-d1-top25',
   'hs-ms-vb-sj', 'hs-jv-vb-sj',
   'hs-var-vb-sj-avg', 'hs-var-vb-sj-top25'
 );

DELETE FROM site_metrics WHERE code = 'POWER_EUR';

DELETE FROM site_metrics
 WHERE code = 'JUMP_SJ_HEIGHT'
   AND NOT EXISTS (SELECT 1 FROM measurements WHERE metric_code = 'JUMP_SJ_HEIGHT');

DO $$
BEGIN
  RAISE NOTICE 'Migration 0131 (down): Removed SJ benchmarks + POWER_EUR. JUMP_SJ_HEIGHT preserved if measurements reference it.';
END $$;
