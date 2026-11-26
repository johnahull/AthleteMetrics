-- Down migration 0188: drop email_verification_tokens.identity_proof_at
--
-- Every recorded proof is lost: automatic global athlete links stop sharing until the code that reads the column
-- is also rolled back. Forgets the manual_migrations row so db:migrate:manual re-applies 0188.

ALTER TABLE email_verification_tokens DROP COLUMN IF EXISTS identity_proof_at;

DO $$
BEGIN
  IF to_regclass('manual_migrations') IS NOT NULL THEN
    DELETE FROM manual_migrations WHERE migration_name = '0188_add_email_verification_identity_proof';
  END IF;
END $$;
