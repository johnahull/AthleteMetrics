-- Remove duplicate wellness indexes from Drizzle migration 0002
-- The manual migration 0049 added better versions with partial indexes and clearer names
-- This migration removes the duplicates to improve write performance

-- Drop duplicate indexes from Drizzle migration (keeping the better versions from 0049)
DROP INDEX IF EXISTS wellness_responses_org_idx;      -- Duplicate of idx_wellness_responses_organization_id
DROP INDEX IF EXISTS wellness_responses_user_idx;     -- Duplicate of idx_wellness_responses_user_id
DROP INDEX IF EXISTS wellness_responses_date_idx;     -- Duplicate of idx_wellness_responses_date
DROP INDEX IF EXISTS wellness_responses_team_idx;     -- Duplicate of idx_wellness_responses_team_id (0049 has partial index)
DROP INDEX IF EXISTS wellness_requests_token_idx;     -- Duplicate of idx_wellness_requests_public_token (0049 has partial index)
