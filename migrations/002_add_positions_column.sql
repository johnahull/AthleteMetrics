-- Add positions column to users table for soccer positions
ALTER TABLE users ADD COLUMN positions TEXT[];

-- Create index for position filtering
CREATE INDEX idx_users_positions ON users USING GIN (positions) WHERE positions IS NOT NULL;

-- Add CHECK constraint to ensure only valid soccer positions
ALTER TABLE users ADD CONSTRAINT users_positions_check 
    CHECK (positions IS NULL OR (
        array_length(positions, 1) IS NULL OR 
        positions <@ ARRAY['F', 'M', 'D', 'GK']::TEXT[]
    ));

-- Update existing soccer players to have empty positions array (can be filled in later)
UPDATE users 
SET positions = ARRAY[]::TEXT[] 
WHERE sports @> ARRAY['Soccer']::TEXT[] AND positions IS NULL;