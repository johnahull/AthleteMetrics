-- Migration 0036: Create Site Settings Table
-- Purpose: Store global site settings including AI model selection
-- Author: Claude Code (Coaching Insights Feature)
-- Date: 2025-11-17

-- Create site_settings table
CREATE TABLE IF NOT EXISTS site_settings (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),
  ai_model TEXT NOT NULL DEFAULT 'gpt-5-nano',
  updated_at TIMESTAMP NOT NULL DEFAULT NOW(),
  updated_by VARCHAR REFERENCES users(id) ON DELETE SET NULL
);

-- Insert default settings row (singleton table - only one row should exist)
INSERT INTO site_settings (ai_model, updated_at)
VALUES ('gpt-5-nano', NOW())
ON CONFLICT DO NOTHING;

-- Add comment explaining singleton pattern
COMMENT ON TABLE site_settings IS 'Singleton table storing global site settings. Should only contain one row.';
COMMENT ON COLUMN site_settings.ai_model IS 'Default AI model for coaching insights generation. Must be one of: gpt-5-nano, gemini-2.0-flash-lite, gemini-2.5-flash-lite, claude-haiku-3, claude-haiku-4.5, gemini-2.5-pro, claude-sonnet-4.5';

-- Add check constraint for valid AI models
ALTER TABLE site_settings ADD CONSTRAINT site_settings_ai_model_check
  CHECK (ai_model IN (
    'gpt-5-nano',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash-lite',
    'claude-haiku-3',
    'claude-haiku-4.5',
    'gemini-2.5-pro',
    'claude-sonnet-4.5'
  ));
