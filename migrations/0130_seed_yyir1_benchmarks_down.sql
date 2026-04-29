-- Down Migration 0130: Reverse Yo-Yo IR1 Benchmark Seeding
--
-- Reverses migration 0130 in dependency-safe order:
--   Step 1 — benchmark_set_items rows
--   Step 2 — site_benchmarks rows for YYIR1
--   Step 3 — COND_VO2MAX_EST derived metric (safe — no direct measurements)
--   Step 4 — COND_YYIR1_DISTANCE base metric (CONDITIONAL — only if no measurements reference it)
--
-- WARNING: COND_YYIR1_DISTANCE may have measurement data after FIERCE Spring 2026
-- collection. Step 4's NOT EXISTS guard prevents accidental data loss.

-- ============================================================================
-- Step 1 — benchmark_set_items
-- ============================================================================
DELETE FROM benchmark_set_items
 WHERE id IN (
   'bsi-d1-soc-yyir1-hs-avg', 'bsi-d1-soc-yyir1-d1-avg',
   'bsi-d1-soc-yyir1-d1-top25', 'bsi-d1-soc-yyir1-elite',
   'bsi-hs-ms-soc-yyir1', 'bsi-hs-jv-soc-yyir1',
   'bsi-hs-var-soc-yyir1-avg', 'bsi-hs-var-soc-yyir1-top25'
 );

-- ============================================================================
-- Step 2 — site_benchmarks rows for YYIR1
-- ============================================================================
DELETE FROM site_benchmarks
 WHERE id IN (
   'd1-soc-yyir1-hs-avg', 'd1-soc-yyir1-d1-avg',
   'd1-soc-yyir1-d1-top25', 'd1-soc-yyir1-elite',
   'hs-ms-soc-yyir1', 'hs-jv-soc-yyir1',
   'hs-var-soc-yyir1-avg', 'hs-var-soc-yyir1-top25'
 );

-- ============================================================================
-- Step 3 — COND_VO2MAX_EST derived metric
-- Safe to delete — derived metrics compute from others, no direct measurements.
-- ============================================================================
DELETE FROM site_metrics WHERE code = 'COND_VO2MAX_EST';

-- ============================================================================
-- Step 4 — COND_YYIR1_DISTANCE base metric (CONDITIONAL)
-- Preserve if any measurements reference it — protects FIERCE collection data.
-- ============================================================================
DELETE FROM site_metrics
 WHERE code = 'COND_YYIR1_DISTANCE'
   AND NOT EXISTS (
     SELECT 1 FROM measurements WHERE metric_code = 'COND_YYIR1_DISTANCE'
   );

DO $$
BEGIN
  RAISE NOTICE 'Migration 0130 (down): Removed YYIR1 benchmarks + COND_VO2MAX_EST derived metric. COND_YYIR1_DISTANCE preserved if measurements reference it.';
END $$;
