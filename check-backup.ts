import postgres from 'postgres';

const client = postgres(process.env.DATABASE_URL!);

(async () => {
  try {
    // Check if backup table exists
    const backupCheck = await client`
      SELECT EXISTS (
        SELECT FROM information_schema.tables
        WHERE table_name = 'users_backup_boolean_migration'
      );
    `;

    if (backupCheck[0].exists) {
      console.log('✓ Backup table exists\n');

      // Get all users from backup
      const backupUsers = await client`
        SELECT id, username, is_active, full_name
        FROM users_backup_boolean_migration
        ORDER BY username
        LIMIT 20;
      `;

      console.log('Sample of users from BACKUP (before migration):');
      console.log('='.repeat(80));
      backupUsers.forEach((u: any) => {
        console.log(`Username: ${u.username.padEnd(30)} isActive: ${u.is_active} (type: ${typeof u.is_active})`);
      });

      // Count active users in backup
      const backupActiveCount = await client`
        SELECT
          COUNT(*) as total,
          COUNT(*) FILTER (WHERE is_active = 'true') as active_string_true,
          COUNT(*) FILTER (WHERE is_active = 'false') as inactive_string_false
        FROM users_backup_boolean_migration;
      `;

      console.log('\n' + '='.repeat(80));
      console.log('BACKUP Table Statistics:');
      console.log(`Total users: ${backupActiveCount[0].total}`);
      console.log(`Active (is_active = 'true'): ${backupActiveCount[0].active_string_true}`);
      console.log(`Inactive (is_active = 'false'): ${backupActiveCount[0].inactive_string_false}`);

    } else {
      console.log('✗ No backup table found - migration may not have created backups');
    }

  } catch (error) {
    console.error('Error:', error);
  } finally {
    await client.end();
  }
})();
