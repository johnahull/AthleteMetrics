-- Rollback Migration: Restore NOT NULL constraint on invited_by
-- WARNING: This will fail if any invitations have NULL invited_by

-- Check for NULL values before restoring constraint
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM invitations WHERE invited_by IS NULL LIMIT 1) THEN
    RAISE EXCEPTION 'Cannot restore NOT NULL constraint: % invitations have NULL invited_by. These would be lost if constraint is restored.',
      (SELECT COUNT(*) FROM invitations WHERE invited_by IS NULL);
  END IF;
END $$;

-- Restore NOT NULL constraint (only executes if check passes)
ALTER TABLE invitations
  ALTER COLUMN invited_by SET NOT NULL;

-- Remove comments
COMMENT ON COLUMN invitations.invited_by IS NULL;
COMMENT ON COLUMN invitations.player_id IS NULL;
