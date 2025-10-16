-- Migration: Add soft delete support to users table
-- Purpose: Enable soft delete to preserve user data for measurements and audit trail
-- Date: 2025-10-15
--
-- With soft delete, users are marked as deleted but data remains in the database.
-- This maintains referential integrity for:
-- - Measurements (userId, submittedBy, verifiedBy all preserve full context)
-- - Audit logs (compliance trail with full user context)
-- - Historical relationships (teams, organizations)

-- Add deletedAt column for soft delete
ALTER TABLE users
ADD COLUMN deleted_at TIMESTAMP;

-- Add index for performance (queries filter on deletedAt = NULL)
CREATE INDEX idx_users_deleted_at ON users(deleted_at) WHERE deleted_at IS NULL;

-- Add comment to document this feature
COMMENT ON COLUMN users.deleted_at IS
  'Soft delete timestamp - NULL means active, non-NULL means deleted. User data preserved for historical context.';

COMMENT ON TABLE users IS
  'User accounts with soft delete support. Deleted users preserve data for measurements and audit trail.';
