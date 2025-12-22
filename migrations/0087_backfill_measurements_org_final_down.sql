-- Rollback migration for 0087_backfill_measurements_org_final
--
-- IMPORTANT: This migration CANNOT be safely rolled back because:
-- 1. We don't track which measurements originally had NULL organization_id
-- 2. Backfilling organization_id was the correct fix, not a mistake
--
-- If rollback is needed:
-- 1. Restore from a database backup taken before the migration
-- 2. Re-run with fixes if the backfill logic was incorrect
--
-- This is a NO-OP placeholder to satisfy the migration system.

DO $$
BEGIN
  RAISE NOTICE 'Migration 0087 cannot be rolled back - organization_id values cannot be reverted to NULL safely.';
  RAISE NOTICE 'If needed, restore from a pre-migration database backup.';
END $$;
