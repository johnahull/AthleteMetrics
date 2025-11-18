-- Migration 0038: Add Report Insights Columns
-- Purpose: Add coaching insights columns to reports table
-- Author: Claude Code (Coaching Insights Feature)
-- Date: 2025-11-17

-- Add coaching insights columns to reports
ALTER TABLE reports ADD COLUMN IF NOT EXISTS coaching_insights TEXT;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS coaching_insights_generated_at TIMESTAMP;
ALTER TABLE reports ADD COLUMN IF NOT EXISTS coaching_insights_model TEXT;

-- Add comments
COMMENT ON COLUMN reports.coaching_insights IS 'AI-generated or manually edited coaching insights for this report (markdown format)';
COMMENT ON COLUMN reports.coaching_insights_generated_at IS 'Timestamp when coaching insights were last generated or updated';
COMMENT ON COLUMN reports.coaching_insights_model IS 'AI model used to generate the insights (e.g., gpt-5-nano, claude-sonnet-4.5)';

-- Create index for reports with insights (for analytics/reporting)
CREATE INDEX IF NOT EXISTS reports_has_insights_idx ON reports(coaching_insights_generated_at) WHERE coaching_insights IS NOT NULL;

-- Add check constraint for valid AI models (same as site_settings)
ALTER TABLE reports ADD CONSTRAINT reports_coaching_insights_model_check
  CHECK (
    coaching_insights_model IS NULL OR
    coaching_insights_model IN (
      'gpt-5-nano',
      'gemini-2.0-flash-lite',
      'gemini-2.5-flash-lite',
      'claude-haiku-3',
      'claude-haiku-4.5',
      'gemini-2.5-pro',
      'claude-sonnet-4.5'
    )
  );
