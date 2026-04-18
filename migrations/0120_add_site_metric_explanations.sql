-- Migration 0026: Add site_metric_explanations table and extend custom_org_metrics
-- Phase 2 of Issue #367 — Metric Explanations Editor

-- Site-level metric explanation overrides (site admins can customize built-in prose)
CREATE TABLE IF NOT EXISTS site_metric_explanations (
  id VARCHAR(36) PRIMARY KEY DEFAULT gen_random_uuid(),
  metric_code VARCHAR(100) NOT NULL UNIQUE,
  title TEXT,
  short_description TEXT,
  what_it_measures TEXT,
  why_it_matters TEXT,
  updated_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  created_at TIMESTAMP DEFAULT NOW() NOT NULL,
  updated_at TIMESTAMP DEFAULT NOW() NOT NULL
);

-- Indexes for site_metric_explanations
CREATE INDEX IF NOT EXISTS idx_site_metric_explanations_code ON site_metric_explanations(metric_code);

-- Extend custom_org_metrics with richer explanation fields
ALTER TABLE custom_org_metrics ADD COLUMN IF NOT EXISTS short_description TEXT;
ALTER TABLE custom_org_metrics ADD COLUMN IF NOT EXISTS what_it_measures TEXT;
ALTER TABLE custom_org_metrics ADD COLUMN IF NOT EXISTS why_it_matters TEXT;
