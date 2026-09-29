-- Drop the AI model CHECK constraints and remap settings off retired models.
--
-- Deploy order: run this migration with (or before) the code that removes the retired keys.
--
-- The list of valid AI models now lives in code (packages/shared/ai-models.ts) and is enforced by
-- the zod schema on PATCH /api/site-settings, so adding or retiring a model no longer needs a
-- migration. Historical reports keep whatever model key they were generated with.
--
-- Idempotent: constraints are dropped IF EXISTS and the remaps only touch rows still on old keys.

ALTER TABLE site_settings DROP CONSTRAINT IF EXISTS site_settings_ai_model_check;
ALTER TABLE reports DROP CONSTRAINT IF EXISTS reports_coaching_insights_model_check;

-- Remap to a replacement from the SAME provider where one exists, so a site that only has that
-- provider's API key keeps working (moving it to another provider would make insight generation fail
-- with "not available").
-- claude-sonnet-4.5 is replaced by claude-sonnet-5.5
UPDATE site_settings SET ai_model = 'claude-sonnet-5.5' WHERE ai_model = 'claude-sonnet-4.5';

-- claude-haiku-3 (retired April 2026) -> claude-haiku-4.5
UPDATE site_settings SET ai_model = 'claude-haiku-4.5' WHERE ai_model = 'claude-haiku-3';

-- Gemini is not offered for now: gemini-2.0-flash-lite was shut down (June 2026) and the 2.5 models
-- return 404 "no longer available to new users" for our Google project. Fall back to the default.
UPDATE site_settings SET ai_model = 'gpt-6-luna'
  WHERE ai_model IN ('gemini-2.0-flash-lite', 'gemini-2.5-flash-lite', 'gemini-2.5-pro');

COMMENT ON COLUMN site_settings.ai_model IS 'Default AI model for coaching insights generation. Valid keys are defined in packages/shared/ai-models.ts';
COMMENT ON COLUMN reports.coaching_insights_model IS 'AI model key used to generate the insights (see packages/shared/ai-models.ts; retired keys are kept for history)';
