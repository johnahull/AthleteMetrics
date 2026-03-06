-- Migration: 0024_add_device_import_support
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

  -- Event linkage (optional)
  event_id VARCHAR,
  event_name_snapshot TEXT,

  -- Server-side parsed preview (cleared after commit)
  parsed_preview JSONB,

  -- Status tracking
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
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

-- Indexes for import_batches
CREATE INDEX IF NOT EXISTS import_batches_org_idx ON import_batches (organization_id);
CREATE INDEX IF NOT EXISTS import_batches_status_idx ON import_batches (status);
CREATE INDEX IF NOT EXISTS import_batches_created_at_idx ON import_batches (created_at);
