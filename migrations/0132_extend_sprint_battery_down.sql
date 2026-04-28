-- Down Migration 0132: Reverse Sprint Battery Extension
--
-- Reverses migration 0132 in dependency-safe order. Notably, Block G's VB
-- cleanup is NOT restored — restoring those linkages would require knowing
-- AM-FEAT-007's exact row IDs, which we do, but the VB cleanup is a
-- deliberate scope decision (John 2026-04-27) and shouldn't be reverted by
-- rolling back this migration alone. If full restore needed, re-run
-- AM-FEAT-007's migration after this down migration.

-- Step 1 — benchmark_set_items
DELETE FROM benchmark_set_items
 WHERE id IN (
   'bsi-d1-soc-dash30-d1-avg', 'bsi-d1-soc-dash30-d1-top25',
   'bsi-d1-soc-dash40-d1-avg', 'bsi-d1-soc-dash40-d1-top25',
   'bsi-hs-ms-soc-dash30', 'bsi-hs-jv-soc-dash30', 'bsi-hs-var-soc-dash30',
   'bsi-hs-ms-soc-dash40', 'bsi-hs-jv-soc-dash40',
   'bsi-hs-var-soc-dash40-avg', 'bsi-hs-var-soc-dash40-top25',
   'bsi-dii-soc-dash10', 'bsi-dii-soc-dash20', 'bsi-dii-soc-dash30',
   'bsi-dii-soc-dash40', 'bsi-dii-soc-fly10',
   'bsi-diii-soc-dash10', 'bsi-diii-soc-dash20', 'bsi-diii-soc-dash30',
   'bsi-diii-soc-dash40', 'bsi-diii-soc-fly10'
 );

-- Step 2 — site_benchmarks (D1 + HS new + DII + DIII)
DELETE FROM site_benchmarks
 WHERE id IN (
   'd1-soc-dash30-d1-avg', 'd1-soc-dash30-d1-top25',
   'd1-soc-dash40-d1-avg', 'd1-soc-dash40-d1-top25',
   'hs-ms-soc-dash30', 'hs-jv-soc-dash30', 'hs-var-soc-dash30',
   'hs-ms-soc-dash40', 'hs-jv-soc-dash40',
   'hs-var-soc-dash40-avg', 'hs-var-soc-dash40-top25',
   'dii-soc-dash10-thresh', 'dii-soc-dash20-thresh', 'dii-soc-dash30-thresh',
   'dii-soc-dash40-thresh', 'dii-soc-fly10-thresh',
   'diii-soc-dash10-thresh', 'diii-soc-dash20-thresh', 'diii-soc-dash30-thresh',
   'diii-soc-dash40-thresh', 'diii-soc-fly10-thresh'
 );

-- Step 3 — DII / DIII sets
DELETE FROM benchmark_sets WHERE id IN ('dii-womens-soccer', 'diii-womens-soccer');

-- DASH_30YD / DASH_40YD metrics intentionally NOT removed (DO NOTHING was used;
-- if they pre-existed, they belong to migration 0107 and must stay).

DO $$
BEGIN
  RAISE NOTICE 'Migration 0132 (down): Removed DII/DIII sets, new metric benchmark rows, DASH_30YD/40YD HS rows. VB DASH_20YD cleanup NOT reversed (deliberate scope decision per spec).';
END $$;
