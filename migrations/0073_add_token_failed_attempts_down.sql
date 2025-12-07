-- Rollback migration: Remove failed attempts tracking from account linking tokens

-- Remove failed_attempts column (idempotent via IF EXISTS)
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_name = 'account_linking_tokens'
    AND column_name = 'failed_attempts'
  ) THEN
    ALTER TABLE account_linking_tokens DROP COLUMN failed_attempts;
  END IF;
END $$;
