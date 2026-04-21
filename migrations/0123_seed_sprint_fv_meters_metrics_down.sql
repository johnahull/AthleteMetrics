-- Down Migration 0123: Remove meter-unit Sprint F-V site_metrics rows
--
-- WARNING: This will also remove any organization_metrics rows referencing
-- these codes (ON DELETE CASCADE). Run only when rolling back the protocol
-- change; any measurements keyed by these codes will be orphaned from
-- organization-level metric enablement until re-seeded.

DELETE FROM site_metrics
 WHERE code IN ('DASH_10M', 'DASH_20M', 'DASH_30M', 'DASH_40M', 'FLY10M_TIME');

DO $$
BEGIN
  RAISE NOTICE 'Migration 0123 (down): Removed 5 metric-unit site_metrics rows';
END $$;
