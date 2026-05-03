-- Down Migration 0133: Reverse DII/DIII Non-Sprint Tier Extension
--
-- Reverses migration 0133 in dependency-safe order:
--   Step 1 — benchmark_set_items rows
--   Step 2 — site_benchmarks rows
--
-- Pure additive PR — no metrics or sets were created, so down migration only
-- removes the 6 + 6 rows it inserted.

DELETE FROM benchmark_set_items
 WHERE id IN (
   'bsi-dii-soc-505',  'bsi-dii-soc-pro',  'bsi-dii-soc-yyir1',
   'bsi-diii-soc-505', 'bsi-diii-soc-pro', 'bsi-diii-soc-yyir1'
 );

DELETE FROM site_benchmarks
 WHERE id IN (
   'dii-soc-505-thresh',  'dii-soc-pro-thresh',  'dii-soc-yyir1-thresh',
   'diii-soc-505-thresh', 'diii-soc-pro-thresh', 'diii-soc-yyir1-thresh'
 );

DO $$
BEGIN
  RAISE NOTICE 'Migration 0133 (down): Removed 6 DII/DIII non-sprint benchmark rows + 6 set_items.';
END $$;
