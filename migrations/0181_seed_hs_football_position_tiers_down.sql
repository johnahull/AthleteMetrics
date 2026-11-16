-- Down Migration 0181: remove the McKay 2020 HS football position tiers
--
-- Deletes by id prefix: site_benchmarks 'mckay2020-%', benchmark_sets 'set-hs-football-position-mckay2020' (and items).
-- organization_benchmarks has no foreign key to site_benchmarks, so rows an organization enabled are deleted explicitly.
-- Saved reports and report templates may still name the deleted benchmark or set ids in their config jsonb; those
-- references are not rewritten.
-- Forgets this migration's manual_migrations row so the next forward deploy re-applies it.

DELETE FROM organization_benchmarks
 WHERE benchmark_type = 'site' AND benchmark_id LIKE 'mckay2020-%';

DELETE FROM organization_benchmark_sets WHERE site_set_id = 'set-hs-football-position-mckay2020';
DELETE FROM benchmark_set_items WHERE set_id = 'set-hs-football-position-mckay2020';
DELETE FROM benchmark_sets WHERE id = 'set-hs-football-position-mckay2020';
DELETE FROM site_benchmarks WHERE id LIKE 'mckay2020-%';

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0181_seed_hs_football_position_tiers';
  END IF;
END $$;
