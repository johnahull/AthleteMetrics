-- Down migration: remove GPT-6 Luna / GPT-6 Sol from the allowed AI model keys.
--
-- Rows already using a GPT-6 model would violate the restored constraints, so
-- site_settings falls back to the default (gpt-5-nano) and reports lose the
-- recorded model (NULL is allowed).

UPDATE site_settings SET ai_model = 'gpt-5-nano' WHERE ai_model IN ('gpt-6-luna', 'gpt-6-sol');
UPDATE reports SET coaching_insights_model = NULL WHERE coaching_insights_model IN ('gpt-6-luna', 'gpt-6-sol');

ALTER TABLE site_settings ALTER COLUMN ai_model SET DEFAULT 'gpt-5-nano';

COMMENT ON COLUMN site_settings.ai_model IS 'Default AI model for coaching insights generation. Must be one of: gpt-5-nano, gemini-2.0-flash-lite, gemini-2.5-flash-lite, claude-haiku-3, claude-haiku-4.5, gemini-2.5-pro, claude-sonnet-4.5';

ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_ai_model_check;
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

ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_coaching_insights_model_check;
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
