-- Rollback: Remove HTTPS validation for push notification endpoints
-- Description: Removes CHECK constraint for HTTPS-only endpoints
-- Author: Claude Code
-- Date: 2025-12-30

ALTER TABLE push_subscriptions
DROP CONSTRAINT IF EXISTS push_subscriptions_endpoint_https_check;
