-- Migration 0184: organizations.ai_prompt_overrides
--
-- Org-admin wording for the AI insights prompt (philosophy, toneParent, toneAthlete, toneCoach; jsonb, validated by
-- orgAiPromptOverridesSchema in packages/shared/ai-prompt-overrides.ts). Null or a missing key = inherit the site
-- wording, then the code default. Written only by PATCH /api/organizations/:id/org-settings and shown only to the
-- organization's admins. Nullable, no backfill.
--
-- The number is provisional: renumber at merge if another branch lands 0184 first (file, `_down`, test
-- `migration-0184-org-ai-prompt-overrides`, tracking row, the line in docs/MIGRATION_SYSTEM_REMEDIATION.md).
--
-- IDEMPOTENT: safe to run multiple times.

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ai_prompt_overrides jsonb;
