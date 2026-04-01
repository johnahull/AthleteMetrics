-- Migration: Add branding columns to organizations table for PDF customization
-- Supports organization logo, brand colors, and tagline for premium PDF reports

ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_logo_url TEXT;
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_primary_color VARCHAR(7);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_secondary_color VARCHAR(7);
ALTER TABLE organizations ADD COLUMN IF NOT EXISTS brand_tagline VARCHAR(200);
