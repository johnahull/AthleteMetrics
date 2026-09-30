-- Down migration: restore the AI model CHECK constraints as of migration 0142.
--
-- Rows using keys outside that list would violate the restored constraints, so
-- site_settings falls back to the default (gpt-6-luna) and reports lose the recorded model
-- (NULL is allowed). The 0143 remaps (claude-sonnet-4.5 -> claude-sonnet-5.5, claude-haiku-3 ->
-- claude-haiku-4.5, the Gemini keys -> gpt-6-luna) are not reversed: this down
-- migration is intentionally lossy, so running up then down leaves migrated rows on their replacement
-- models (and any report that used a key outside the 0142 list loses its recorded model).

UPDATE site_settings SET ai_model = 'gpt-6-luna'
  WHERE ai_model NOT IN (
    'gpt-5-nano', 'gpt-6-luna', 'gpt-6-sol', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite',
    'claude-haiku-3', 'claude-haiku-4.5', 'gemini-2.5-pro', 'claude-sonnet-4.5'
  );

UPDATE reports SET coaching_insights_model = NULL
  WHERE coaching_insights_model IS NOT NULL
    AND coaching_insights_model NOT IN (
      'gpt-5-nano', 'gpt-6-luna', 'gpt-6-sol', 'gemini-2.0-flash-lite', 'gemini-2.5-flash-lite',
      'claude-haiku-3', 'claude-haiku-4.5', 'gemini-2.5-pro', 'claude-sonnet-4.5'
    );

COMMENT ON COLUMN site_settings.ai_model IS 'Default AI model for coaching insights generation. Must be one of: gpt-5-nano, gpt-6-luna, gpt-6-sol, gemini-2.0-flash-lite, gemini-2.5-flash-lite, claude-haiku-3, claude-haiku-4.5, gemini-2.5-pro, claude-sonnet-4.5';
COMMENT ON COLUMN reports.coaching_insights_model IS 'AI model used to generate the insights (e.g., gpt-5-nano, claude-sonnet-4.5)';

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
