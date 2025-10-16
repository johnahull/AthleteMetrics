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
