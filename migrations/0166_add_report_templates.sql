-- Migration 0166 (PROVISIONAL number, take the next free one at merge): report templates.
--
-- A coach saves the metrics, benchmark sets / picks and chart choices of a report once and picks it in
-- the report wizard. Shared org-wide. Benchmark sets are stored by id, so a new report uses the set's
-- current contents; saved reports stay frozen.
--
-- Ids are varchar(36) with gen_random_uuid() (production id columns are varchar(36)); no id is derived
-- from another id.

CREATE TABLE IF NOT EXISTS report_templates (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  organization_id VARCHAR(36) NOT NULL REFERENCES organizations(id) ON DELETE CASCADE,
  name VARCHAR(200) NOT NULL,
  description TEXT,
  metrics JSONB NOT NULL,
  benchmark_set_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  site_benchmark_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  custom_benchmark_ids JSONB NOT NULL DEFAULT '[]'::jsonb,
  charts JSONB NOT NULL DEFAULT '{}'::jsonb,
  created_by VARCHAR(36) REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  CONSTRAINT report_templates_org_name_uniq UNIQUE (organization_id, name)
);

CREATE INDEX IF NOT EXISTS report_templates_org_idx ON report_templates (organization_id);
