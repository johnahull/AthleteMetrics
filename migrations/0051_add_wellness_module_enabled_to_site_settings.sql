-- Migration: Add wellness_module_enabled to site_settings
-- Description: Add wellness module feature flag to site settings table
-- Author: Claude
-- Date: 2025-11-24

-- Add wellness_module_enabled column to site_settings
ALTER TABLE site_settings
ADD COLUMN IF NOT EXISTS wellness_module_enabled boolean NOT NULL DEFAULT true;

-- Add comment explaining the column
COMMENT ON COLUMN site_settings.wellness_module_enabled IS 'Global feature flag to enable/disable wellness questionnaire module for all organizations';
