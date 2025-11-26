/**
 * Migration 0057: Add Case-Insensitive Unique Index on Wellness Request Tokens
 *
 * Security Enhancement: Defense-in-depth for magic link tokens
 *
 * RATIONALE:
 * - Magic link tokens must be unique regardless of case
 * - Application code normalizes tokens to lowercase, but DB should enforce it
 * - Prevents potential bugs where non-lowercase tokens might be inserted
 * - Follows security best practice of defense in depth
 *
 * IMPLEMENTATION:
 * - Creates a unique functional index on LOWER(public_token)
 * - Maintains existing unique constraint for backwards compatibility
 * - Zero downtime - index creation is concurrent-safe
 *
 * DEPENDENCIES: Requires migration 0049 (wellness_requests table exists)
 */

-- Create case-insensitive unique index on wellness_requests.public_token
-- This ensures tokens are unique regardless of case (e.g., 'AbC123' == 'abc123')
CREATE UNIQUE INDEX CONCURRENTLY IF NOT EXISTS idx_wellness_requests_public_token_lower
  ON wellness_requests(LOWER(public_token))
  WHERE public_token IS NOT NULL;

-- Add explanatory comment
COMMENT ON INDEX idx_wellness_requests_public_token_lower IS
  'Case-insensitive unique constraint on wellness request tokens for security (migration 0057)';

-- Success notification
DO $$
BEGIN
  RAISE NOTICE '✅ Migration 0057: Case-insensitive unique index on wellness_requests.public_token created';
END $$;
