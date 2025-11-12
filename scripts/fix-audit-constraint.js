#!/usr/bin/env node
import postgres from 'postgres';

const sql = postgres(process.env.DATABASE_URL, {
  ssl: process.env.NODE_ENV === 'production' ? 'require' : false,
});

async function fixAuditConstraint() {
  console.log('🔧 Fixing audit_logs constraints...\n');

  try {
    // Drop existing constraints
    console.log('Dropping old constraints...');
    await sql`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_resource_type_valid`;
    await sql`ALTER TABLE audit_logs DROP CONSTRAINT IF EXISTS audit_logs_action_valid`;

    console.log('✓ Old constraints dropped\n');

    // Recreate action constraint with all actions (NOT VALID to allow existing rows)
    console.log('Recreating action constraint...');
    await sql`
      ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_action_valid CHECK (action IN (
        -- Organization actions
        'organization_created', 'organization_deactivated', 'organization_reactivated',
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
        -- Benchmark management actions
        'benchmark_created', 'benchmark_updated', 'benchmark_deleted', 'benchmark_enabled', 'benchmark_disabled',
        'custom_benchmark_created', 'custom_benchmark_updated', 'custom_benchmark_deleted',
        'org_benchmark_enabled', 'org_benchmark_disabled', 'org_benchmark_updated'
      )) NOT VALID
    `;
    console.log('✓ Action constraint recreated (NOT VALID)\n');

    // Recreate resource_type constraint with all types (NOT VALID to allow existing rows)
    console.log('Recreating resource_type constraint...');
    await sql`
      ALTER TABLE audit_logs ADD CONSTRAINT audit_logs_resource_type_valid CHECK (resource_type IN (
        'organization', 'user', 'team', 'measurement', 'invitation', 'session', 'site_metric',
        'site_benchmark', 'custom_benchmark', 'organization_benchmark'
      )) NOT VALID
    `;
    console.log('✓ Resource type constraint recreated (NOT VALID)\n');

    console.log('Note: Constraints are NOT VALID (will only apply to new rows). Existing rows with invalid values will remain.\n');

    console.log('✅ Audit log constraints fixed successfully!\n');

    // Verify
    const result = await sql`
      SELECT conname, pg_get_constraintdef(oid) as definition
      FROM pg_constraint
      WHERE conname IN ('audit_logs_action_valid', 'audit_logs_resource_type_valid')
      ORDER BY conname
    `;

    console.log('📋 Current constraints:');
    for (const row of result) {
      console.log(`  ${row.conname}:`);
      console.log(`    ${row.definition}\n`);
    }

  } catch (error) {
    console.error('❌ Error fixing constraints:', error);
    process.exit(1);
  } finally {
    await sql.end();
  }
}

fixAuditConstraint();
