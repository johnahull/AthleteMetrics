-- Migration Rollback: Restore sport associations from backup
-- Description: Restores sport associations for system default metrics from backup table
-- Author: Claude Code
-- Date: 2025-12-17

-- Restore sport associations from backup table (if it exists)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.tables
    WHERE table_name = 'site_metrics_sport_backup_20251217'
  ) THEN
    -- Restore sport associations from backup
    UPDATE site_metrics sm
    SET sport_associations = backup.sport_associations
    FROM site_metrics_sport_backup_20251217 backup
    WHERE sm.id = backup.id;

    -- Drop the backup table after restoration
    DROP TABLE site_metrics_sport_backup_20251217;
  END IF;
END $$;
