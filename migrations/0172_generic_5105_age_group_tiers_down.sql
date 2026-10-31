-- Down Migration 0172: remove the generic 5-10-5 tiers and reactivate the sport-specific ones from 0170
--
-- Deletes by id prefix: site_benchmarks 'b5105g-%', benchmark_sets 'set-5105g-%' (and their items). organization_benchmarks
-- has no foreign key to site_benchmarks, so its rows are deleted explicitly. Reactivates every 'b5105-%' row and
-- 'set-5105-%' set, including any an admin had switched off before 0172 (0172 does not record the earlier state).
-- Forgets this migration's manual_migrations row so the next forward deploy re-applies it. Measurements are not touched.

-- PRE-ROLLBACK RUNBOOK: the reactivation below is unconditional and the earlier state is not recorded. Before applying
-- this down, list what was already inactive before 0172 (rows an admin had switched off), so they can be switched off again:
--   SELECT id, is_active FROM site_benchmarks WHERE id LIKE 'b5105-%' AND NOT is_active;
--   SELECT id, is_active FROM benchmark_sets WHERE id LIKE 'set-5105-%' AND NOT is_active;
-- Run both while 0172 is still applied and compare with the pre-0172 state.

-- Removes the enablement rows (including those auto-enabled by the up migration); the orgs' own b5105-% rows are untouched.
DELETE FROM organization_benchmarks
 WHERE benchmark_type = 'site' AND benchmark_id LIKE 'b5105g-%';

DELETE FROM organization_benchmark_sets WHERE site_set_id LIKE 'set-5105g-%';
DELETE FROM benchmark_set_items WHERE set_id LIKE 'set-5105g-%';
DELETE FROM benchmark_sets WHERE id LIKE 'set-5105g-%';
DELETE FROM site_benchmarks WHERE metric_code = 'AGILITY_5105' AND id LIKE 'b5105g-%';

UPDATE site_benchmarks SET is_active = true WHERE metric_code = 'AGILITY_5105' AND id LIKE 'b5105-%';
UPDATE benchmark_sets SET is_active = true, updated_at = NOW() WHERE id LIKE 'set-5105-%';

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0172_generic_5105_age_group_tiers';
  END IF;
END $$;
