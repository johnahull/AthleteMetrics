-- Migration 0025: Add organization update and benchmark management audit log actions
-- Description: Extends audit_logs CHECK constraints to support organization updates and benchmark management
-- Created: 2025-11-03
-- Dependencies: 0023_add_metric_audit_actions.sql, 0024_add_benchmarks_system.sql

-- Drop existing CHECK constraints
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid;
ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid;

-- Recreate action constraint with organization update and benchmark actions
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
  -- Organization actions
  'organization_created', 'organization_updated', 'organization_deactivated', 'organization_reactivated',
  'organization_deleted', 'organization_dependencies_viewed',
  -- User & authentication actions
  'site_admin_access', 'site_admin_organization_access', 'user_created', 'user_updated',
  'user_deleted', 'user_role_changed', 'role_changed',
  'password_reset_unknown_email', 'email_verification_requested', 'password_change_failed',
  'privilege_restoration_blocked', 'admin_password_synced', 'privilege_restored',
  -- Team actions
  'team_created', 'team_updated', 'team_deleted', 'team_archived',
  -- Measurement actions
  'measurement_created', 'measurement_updated', 'measurement_deleted',
  -- Invitation actions
  'invitation_created', 'invitation_accepted', 'invitation_cancelled', 'invitation_resent',
  -- Session management actions
  'sessions_revoked', 'zombie_sessions_cleaned', 'zombie_cleanup_failed', 'session_revocation_failed',
  -- Metric management actions
  'metric_created', 'metric_updated', 'metric_enabled', 'metric_disabled', 'metric_deleted',
  'org_metric_enabled', 'org_metric_disabled', 'org_metric_updated', 'org_metrics_bulk_enabled',
  -- Benchmark management actions (NEW in 0025)
  'benchmark_created', 'benchmark_updated', 'benchmark_deleted', 'benchmark_enabled', 'benchmark_disabled',
  'custom_benchmark_created', 'custom_benchmark_updated', 'custom_benchmark_deleted',
  'org_benchmark_enabled', 'org_benchmark_disabled'
));

-- Recreate resource_type constraint with benchmark types
ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
  'organization', 'user', 'team', 'measurement', 'invitation', 'session', 'site_metric',
  -- Benchmark resource types (NEW in 0025)
  'site_benchmark', 'custom_benchmark', 'organization_benchmark'
));

-- Add comments for documentation
COMMENT ON CONSTRAINT audit_logs_action_valid ON audit_logs IS 'Valid audit log actions including organization updates and benchmark management (updated in migration 0025)';
COMMENT ON CONSTRAINT audit_logs_resource_type_valid ON audit_logs IS 'Valid resource types including benchmark types (updated in migration 0025)';
