-- Migration: Make invitation foreign keys nullable to preserve invitation history
-- Created: 2025-10-16
-- Description: Allows setting invited_by and player_id to NULL when users are deleted,
--              preserving invitation audit trail instead of cascading deletion

-- Make invited_by nullable (currently NOT NULL)
ALTER TABLE invitations
  ALTER COLUMN invited_by DROP NOT NULL;

-- Add comment explaining the change
COMMENT ON COLUMN invitations.invited_by IS 'User who sent the invitation. NULL if user was deleted (preserves invitation history)';
COMMENT ON COLUMN invitations.player_id IS 'Target athlete user. NULL if user was deleted (preserves invitation history)';

-- Note: player_id is already nullable, no change needed

-- Update foreign key constraints to SET NULL on delete
-- This ensures invitation history is preserved when users are deleted

-- Drop existing constraints
ALTER TABLE invitations
  DROP CONSTRAINT IF EXISTS invitations_invited_by_users_id_fk;

ALTER TABLE invitations
  DROP CONSTRAINT IF EXISTS invitations_player_id_users_id_fk;

-- Recreate with ON DELETE SET NULL
ALTER TABLE invitations
  ADD CONSTRAINT invitations_invited_by_users_id_fk
  FOREIGN KEY (invited_by) REFERENCES users(id) ON DELETE SET NULL;

ALTER TABLE invitations
  ADD CONSTRAINT invitations_player_id_users_id_fk
  FOREIGN KEY (player_id) REFERENCES users(id) ON DELETE SET NULL;
