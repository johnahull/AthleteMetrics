-- Migration 0165: remove the seeded squat jump (JUMP_SJ_HEIGHT) benchmarks
--
-- The 12 benchmarks seeded by 0131 (soccer + volleyball, D1 + HS) were extrapolated from CMJ baselines minus an
-- assumed 15-25% SSC contribution, not from squat jump data. Coaches measure female soccer players at 17-19 in,
-- well above the seeded D1 Average of 10.2 in, so the tiers misrate athletes.
-- Removed: the 12 site_benchmarks rows and their benchmark_set_items rows.
-- Not touched: the JUMP_SJ_HEIGHT and POWER_EUR metrics, athlete measurements, other benchmarks.
-- Saved eval reports keep their frozen gauge; they are not regenerated.
-- Idempotent. Reversible: 0165_remove_squat_jump_benchmarks_down.sql (restores the 0131 values).
-- Transaction: supplied by scripts/apply-manual-migrations.js, so no BEGIN/COMMIT here.

DELETE FROM benchmark_set_items
 WHERE benchmark_type = 'site'
   AND benchmark_id IN (
     'd1-soc-sj-d1-avg', 'd1-soc-sj-d1-top25',
     'hs-ms-soc-sj', 'hs-jv-soc-sj',
     'hs-var-soc-sj-avg', 'hs-var-soc-sj-top25',
     'd1-vb-sj-d1-avg', 'd1-vb-sj-d1-top25',
     'hs-ms-vb-sj', 'hs-jv-vb-sj',
     'hs-var-vb-sj-avg', 'hs-var-vb-sj-top25'
   );

DELETE FROM site_benchmarks
 WHERE metric_code = 'JUMP_SJ_HEIGHT'
   AND id IN (
     'd1-soc-sj-d1-avg', 'd1-soc-sj-d1-top25',
     'hs-ms-soc-sj', 'hs-jv-soc-sj',
     'hs-var-soc-sj-avg', 'hs-var-soc-sj-top25',
     'd1-vb-sj-d1-avg', 'd1-vb-sj-d1-top25',
     'hs-ms-vb-sj', 'hs-jv-vb-sj',
     'hs-var-vb-sj-avg', 'hs-var-vb-sj-top25'
   );
