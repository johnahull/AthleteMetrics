-- Migration: Create Events Tables
-- Description: Add tables for the event system (combines, camps, testing days)

-- Create events table
CREATE TABLE IF NOT EXISTS events (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR REFERENCES organizations(id) ON DELETE CASCADE,

  -- Event details
  name VARCHAR(200) NOT NULL,
  description TEXT,
  location TEXT,
  event_type VARCHAR(50),

  -- Scheduling
  start_date TIMESTAMP NOT NULL,
  end_date TIMESTAMP,
  timezone VARCHAR(50) DEFAULT 'America/New_York' NOT NULL,

  -- Visibility and registration
  visibility TEXT DEFAULT 'org_private' NOT NULL,
  registration_mode TEXT DEFAULT 'open' NOT NULL,
  status TEXT DEFAULT 'draft' NOT NULL,

  -- Registration settings
  registration_opens_at TIMESTAMP,
  registration_closes_at TIMESTAMP,
  max_registrations INTEGER,
  event_code VARCHAR(20) UNIQUE,

  -- Results publishing
  results_visibility TEXT DEFAULT 'after_event' NOT NULL,
  results_published_at TIMESTAMP,
  results_published_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,

  -- Freeze mechanism
  is_frozen BOOLEAN DEFAULT false NOT NULL,
  frozen_at TIMESTAMP,
  frozen_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  frozen_reason TEXT,

  -- Audit
  created_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP
);

-- Create event_registrations table
CREATE TABLE IF NOT EXISTS event_registrations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR NOT NULL REFERENCES events(id) ON DELETE CASCADE,

  -- Historical snapshot (no FK for user - like measurements)
  user_id VARCHAR NOT NULL,
  user_full_name_snapshot TEXT NOT NULL,
  organization_id_snapshot VARCHAR,
  organization_name_snapshot TEXT,

  -- Registration details
  status TEXT DEFAULT 'pending' NOT NULL,
  registration_number INTEGER,
  discovery_method TEXT,
  waitlist_position INTEGER,

  -- Workflow timestamps
  requested_at TIMESTAMP DEFAULT NOW() NOT NULL,
  approved_at TIMESTAMP,
  approved_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  declined_at TIMESTAMP,
  declined_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  decline_reason TEXT,

  -- Check-in tracking
  checked_in_at TIMESTAMP,
  checked_in_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  completed_at TIMESTAMP,

  -- Notes
  athlete_notes TEXT,
  admin_notes TEXT,

  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP
);

