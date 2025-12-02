-- Rollback: Revert link_type CHECK constraint to original (without 'auto_import')
-- WARNING: This will fail if any rows have link_type = 'auto_import'

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'user_global_athlete_links_link_type_check'
  ) THEN
    ALTER TABLE user_global_athlete_links
    DROP CONSTRAINT user_global_athlete_links_link_type_check;
  END IF;

  ALTER TABLE user_global_athlete_links
  ADD CONSTRAINT user_global_athlete_links_link_type_check
  CHECK (link_type IN ('auto_email', 'athlete_claimed', 'org_proposed', 'admin_forced'));
END $$;
