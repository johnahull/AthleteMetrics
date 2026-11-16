-- Migration 0181: reports.coach_notes and organizations.ai_style_example
--
-- coach_notes: coach-authored context for the AI insights of an individual report (jsonb, validated by
-- coachNotesSchema in packages/shared/coach-notes.ts). Written only by PATCH /api/reports/:id/coach-notes and
-- never returned to non-writers. ai_style_example: org-admin supplied style exemplar for the AI insights.
-- Both nullable, no backfill.
--
-- The number is provisional: AM-FEAT-024 reserves 0179 and 0180. Renumber at merge if another branch lands
-- 0181 first (file, `_down`, test, tracking row, the line in docs/MIGRATION_SYSTEM_REMEDIATION.md).

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS coach_notes jsonb;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ai_style_example text;
