-- Migration 0182: reports.coach_notes and organizations.ai_style_example
--
-- coach_notes: coach-authored context for the AI insights of an individual report (jsonb, validated by
-- coachNotesSchema in packages/shared/coach-notes.ts). Written only by PATCH /api/reports/:id/coach-notes and
-- never returned to non-writers. ai_style_example: org-admin supplied style exemplar for the AI insights.
-- Both nullable, no backfill.
--
-- Renumbered from 0181 (which #756 landed first). Environments that already applied it under the old
-- `0181_add_coach_notes_and_ai_style_example` name re-run this file once under the new name; harmless (IF NOT EXISTS).

ALTER TABLE reports
  ADD COLUMN IF NOT EXISTS coach_notes jsonb;

ALTER TABLE organizations
  ADD COLUMN IF NOT EXISTS ai_style_example text;
