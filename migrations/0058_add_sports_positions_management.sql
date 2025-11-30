-- Migration: Add sports and positions management system
-- Purpose: Enable site admins to manage sports and positions dynamically
-- Context: Replaces hardcoded Sport and SoccerPosition enums with database-driven catalog
-- Created: 2025-11-27

-- ============================================================================
-- PART 1: CREATE SITE_SPORTS TABLE (Master Sport Catalog)
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_sports (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  code VARCHAR(50) NOT NULL UNIQUE,           -- "SOCCER", "BASKETBALL" (immutable identifier)
  name VARCHAR(100) NOT NULL,                 -- "Soccer" (display name, can change)
  description TEXT,
  icon VARCHAR(50),                           -- Icon identifier for UI
  color VARCHAR(20),                          -- Hex color or Tailwind class
  display_order INTEGER,
  is_system_default BOOLEAN NOT NULL DEFAULT false,  -- Cannot delete seeded sports
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(36),
  updated_at TIMESTAMP,

  CONSTRAINT site_sports_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT site_sports_code_format CHECK (
    code ~ '^[A-Z0-9_]+$' AND code !~ '^_'
  )
);

CREATE INDEX IF NOT EXISTS site_sports_active_idx ON site_sports(is_active);
CREATE INDEX IF NOT EXISTS site_sports_code_idx ON site_sports(code);
CREATE INDEX IF NOT EXISTS site_sports_display_order_idx ON site_sports(display_order);

COMMENT ON TABLE site_sports IS 'Site-level sport definitions managed by site admins';
COMMENT ON COLUMN site_sports.code IS 'Unique sport code (e.g., SOCCER, BASKETBALL) - immutable identifier';
COMMENT ON COLUMN site_sports.name IS 'Display name shown in UI (can be changed)';
COMMENT ON COLUMN site_sports.is_system_default IS 'True for seeded sports that cannot be deleted';

-- ============================================================================
-- PART 2: CREATE SITE_POSITIONS TABLE (Sport-Specific Positions)
-- ============================================================================

CREATE TABLE IF NOT EXISTS site_positions (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  sport_id VARCHAR(36) NOT NULL,
  code VARCHAR(20) NOT NULL,                  -- "F", "M", "D", "GK"
  name VARCHAR(100) NOT NULL,                 -- "Forward", "Midfielder"
  short_name VARCHAR(10),                     -- "FW", "MF" (optional abbreviation)
  description TEXT,
  display_order INTEGER,
  color VARCHAR(20),
  is_system_default BOOLEAN NOT NULL DEFAULT false,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  created_by VARCHAR(36),
  updated_at TIMESTAMP,

  CONSTRAINT site_positions_sport_fkey FOREIGN KEY (sport_id)
    REFERENCES site_sports(id) ON DELETE CASCADE,
  CONSTRAINT site_positions_created_by_fkey FOREIGN KEY (created_by)
    REFERENCES users(id) ON DELETE SET NULL,
  CONSTRAINT site_positions_sport_code_unique UNIQUE (sport_id, code)
);

CREATE INDEX IF NOT EXISTS site_positions_sport_idx ON site_positions(sport_id);
CREATE INDEX IF NOT EXISTS site_positions_active_idx ON site_positions(is_active);
CREATE INDEX IF NOT EXISTS site_positions_sport_active_idx ON site_positions(sport_id, is_active);
CREATE INDEX IF NOT EXISTS site_positions_code_idx ON site_positions(code);

COMMENT ON TABLE site_positions IS 'Sport-specific position definitions managed by site admins';
COMMENT ON COLUMN site_positions.sport_id IS 'Reference to site_sports - positions belong to a sport';
COMMENT ON COLUMN site_positions.code IS 'Short position code (e.g., F, M, D, GK for Soccer)';

-- ============================================================================
-- PART 3: SEED SOCCER SPORT AS SYSTEM DEFAULT
-- ============================================================================

INSERT INTO site_sports (id, code, name, description, icon, color, display_order, is_system_default, is_active)
VALUES (
  '00000000-0000-0000-0001-000000000001',
  'SOCCER',
  'Soccer',
  'Association football (soccer)',
  'Soccer',
  'green',
  1,
  true,
  true
) ON CONFLICT (code) DO NOTHING;

-- ============================================================================
-- PART 4: SEED SOCCER POSITIONS AS SYSTEM DEFAULTS
-- ============================================================================

INSERT INTO site_positions (id, sport_id, code, name, short_name, description, display_order, is_system_default, is_active)
VALUES
  ('00000000-0000-0000-0002-000000000001', '00000000-0000-0000-0001-000000000001', 'F', 'Forward', 'FW', 'Attacking position focused on scoring goals', 1, true, true),
  ('00000000-0000-0000-0002-000000000002', '00000000-0000-0000-0001-000000000001', 'M', 'Midfielder', 'MF', 'Central position linking defense and attack', 2, true, true),
  ('00000000-0000-0000-0002-000000000003', '00000000-0000-0000-0001-000000000001', 'D', 'Defender', 'DF', 'Defensive position protecting the goal', 3, true, true),
  ('00000000-0000-0000-0002-000000000004', '00000000-0000-0000-0001-000000000001', 'GK', 'Goalkeeper', 'GK', 'Position responsible for preventing goals', 4, true, true)
ON CONFLICT (sport_id, code) DO NOTHING;

-- ============================================================================
-- PART 5: CREATE GIN INDEXES FOR ARRAY CONTAINMENT QUERIES
-- ============================================================================

-- These indexes speed up queries like: WHERE 'SOCCER' = ANY(sports)
CREATE INDEX IF NOT EXISTS users_sports_gin_idx ON users USING GIN (sports);
CREATE INDEX IF NOT EXISTS users_positions_gin_idx ON users USING GIN (positions);

-- ============================================================================
-- PART 6: MIGRATE EXISTING DATA FROM NAMES TO CODES
-- ============================================================================

-- Migrate users.sports from names ("Soccer") to codes ("SOCCER")
DO $$
DECLARE
  updated_users INTEGER;
BEGIN
  UPDATE users
  SET sports = ARRAY['SOCCER']
  WHERE sports @> ARRAY['Soccer']
    AND NOT (sports @> ARRAY['SOCCER']);
  GET DIAGNOSTICS updated_users = ROW_COUNT;
  RAISE NOTICE 'Migrated % user records from Soccer to SOCCER', updated_users;
END $$;

-- Migrate teams.sport from name to code
DO $$
DECLARE
  updated_teams INTEGER;
BEGIN
  UPDATE teams
  SET sport = 'SOCCER'
  WHERE sport = 'Soccer';
  GET DIAGNOSTICS updated_teams = ROW_COUNT;
  RAISE NOTICE 'Migrated % team records from Soccer to SOCCER', updated_teams;
END $$;

-- ============================================================================
-- PART 7: LOG MIGRATION COMPLETION
-- ============================================================================

DO $$
BEGIN
  RAISE NOTICE '=================================================================';
  RAISE NOTICE 'Migration 0058 complete: Sports and positions management system';
  RAISE NOTICE '- Created site_sports table (master sport catalog)';
  RAISE NOTICE '- Created site_positions table (sport-specific positions)';
  RAISE NOTICE '- Seeded Soccer with F/M/D/GK positions as system defaults';
  RAISE NOTICE '- Created GIN indexes for array queries';
  RAISE NOTICE '- Migrated existing data from names to codes';
  RAISE NOTICE '=================================================================';
END $$;
