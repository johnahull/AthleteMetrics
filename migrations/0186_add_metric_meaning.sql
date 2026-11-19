-- Migration 0186: metrics.meaning (plain-language insights for families, PR D)
--
-- Family-facing "what this result means" text, written for parents. Editable per site metric (the /metrics editor)
-- and per custom organization metric; read by getMetricExplanationsAndMeanings. Nullable, no default: NULL = no
-- stored meaning (the built-in text applies). Must match packages/shared/schema/tables/metrics.ts exactly
-- (CI builds its DB with db:push). The 400-character cap lives in the Zod schemas, not the column.
--
-- The number is provisional: renumber at merge if another branch lands 0186 first (file, `_down`, test
-- `migration-0186-metric-meaning`, tracking row, the line in docs/MIGRATION_SYSTEM_REMEDIATION.md).
--
-- IDEMPOTENT: safe to run multiple times.

ALTER TABLE site_metrics ADD COLUMN IF NOT EXISTS meaning TEXT;
ALTER TABLE custom_org_metrics ADD COLUMN IF NOT EXISTS meaning TEXT;
