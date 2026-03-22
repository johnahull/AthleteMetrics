-- Migration: Add auto-share report columns to events table
-- Supports automated report generation and delivery when events are finalized

ALTER TABLE events ADD COLUMN IF NOT EXISTS auto_share_reports BOOLEAN NOT NULL DEFAULT false;
ALTER TABLE events ADD COLUMN IF NOT EXISTS auto_share_report_template_id VARCHAR REFERENCES reports(id) ON DELETE SET NULL;
ALTER TABLE events ADD COLUMN IF NOT EXISTS auto_share_message TEXT;
ALTER TABLE events ADD COLUMN IF NOT EXISTS finalized_at TIMESTAMP;

-- Index for finding events pending finalization
CREATE INDEX IF NOT EXISTS events_finalized_at_idx ON events(finalized_at);
