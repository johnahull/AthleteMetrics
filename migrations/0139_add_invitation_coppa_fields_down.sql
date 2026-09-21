-- Down Migration 0139: Remove COPPA fields from invitations
--
-- Safe to drop: the columns only pre-fill the accept-time age gate; the
-- authoritative COPPA state lives on users/parental_consents.
ALTER TABLE invitations DROP COLUMN IF EXISTS birth_date;
ALTER TABLE invitations DROP COLUMN IF EXISTS parent_email;
