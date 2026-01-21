-- Migration 0079: Add events_enabled flag to organizations
-- Feature is disabled by default - org admins must explicitly enable

ALTER TABLE organizations
ADD COLUMN IF NOT EXISTS events_enabled boolean NOT NULL DEFAULT false;

-- Index for filtering orgs with events enabled (partial index for efficiency)
CREATE INDEX IF NOT EXISTS organizations_events_enabled_idx
ON organizations(events_enabled)
WHERE events_enabled = true;

COMMENT ON COLUMN organizations.events_enabled IS
  'Whether Events feature is enabled for this organization. Disabled by default. Org admins can toggle this in settings.';
