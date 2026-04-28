-- Down Migration 0128: Reverse Bilateral 5-0-5 + LSI Screening
--
-- Reverses migration 0128 in dependency-safe order:
--   Step 1 — benchmark_set_items rows (Blocks D + F)        [soft refs, no FK]
--   Step 2 — site_benchmarks rows (Blocks C + E)            [referenced by step 1]
--   Step 3 — benchmark_sets row (Block B)
--   Step 4 — site_metrics row (Block A)                     [last; ON DELETE CASCADE
--                                                            on site_benchmarks.metric_code
--                                                            would otherwise pre-empt step 2]
--
-- Idempotent: each DELETE is bounded by deterministic IDs or metric_code filters,
-- so re-running this is a no-op once the rows are gone.

-- ============================================================================
-- Step 1a — Block F reversal: per-leg benchmark_set_items rows
-- Match by benchmark_type + the metric_code of the referenced site_benchmark,
-- which is more robust than relying on ID suffix patterns alone.
-- ============================================================================
DELETE FROM benchmark_set_items
 WHERE benchmark_type = 'site'
   AND benchmark_id IN (
     SELECT id
       FROM site_benchmarks
      WHERE metric_code IN ('AGILITY_505_L', 'AGILITY_505_R')
   );

-- ============================================================================
-- Step 1b — Block D reversal: LSI tier benchmark_set_items rows
-- ============================================================================
DELETE FROM benchmark_set_items
 WHERE id IN (
   'bsi-screening-asym-lsi-normal',
   'bsi-screening-asym-lsi-monitor',
   'bsi-screening-asym-lsi-elevated'
 );

-- ============================================================================
-- Step 2a — Block E reversal: per-leg AGILITY_505_L / _R tier rows
-- The tier_group_id IS NOT NULL filter scopes the delete to tier-group rows
-- and avoids touching any single-value benchmarks that may exist for these
-- codes (defensive — none should, but the filter is essentially free).
-- ============================================================================
DELETE FROM site_benchmarks
 WHERE metric_code IN ('AGILITY_505_L', 'AGILITY_505_R')
   AND tier_group_id IS NOT NULL;

-- ============================================================================
-- Step 2b — Block C reversal: LSI tier rows
-- ============================================================================
DELETE FROM site_benchmarks
 WHERE id IN (
   'bench-screening-asym-lsi-normal',
   'bench-screening-asym-lsi-monitor',
   'bench-screening-asym-lsi-elevated'
 );

-- ============================================================================
-- Step 3 — Block B reversal: screening benchmark set
-- ============================================================================
DELETE FROM benchmark_sets
 WHERE id = 'set-screening-female-bilateral-asymmetry';

-- ============================================================================
-- Step 4 — Block A reversal: LSI derived metric
-- ============================================================================
DELETE FROM site_metrics
 WHERE code = 'AGILITY_505_LSI';

DO $$
BEGIN
  RAISE NOTICE 'Migration 0128 (down): Removed AGILITY_505_LSI derived metric, screening benchmark set, LSI tier rows, and all per-leg AGILITY_505_L / _R tier copies.';
END $$;
