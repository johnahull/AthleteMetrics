-- Preflight validation for rollback of migration 0004
-- Date: 2025-10-16
-- Purpose: Check for measurements referencing soft-deleted users before attempting rollback
--
-- WARNING: Rolling back migration 0004 will FAIL if there are measurements
-- referencing soft-deleted users, because the foreign key constraints being
-- re-added require that all referenced users exist.
--
-- Run this script BEFORE attempting the rollback to check for issues.
--
-- Usage:
--   psql $DATABASE_URL -f migrations/0004_remove_measurement_fk_constraints_down_preflight.sql

-- Check for measurements with soft-deleted users
SELECT
  'ORPHANED MEASUREMENTS' as check_type,
  COUNT(*) as count,
  CASE
    WHEN COUNT(*) > 0 THEN 'FAIL - Rollback will fail'
    ELSE 'PASS - Safe to rollback'
  END as status
FROM measurements m
WHERE m.user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL)
   OR m.submitted_by IN (SELECT id FROM users WHERE deleted_at IS NOT NULL)
   OR m.verified_by IN (SELECT id FROM users WHERE deleted_at IS NOT NULL);

-- Show details if there are orphaned measurements
SELECT
  'MEASUREMENT DETAILS' as info,
  m.id as measurement_id,
  m.user_id,
  m.submitted_by,
  m.verified_by,
  m.date,
  m.metric,
  CASE
    WHEN u_user.deleted_at IS NOT NULL THEN 'Deleted'
    ELSE 'Active'
  END as user_status,
  CASE
    WHEN u_submitter.deleted_at IS NOT NULL THEN 'Deleted'
    ELSE 'Active'
  END as submitter_status,
  CASE
    WHEN u_verifier.deleted_at IS NOT NULL THEN 'Deleted'
    WHEN m.verified_by IS NULL THEN 'N/A'
    ELSE 'Active'
  END as verifier_status
FROM measurements m
LEFT JOIN users u_user ON m.user_id = u_user.id
LEFT JOIN users u_submitter ON m.submitted_by = u_submitter.id
LEFT JOIN users u_verifier ON m.verified_by = u_verifier.id
WHERE m.user_id IN (SELECT id FROM users WHERE deleted_at IS NOT NULL)
   OR m.submitted_by IN (SELECT id FROM users WHERE deleted_at IS NOT NULL)
   OR m.verified_by IN (SELECT id FROM users WHERE deleted_at IS NOT NULL)
LIMIT 10;

-- Remediation instructions
SELECT
  'REMEDIATION' as info,
  'If the preflight check fails, you have two options:' as instruction_1,
  '1. Hard delete the soft-deleted users (will CASCADE delete their measurements)' as option_1,
  '2. Do not rollback this migration - keep measurements immutable' as option_2,
  'For option 1, run: DELETE FROM users WHERE deleted_at IS NOT NULL;' as sql_command,
  'WARNING: This will permanently delete measurement data!' as warning;
