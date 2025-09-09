-- Migration: Add gender column to users table
-- Created: 2025-01-09
-- Description: Adds gender field with check constraint for Male/Female/Not Specified values

-- Add gender column
ALTER TABLE users ADD COLUMN gender TEXT;

-- Add check constraint to ensure only valid gender values
ALTER TABLE users ADD CONSTRAINT users_gender_check 
    CHECK (gender IS NULL OR gender IN ('Male', 'Female', 'Not Specified'));

-- Add index for performance on gender filtering
CREATE INDEX idx_users_gender ON users(gender) WHERE gender IS NOT NULL;

-- Add comment for documentation
COMMENT ON COLUMN users.gender IS 'Gender of the user: Male, Female, or Not Specified';