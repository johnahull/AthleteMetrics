-- Migration: Add onboarding tracking to users table
-- This column tracks whether a user has completed the first-time onboarding tour

ALTER TABLE users
ADD COLUMN has_completed_onboarding BOOLEAN NOT NULL DEFAULT FALSE;

-- Site admins don't need onboarding, so mark them as completed
UPDATE users
SET has_completed_onboarding = TRUE
WHERE is_site_admin = TRUE;

-- Add comment for documentation
COMMENT ON COLUMN users.has_completed_onboarding IS 'Tracks whether the user has completed the first-time onboarding tour';
