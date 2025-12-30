-- Rollback: Remove security_events table
-- Note: CONCURRENTLY removed to match forward migration syntax

DROP INDEX IF EXISTS idx_security_events_auth_failures_by_ip;
DROP INDEX IF EXISTS idx_security_events_auth_failures_by_user;
DROP INDEX IF EXISTS idx_security_events_auth_failures;
DROP INDEX IF EXISTS idx_security_events_severity_created;
DROP INDEX IF EXISTS idx_security_events_type_severity;
DROP INDEX IF EXISTS idx_security_events_ip_address;
DROP INDEX IF EXISTS idx_security_events_user_id;
DROP TABLE IF EXISTS security_events;
