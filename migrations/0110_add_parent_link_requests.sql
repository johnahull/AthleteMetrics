-- Migration: 0110_add_parent_link_requests
-- Adds parent_link_requests table for the Phase 3 "Link a Child" workflow.
-- A parent initiates a request to link to a child athlete; coaches or
-- site admins approve or deny the request.

CREATE TABLE IF NOT EXISTS parent_link_requests (
  id VARCHAR PRIMARY KEY DEFAULT gen_random_uuid(),

  -- The parent user requesting to link
  parent_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- The athlete the parent wants to be linked to
  athlete_user_id VARCHAR NOT NULL REFERENCES users(id) ON DELETE CASCADE,

  -- Organization context (null if the athlete is independent)
  organization_id VARCHAR REFERENCES organizations(id) ON DELETE SET NULL,

  -- Workflow status: pending | approved | denied | cancelled
  status TEXT NOT NULL DEFAULT 'pending'
    CONSTRAINT parent_link_requests_status_check
    CHECK (status IN ('pending', 'approved', 'denied', 'cancelled')),

  -- Admin who processed the request (null until processed)
  processed_by VARCHAR REFERENCES users(id) ON DELETE SET NULL,
  processed_at TIMESTAMP,

  -- Reason stored when request is denied
  denial_reason TEXT,

  -- Timestamps
  created_at TIMESTAMP NOT NULL DEFAULT NOW(),

  -- Requests expire if not acted upon (30 days from creation)
  expires_at TIMESTAMP NOT NULL
);

CREATE INDEX IF NOT EXISTS parent_link_requests_parent_idx
  ON parent_link_requests (parent_user_id);

CREATE INDEX IF NOT EXISTS parent_link_requests_athlete_idx
  ON parent_link_requests (athlete_user_id);

CREATE INDEX IF NOT EXISTS parent_link_requests_status_idx
  ON parent_link_requests (status);
