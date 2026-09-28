-- Add GPT-6 Luna and GPT-6 Sol to the allowed AI model keys.
--
-- Rebuilds the two CHECK constraints introduced in 0036 (site_settings) and
-- 0038 (reports). Idempotent: constraints are dropped if present, then re-added.

COMMENT ON COLUMN site_settings.ai_model IS 'Default AI model for coaching insights generation. Must be one of: gpt-5-nano, gpt-6-luna, gpt-6-sol, gemini-2.0-flash-lite, gemini-2.5-flash-lite, claude-haiku-3, claude-haiku-4.5, gemini-2.5-pro, claude-sonnet-4.5';

ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_ai_model_check;
ALTER TABLE site_settings ADD CONSTRAINT site_settings_ai_model_check
  CHECK (ai_model IN (
    'gpt-5-nano',
    'gpt-6-luna',
    'gpt-6-sol',
    'gemini-2.0-flash-lite',
    'gemini-2.5-flash-lite',
    'claude-haiku-3',
    'claude-haiku-4.5',
    'gemini-2.5-pro',
    'claude-sonnet-4.5'
  ));

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_coaching_insights_model_check;
ALTER TABLE reports ADD CONSTRAINT reports_coaching_insights_model_check
  CHECK (
    coaching_insights_model IS NULL OR
    coaching_insights_model IN (
      'gpt-5-nano',
      'gpt-6-luna',
      'gpt-6-sol',
      'gemini-2.0-flash-lite',
      'gemini-2.5-flash-lite',
      'claude-haiku-3',
      'claude-haiku-4.5',
      'gemini-2.5-pro',
      'claude-sonnet-4.5'
    )
  );
