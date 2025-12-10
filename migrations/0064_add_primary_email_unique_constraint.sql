-- Migration: Add unique constraint on primary_email to prevent race conditions
-- Description: Ensures no duplicate global athletes can be created with the same primary email
--
-- This migration adds a partial unique index on primary_email (WHERE primary_email IS NOT NULL)
-- to prevent race conditions during concurrent athlete creation/import.

-- Add unique constraint on primary_email (partial index to allow NULLs)
CREATE UNIQUE INDEX IF NOT EXISTS global_athletes_primary_email_unique
  ON global_athletes(primary_email)
  WHERE primary_email IS NOT NULL;

-- Add comment for documentation
COMMENT ON INDEX global_athletes_primary_email_unique IS 'Prevents duplicate global athletes with same primary_email (race condition protection)';