-- Create event_invitations table
CREATE TABLE IF NOT EXISTS event_invitations (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  user_id VARCHAR REFERENCES users(id) ON DELETE CASCADE,
  email TEXT,
  token TEXT NOT NULL UNIQUE,
  status TEXT DEFAULT 'pending' NOT NULL,
  invited_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  expires_at TIMESTAMP NOT NULL,
  accepted_at TIMESTAMP,
  declined_at TIMESTAMP,
  cancelled_at TIMESTAMP,
  cancelled_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  email_sent BOOLEAN DEFAULT false NOT NULL,
  email_sent_at TIMESTAMP,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create event_metrics table
CREATE TABLE IF NOT EXISTS event_metrics (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  metric_code VARCHAR(50) NOT NULL REFERENCES site_metrics(code) ON DELETE CASCADE,
  display_order INTEGER DEFAULT 999 NOT NULL,
  is_required BOOLEAN DEFAULT false NOT NULL,
  custom_label VARCHAR(100),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,

  UNIQUE(event_id, metric_code)
);

-- Create event_freeze_overrides table
CREATE TABLE IF NOT EXISTS event_freeze_overrides (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  event_id VARCHAR NOT NULL REFERENCES events(id) ON DELETE CASCADE,
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id VARCHAR,
  overridden_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  justification TEXT,
  details JSONB,
  ip_address VARCHAR(45),
  user_agent VARCHAR(500),
  created_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Create indexes for events table
CREATE INDEX IF NOT EXISTS events_org_idx ON events(organization_id);
CREATE INDEX IF NOT EXISTS events_status_idx ON events(status);
CREATE INDEX IF NOT EXISTS events_visibility_idx ON events(visibility);
CREATE INDEX IF NOT EXISTS events_start_date_idx ON events(start_date);
CREATE INDEX IF NOT EXISTS events_code_idx ON events(event_code);
CREATE INDEX IF NOT EXISTS events_org_status_idx ON events(organization_id, status);

-- Create indexes for event_registrations table
CREATE INDEX IF NOT EXISTS event_registrations_event_idx ON event_registrations(event_id);
CREATE INDEX IF NOT EXISTS event_registrations_user_idx ON event_registrations(user_id);
CREATE INDEX IF NOT EXISTS event_registrations_status_idx ON event_registrations(status);
CREATE INDEX IF NOT EXISTS event_registrations_event_status_idx ON event_registrations(event_id, status);
CREATE INDEX IF NOT EXISTS event_registrations_waitlist_idx ON event_registrations(event_id, waitlist_position);

-- Partial UNIQUE index: Prevents duplicate active registrations but allows re-registration after cancellation
CREATE UNIQUE INDEX IF NOT EXISTS event_registrations_user_active_unique
  ON event_registrations(event_id, user_id)
  WHERE status NOT IN ('cancelled', 'declined');

-- Create indexes for event_invitations table
CREATE INDEX IF NOT EXISTS event_invitations_event_idx ON event_invitations(event_id);
CREATE INDEX IF NOT EXISTS event_invitations_user_idx ON event_invitations(user_id);
CREATE INDEX IF NOT EXISTS event_invitations_token_idx ON event_invitations(token);
CREATE INDEX IF NOT EXISTS event_invitations_email_idx ON event_invitations(email);
CREATE INDEX IF NOT EXISTS event_invitations_status_idx ON event_invitations(status);

-- Create indexes for event_metrics table
CREATE INDEX IF NOT EXISTS event_metrics_event_idx ON event_metrics(event_id);
CREATE INDEX IF NOT EXISTS event_metrics_display_order_idx ON event_metrics(event_id, display_order);

-- Create indexes for event_freeze_overrides table
CREATE INDEX IF NOT EXISTS event_freeze_overrides_event_idx ON event_freeze_overrides(event_id);
CREATE INDEX IF NOT EXISTS event_freeze_overrides_action_idx ON event_freeze_overrides(action);
CREATE INDEX IF NOT EXISTS event_freeze_overrides_user_idx ON event_freeze_overrides(overridden_by);

-- Add CHECK constraints for enums (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_visibility_check'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_visibility_check
      CHECK (visibility IN ('org_private', 'public', 'invite_only'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_status_check'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_status_check
      CHECK (status IN ('draft', 'published', 'active', 'completed', 'cancelled'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_registration_mode_check'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_registration_mode_check
      CHECK (registration_mode IN ('open', 'request_approval', 'invitation_only'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'events_results_visibility_check'
  ) THEN
    ALTER TABLE events ADD CONSTRAINT events_results_visibility_check
      CHECK (results_visibility IN ('immediate', 'after_event', 'manual'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_registrations_status_check'
  ) THEN
    ALTER TABLE event_registrations ADD CONSTRAINT event_registrations_status_check
      CHECK (status IN ('pending', 'approved', 'waitlisted', 'declined', 'cancelled', 'checked_in', 'completed'));
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'event_invitations_status_check'
  ) THEN
    ALTER TABLE event_invitations ADD CONSTRAINT event_invitations_status_check
      CHECK (status IN ('pending', 'accepted', 'declined', 'expired', 'cancelled'));
  END IF;
END $$;

-- Add event resource type to audit_logs if not exists
DO $$
BEGIN
  -- Check if 'event' is already in the resource_type enum
  IF NOT EXISTS (
    SELECT 1 FROM pg_enum
    WHERE enumlabel = 'event'
    AND enumtypid = (SELECT oid FROM pg_type WHERE typname = 'resource_type_enum')
  ) THEN
    -- Add event resource types (only if enum exists)
    BEGIN
      ALTER TYPE resource_type_enum ADD VALUE IF NOT EXISTS 'event';
      ALTER TYPE resource_type_enum ADD VALUE IF NOT EXISTS 'event_registration';
      ALTER TYPE resource_type_enum ADD VALUE IF NOT EXISTS 'event_invitation';
    EXCEPTION
      WHEN undefined_object THEN
        NULL; -- Enum doesn't exist, skip
    END;
  END IF;
END $$;
