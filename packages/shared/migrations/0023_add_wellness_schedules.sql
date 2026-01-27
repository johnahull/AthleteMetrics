-- Migration: Add wellness_schedules table for recurring questionnaire push
-- This table stores recurring schedule configurations that the cron job
-- uses to automatically create new wellness_requests at specified intervals.

CREATE TABLE IF NOT EXISTS wellness_schedules (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  template_id VARCHAR NOT NULL,
  created_by VARCHAR NOT NULL,
  -- Distribution config
  distribution_method VARCHAR(50) NOT NULL,
  target_athlete_ids TEXT[],
  target_team_ids TEXT[],
  requires_auth BOOLEAN NOT NULL DEFAULT false,
  -- Recurrence config
  recurrence_type VARCHAR(20) NOT NULL,       -- 'daily', 'weekly', 'custom'
  days_of_week INTEGER[],                      -- 0=Sun..6=Sat (for weekly)
  custom_interval_days INTEGER,                -- e.g. 3 = every 3 days (for custom)
  scheduled_time VARCHAR(5) NOT NULL,          -- HH:mm format
  timezone VARCHAR(50) NOT NULL DEFAULT 'America/New_York',
  -- End conditions
  end_date TIMESTAMP,
  max_occurrences INTEGER,
  occurrences_sent INTEGER NOT NULL DEFAULT 0,
  -- Lifecycle
  next_run_at TIMESTAMP NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active',  -- 'active', 'paused', 'completed', 'cancelled'
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

CREATE INDEX IF NOT EXISTS wellness_schedules_next_run_idx ON wellness_schedules(next_run_at, status);
CREATE INDEX IF NOT EXISTS wellness_schedules_org_idx ON wellness_schedules(organization_id);
