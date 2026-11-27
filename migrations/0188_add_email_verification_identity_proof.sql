-- Migration 0188: email_verification_tokens.identity_proof_at
--
-- Set when the token's own user redeemed the token while signed in. Only such a token proves that the account
-- controls the address, which automatic global athlete links require before they share data. Nullable, no
-- default: tokens redeemed before this column existed cannot be told apart, so they prove nothing and the
-- account verifies again while signed in. Must match packages/shared/schema/tables/auth.ts exactly (CI builds
-- its DB with db:push).
--
-- The number is provisional: renumber at merge if another branch lands 0188 first (file, `_down`, test
-- `migration-0188-email-verification-identity-proof`, tracking row, the line in docs/MIGRATION_SYSTEM_REMEDIATION.md).
--
-- IDEMPOTENT: safe to run multiple times.

ALTER TABLE email_verification_tokens ADD COLUMN IF NOT EXISTS identity_proof_at TIMESTAMP;
