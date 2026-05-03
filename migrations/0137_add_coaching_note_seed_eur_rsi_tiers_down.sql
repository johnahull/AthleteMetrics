-- Down Migration 0137: Reverse coaching_note seed + EUR tiers + bilateral RSI
--
-- Reverses 0137 in dependency-safe order:
--   Step 1 — benchmark_set_items (EUR + RSI normative + RSI asymmetry)
--   Step 2 — site_benchmarks rows (EUR tiers + RSI tier rows)
--   Step 3 — benchmark_sets (3 screening sets created in 0137)
--   Step 4 — RSI_ASYM derived metric (safe — no measurements)
--   Step 5 — RSI_L and RSI_R base metrics (CONDITIONAL — only if no
--            measurements; parallel to 0131-down's protection of JUMP_SJ_HEIGHT)
--
-- IMPORTANT: site_benchmarks.coaching_note column is NOT dropped on rollback.
-- Rationale: the column is purely additive (nullable, no default), and dropping
-- a column is a destructive schema change that would lose any coaching_note
-- data populated by future migrations or operator edits. It is safe to leave
-- the column in place after a 0137 rollback — schema stays superset-compatible
-- with 0137-up. If the column genuinely needs to be dropped (e.g., before a
-- replay), do so manually with explicit confirmation that no data will be lost.

-- Step 1 — benchmark_set_items
DELETE FROM benchmark_set_items
 WHERE benchmark_id IN (
   -- EUR
   'bench-eur-elite-reactive', 'bench-eur-trained-reactive',
   'bench-eur-functional-ssc', 'bench-eur-concentric-dominant',
   -- RSI normative L+R
   'bench-rsi-l-elite', 'bench-rsi-l-trained', 'bench-rsi-l-general', 'bench-rsi-l-floor',
   'bench-rsi-r-elite', 'bench-rsi-r-trained', 'bench-rsi-r-general', 'bench-rsi-r-floor',
   -- RSI asymmetry
   'bench-rsi-asym-symmetric', 'bench-rsi-asym-borderline',
   'bench-rsi-asym-significant', 'bench-rsi-asym-redflag'
 );

-- Step 2 — site_benchmarks rows
DELETE FROM site_benchmarks
 WHERE id IN (
   'bench-eur-elite-reactive', 'bench-eur-trained-reactive',
   'bench-eur-functional-ssc', 'bench-eur-concentric-dominant',
   'bench-rsi-l-elite', 'bench-rsi-l-trained', 'bench-rsi-l-general', 'bench-rsi-l-floor',
   'bench-rsi-r-elite', 'bench-rsi-r-trained', 'bench-rsi-r-general', 'bench-rsi-r-floor',
   'bench-rsi-asym-symmetric', 'bench-rsi-asym-borderline',
   'bench-rsi-asym-significant', 'bench-rsi-asym-redflag'
 );

-- Step 3 — benchmark_sets created by 0137
DELETE FROM benchmark_sets
 WHERE id IN (
   'set-screening-eur-diagnostic',
   'set-screening-female-rsi-normative',
   'set-screening-female-rsi-asymmetry'
 );

-- Step 4 — RSI_ASYM derived metric (safe — no direct measurements)
DELETE FROM site_metrics WHERE code = 'RSI_ASYM';

-- Step 5 — RSI_L / RSI_R base metrics (only if unused)
DELETE FROM site_metrics
 WHERE code IN ('RSI_L', 'RSI_R')
   AND NOT EXISTS (
     SELECT 1 FROM measurements WHERE metric_code IN ('RSI_L', 'RSI_R')
   );

-- Note: coaching_note column is NOT dropped — see header comment above.

DO $$
BEGIN
  RAISE NOTICE 'Migration 0137 (down): Removed EUR tiers, RSI tier rows, screening sets, RSI_ASYM. RSI_L/RSI_R preserved if measurements reference them. coaching_note column intentionally retained.';
END $$;
