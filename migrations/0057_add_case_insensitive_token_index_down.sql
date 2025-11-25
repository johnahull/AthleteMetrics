/**
 * Migration 0057 Rollback: Remove Case-Insensitive Token Index
 *
 * Reverts changes from 0057_add_case_insensitive_token_index.sql
 */

-- Drop the case-insensitive unique index
DROP INDEX IF EXISTS idx_wellness_requests_public_token_lower;

RAISE NOTICE '✅ Migration 0057 Rollback: Removed case-insensitive unique index on wellness_requests.public_token';
