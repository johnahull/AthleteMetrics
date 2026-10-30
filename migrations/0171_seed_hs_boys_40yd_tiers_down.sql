-- Down Migration 0171: remove the HS boys 40-yard dash tier group and its benchmark set
--
-- Deletes by id: the set items, the set, then the 5 tier benchmarks. Forgets this migration's manual_migrations row
-- (when that table exists) so the next forward deploy re-applies it. Measurements are not touched.

DELETE FROM benchmark_set_items WHERE set_id = 'set-hs-boys-40yd-ovr';
DELETE FROM benchmark_sets WHERE id = 'set-hs-boys-40yd-ovr';
DELETE FROM site_benchmarks WHERE id IN ('bench-hs-boys-40yd-elite', 'bench-hs-boys-40yd-excellent', 'bench-hs-boys-40yd-above-avg', 'bench-hs-boys-40yd-average', 'bench-hs-boys-40yd-below-avg');

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0171_seed_hs_boys_40yd_tiers';
  END IF;
END $$;
