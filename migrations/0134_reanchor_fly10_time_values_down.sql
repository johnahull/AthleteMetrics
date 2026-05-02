-- Down Migration 0134: Revert FLY10_TIME re-anchoring
--
-- Restores the pre-2026-04-29 values from migration 0129 (AM-FEAT-007).
-- WARNING: those values are now considered stale per spec. Down migration
-- is provided for rollback parity, not as a recommended state to revert to.

UPDATE site_benchmarks
   SET benchmark_value = 1.280,
       description = 'Mid of 1.22-1.34 (Vescovi 2012 peak speed 27.3 km/h derived). Confidence: LOW-MODERATE.',
       updated_at = NOW()
 WHERE id = 'd1-soc-fly10-d1-avg';

UPDATE site_benchmarks
   SET benchmark_value = 1.100,
       description = 'Auburn 15yd fly ~1.1s; 10yd fly faster. Confidence: LOW-MODERATE.',
       updated_at = NOW()
 WHERE id = 'd1-soc-fly10-d1-top25';

UPDATE site_benchmarks
   SET benchmark_value = 1.720,
       description = 'Extrapolated from sprint development curves. Confidence: LOW — estimated, pending BTA internal data.',
       updated_at = NOW()
 WHERE id = 'hs-ms-soc-fly10';

UPDATE site_benchmarks
   SET benchmark_value = 1.580,
       description = 'Extrapolated from sprint development curves. Confidence: LOW — estimated, pending BTA internal data.',
       updated_at = NOW()
 WHERE id = 'hs-jv-soc-fly10';

UPDATE site_benchmarks
   SET benchmark_value = 1.480,
       description = 'Extrapolated from sprint development curves. Confidence: LOW — estimated, pending BTA internal data.',
       updated_at = NOW()
 WHERE id = 'hs-var-soc-fly10';

DO $$
BEGIN
  RAISE NOTICE 'Migration 0134 (down): Reverted FLY10_TIME values to pre-2026-04-29 spec state.';
END $$;
