-- Migration: Add index on measurements.user_id for performance
-- Since FK constraint was removed in migration 0004, this index ensures
-- efficient queries when filtering measurements by user_id

-- Create index on measurements.user_id for better query performance
CREATE INDEX IF NOT EXISTS idx_measurements_user_id ON measurements(user_id);

-- This index improves performance for:
-- 1. Analytics queries that filter by specific athletes
-- 2. User profile pages showing athlete's measurement history
-- 3. Measurement exports filtered by athlete
-- 4. Historical data queries after user deletion (measurements preserved)

-- Note: Since measurements are immutable and FK constraint was removed,
-- user_id may reference deleted users. This is intentional - measurements
-- are permanent historical records.
