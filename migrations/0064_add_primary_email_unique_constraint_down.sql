-- Rollback: Remove unique constraint on primary_email
DROP INDEX IF EXISTS global_athletes_primary_email_unique;
