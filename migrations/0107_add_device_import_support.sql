-- Migration: 0107_add_device_import_support
-- Description: Add import_batches table and import tracking columns to measurements
-- Date: 2026-03-06

-- Add device import tracking columns to measurements table
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS import_source VARCHAR(50);
ALTER TABLE measurements ADD COLUMN IF NOT EXISTS import_batch_id VARCHAR;

-- Index for rollback queries (find all measurements from a specific import batch)
CREATE INDEX IF NOT EXISTS measurements_import_batch_idx ON measurements (import_batch_id);

-- Create import_batches table for server-side parsed preview storage
CREATE TABLE IF NOT EXISTS import_batches (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,

  -- Import metadata
  source VARCHAR(50) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  session_date TEXT,

  -- Event linkage (optional — SET NULL if event is deleted so batch history survives)
  event_id VARCHAR REFERENCES events(id) ON DELETE SET NULL,
  event_name_snapshot TEXT,

  -- Server-side parsed preview (cleared after commit)
  parsed_preview JSONB,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending'
    CHECK (status IN ('pending', 'completed', 'rolled_back', 'expired')),
  -- Audit columns: intentionally no FK to users — allows batch history to
  -- survive user deletion (user IDs are still queryable via other tables).
  created_by VARCHAR NOT NULL,
  committed_by VARCHAR,
  committed_at TIMESTAMP,
  rolled_back_by VARCHAR,
  rolled_back_at TIMESTAMP,

  -- Result counts (populated after commit)
  measurements_created INTEGER,
  measurements_skipped INTEGER,
  measurements_replaced INTEGER,
  athletes_imported INTEGER,

  -- Timestamps
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  expires_at TIMESTAMP NOT NULL
);

-- Insert new device-import metrics into site_metrics so unitMap lookups
-- and addMissingEventMetrics work correctly for Dashr-specific drills.
INSERT INTO site_metrics (code, label, category, unit, metric_type, is_system_default, is_active, display_order, description, decimal_precision, color, icon)
VALUES
  ('DASH_5YD', '5-Yard Dash Split', 'speed', 's', 'lower_is_better', true, true, 20,
   '5-yard split time from Dashr timing gates (acceleration phase).',
   3, 'indigo', 'Timer'),
  ('DASH_10YD', '10-Yard Dash Split', 'speed', 's', 'lower_is_better', true, true, 21,
   '10-yard split time from Dashr timing gates.',
   3, 'indigo', 'Timer'),
  ('DASH_20YD', '20-Yard Dash Split', 'speed', 's', 'lower_is_better', true, true, 22,
   '20-yard split time from Dashr timing gates.',
   3, 'indigo', 'Timer'),
  ('DASH_30YD', '30-Yard Dash Split', 'speed', 's', 'lower_is_better', true, true, 23,
   '30-yard split time from Dashr timing gates.',
   3, 'indigo', 'Timer'),
  ('AGILITY_505_L', '5-0-5 Agility (Left)', 'agility', 's', 'lower_is_better', true, true, 24,
   '5-0-5 agility test turning to the left.',
   3, 'green', 'Zap'),
  ('AGILITY_505_R', '5-0-5 Agility (Right)', 'agility', 's', 'lower_is_better', true, true, 25,
   '5-0-5 agility test turning to the right.',
   3, 'green', 'Zap'),
  ('AGILITY_5105_L', '5-10-5 Agility (Left)', 'agility', 's', 'lower_is_better', true, true, 26,
   '5-10-5 Pro Agility test starting to the left.',
   3, 'yellow', 'Zap'),
  ('AGILITY_5105_R', '5-10-5 Agility (Right)', 'agility', 's', 'lower_is_better', true, true, 27,
   '5-10-5 Pro Agility test starting to the right.',
   3, 'yellow', 'Zap')
ON CONFLICT (code) DO NOTHING;

-- Indexes for import_batches
CREATE INDEX IF NOT EXISTS import_batches_org_idx ON import_batches (organization_id);
CREATE INDEX IF NOT EXISTS import_batches_status_idx ON import_batches (status);
CREATE INDEX IF NOT EXISTS import_batches_created_at_idx ON import_batches (created_at);
-- TTL cleanup index: supports periodic purge of expired pending rows and getBatches filter
CREATE INDEX IF NOT EXISTS import_batches_expires_at_idx ON import_batches (expires_at);
