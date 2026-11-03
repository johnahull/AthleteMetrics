-- Migration 0176 (down): restore the sport associations the 10/5 repeat hop metrics had before 0176
--
-- Restores each row's exact prior value from site_metrics_sport_backup_0176 (NULL stays NULL), then drops the backup.
-- Safe to run twice, or on a database where 0176 never ran: with no backup table it restores nothing.
-- Limit: a tag an admin changed after 0176 ran is overwritten by the backup value.
-- Also forgets the manual_migrations row so db:migrate:manual re-applies 0176.

DO $$
BEGIN
  IF to_regclass('site_metrics_sport_backup_0176') IS NOT NULL THEN
    UPDATE site_metrics sm
       SET sport_associations = b.sport_associations, updated_at = now()
      FROM site_metrics_sport_backup_0176 b
     WHERE sm.code = b.code;

    DROP TABLE IF EXISTS site_metrics_sport_backup_0176;
  END IF;

  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0176_rsi_105_metrics_all_sports';
  END IF;
END $$;
