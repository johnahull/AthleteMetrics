-- Migration 0139: Add COPPA fields to invitations
--
-- Coach-side age capture at invite-create time (coppa-compliance-spec,
-- "Invitation flow modification"): an athlete invitation with an under-13
-- birth_date cannot be created without a parent_email, so the VPC flow can
-- fire at accept time even if the athlete's form omits the parent email.
-- Both columns are nullable — the coach may not know the athlete's DOB, in
-- which case the accept-time age gate remains the backstop.

ALTER TABLE invitations ADD COLUMN IF NOT EXISTS birth_date DATE;
ALTER TABLE invitations ADD COLUMN IF NOT EXISTS parent_email TEXT;
