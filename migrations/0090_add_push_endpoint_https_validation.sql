-- Migration: Add HTTPS validation for push notification endpoints
-- Description: Adds CHECK constraint to ensure push subscription endpoints use HTTPS
--              Prevents SSRF attacks via malicious endpoint URLs
-- Author: Claude Code
-- Date: 2025-12-30
-- Related: Security enhancement for migration 0086 (push notifications)

-- Add CHECK constraint to enforce HTTPS-only endpoints (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'push_subscriptions_endpoint_https_check'
  ) THEN
    ALTER TABLE push_subscriptions
    ADD CONSTRAINT push_subscriptions_endpoint_https_check
    CHECK (endpoint ~ '^https://');
  END IF;
END $$;

-- Add comment documenting the security rationale
COMMENT ON CONSTRAINT push_subscriptions_endpoint_https_check ON push_subscriptions IS
'Security: Enforces HTTPS-only endpoints to prevent SSRF attacks. Web Push endpoints from legitimate providers (FCM, Mozilla, Apple) always use HTTPS.';
