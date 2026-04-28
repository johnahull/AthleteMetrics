-- Down Migration 0125: Remove lift-max site_metrics rows
--
-- WARNING: This will also remove any organization_metrics rows referencing
-- these codes (ON DELETE CASCADE). Any measurements logged against these
-- codes are NOT deleted (measurements have no FK to site_metrics by design,
-- they retain historical references), but they will become orphaned from
-- organization-level metric enablement and will not appear in metric pickers
-- until the metrics are re-seeded.

DELETE FROM site_metrics
 WHERE code IN (
   'BENCH_1RM', 'BENCH_1RM_KG',
   'SQUAT_1RM', 'SQUAT_1RM_KG',
   'DEADLIFT_1RM', 'DEADLIFT_1RM_KG',
   'OHP_1RM', 'OHP_1RM_KG',
   'PULLUPS_MAX', 'PUSHUPS_MAX'
 );

DO $$
BEGIN
  RAISE NOTICE 'Migration 0125 (down): Removed 10 lift-max site_metrics rows';
END $$;
