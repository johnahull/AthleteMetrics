-- Rollback migration: Remove membership requests feature

-- Drop indexes
DROP INDEX IF EXISTS organizations_public_directory_idx;
DROP INDEX IF EXISTS organizations_join_code_idx;
DROP INDEX IF EXISTS membership_requests_user_idx;
DROP INDEX IF EXISTS membership_requests_org_status_idx;
DROP INDEX IF EXISTS membership_requests_unique_pending;

-- Drop membership_requests table
DROP TABLE IF EXISTS membership_requests;

-- Remove columns from organizations table
ALTER TABLE organizations
  DROP COLUMN IF EXISTS join_code,
  DROP COLUMN IF EXISTS is_public_directory,
  DROP COLUMN IF EXISTS allow_membership_requests,
  DROP COLUMN IF EXISTS auto_approve_requests;
