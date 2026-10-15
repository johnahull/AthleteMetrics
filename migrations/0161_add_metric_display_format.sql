-- Migration 0161: display_format on site_metrics and custom_org_metrics
--
-- 'decimal' (default, every existing row) or 'duration'. A duration metric keeps unit 's' and its values
-- stay stored in seconds; only entry and display use mm:ss. The "duration requires unit 's'" rule is
-- enforced by the metric services, not by a constraint.
--
-- The number is provisional: renumber at merge if another branch lands 0161 first (file, `_down`, test,
-- tracking row, the line in docs/MIGRATION_SYSTEM_REMEDIATION.md).

ALTER TABLE site_metrics
  ADD COLUMN IF NOT EXISTS display_format text NOT NULL DEFAULT 'decimal';

ALTER TABLE custom_org_metrics
  ADD COLUMN IF NOT EXISTS display_format text NOT NULL DEFAULT 'decimal';
