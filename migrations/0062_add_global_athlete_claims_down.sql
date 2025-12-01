-- Rollback: Remove global_athlete_claims table

-- Drop indexes
DROP INDEX IF EXISTS gac_global_athlete_idx;
DROP INDEX IF EXISTS gac_token_idx;
DROP INDEX IF EXISTS gac_email_idx;
DROP INDEX IF EXISTS gac_status_idx;

-- Drop the table
DROP TABLE IF EXISTS global_athlete_claims;
