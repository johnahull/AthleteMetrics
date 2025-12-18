-- Rollback: Remove security_events table

DROP INDEX IF EXISTS idx_security_events_severity_created;
DROP INDEX IF EXISTS idx_security_events_type_severity;
DROP INDEX IF EXISTS idx_security_events_ip_address;
DROP INDEX IF EXISTS idx_security_events_user_id;
DROP TABLE IF EXISTS security_events;
