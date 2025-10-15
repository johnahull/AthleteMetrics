-- Migration: Remove foreign key constraints from measurements table
-- Purpose: Make measurements immutable historical records that can reference deleted users
-- Date: 2025-10-15
--
-- Measurements are snapshots in time and should never change once created.
-- The userId, submittedBy, and verifiedBy fields are historical references
-- that should remain intact even if the referenced users are deleted.

-- Drop foreign key constraint on user_id (athlete)
ALTER TABLE measurements
DROP CONSTRAINT IF EXISTS measurements_user_id_users_id_fk;

-- Drop foreign key constraint on submitted_by (coach/submitter)
ALTER TABLE measurements
DROP CONSTRAINT IF EXISTS measurements_submitted_by_users_id_fk;

-- Drop foreign key constraint on verified_by (verifier)
ALTER TABLE measurements
DROP CONSTRAINT IF EXISTS measurements_verified_by_users_id_fk;

-- Add comment to document this is intentional
COMMENT ON COLUMN measurements.user_id IS
  'Historical reference to athlete (no FK constraint - can reference deleted users)';

COMMENT ON COLUMN measurements.submitted_by IS
  'Historical reference to submitter (no FK constraint - can reference deleted users)';

COMMENT ON COLUMN measurements.verified_by IS
  'Historical reference to verifier (no FK constraint - can reference deleted users)';

-- Measurements remain as immutable historical records
COMMENT ON TABLE measurements IS
  'Immutable snapshots of athlete performance measurements. Never modified or deleted.';
