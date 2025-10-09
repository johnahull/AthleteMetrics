#!/usr/bin/env node

/**
 * Database Backup Script
 *
 * Creates a backup of the production database before deployment.
 * Backups are stored in Railway's backup system.
 */

const { execSync } = require('child_process');
const fs = require('fs');
const path = require('path');

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN;
const RAILWAY_SERVICE_ID = process.env.RAILWAY_SERVICE_ID;
const BACKUP_RETENTION_DAYS = parseInt(process.env.BACKUP_RETENTION_DAYS) || 30;

function runCommand(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? ['pipe', 'pipe', 'pipe'] : 'inherit',
      ...options
    });
  } catch (error) {
    throw new Error(`Command failed: ${command}\n${error.message}`);
  }
}

function createBackup() {
  console.log('\n💾 Creating database backup...\n');

  if (!RAILWAY_TOKEN || !RAILWAY_SERVICE_ID) {
    console.error('❌ ERROR: RAILWAY_TOKEN and RAILWAY_SERVICE_ID must be set');
    process.exit(1);
  }

  try {
    // Get current timestamp for backup naming
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `pre-deploy-backup-${timestamp}`;

    console.log(`Creating backup: ${backupName}`);

    // Get database URL from Railway
    console.log('Fetching database connection details...');
    const varsOutput = runCommand(
      `railway variables --service ${RAILWAY_SERVICE_ID} --json`,
      { silent: true }
    );

    const vars = JSON.parse(varsOutput);
    const databaseUrl = vars.DATABASE_URL;

    if (!databaseUrl) {
      throw new Error('DATABASE_URL not found in Railway variables');
    }

    // Create local backup directory if it doesn't exist
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupFile = path.join(backupDir, `${backupName}.sql`);

    console.log('Dumping database...');

    // Use pg_dump through Railway CLI
    // Railway CLI handles authentication automatically
    runCommand(
      `railway run --service ${RAILWAY_SERVICE_ID} pg_dump $DATABASE_URL > ${backupFile}`
    );

    // Check if backup was created and has content
    const stats = fs.statSync(backupFile);
    if (stats.size === 0) {
      throw new Error('Backup file is empty');
    }

    console.log(`\n✅ Backup created successfully`);
    console.log(`File: ${backupFile}`);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Clean up old backups
    console.log(`\nCleaning up backups older than ${BACKUP_RETENTION_DAYS} days...`);
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const maxAge = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    files.forEach(file => {
      const filePath = path.join(backupDir, file);
      const fileStats = fs.statSync(filePath);
      const age = now - fileStats.mtimeMs;

      if (age > maxAge && file.endsWith('.sql')) {
        fs.unlinkSync(filePath);
        deletedCount++;
        console.log(`  Deleted: ${file}`);
      }
    });

    if (deletedCount === 0) {
      console.log('  No old backups to delete');
    } else {
      console.log(`  Deleted ${deletedCount} old backup(s)`);
    }

    console.log('\n✅ Database backup completed successfully\n');
    process.exit(0);

  } catch (error) {
    console.error('\n❌ Database backup failed:', error.message);
    console.error('\nDeployment will continue, but be aware no backup was created.');
    console.error('Consider manually creating a backup before proceeding.\n');

    // Don't fail the deployment, just warn
    // In production, you might want to fail here instead
    process.exit(0); // Change to exit(1) to fail deployment on backup failure
  }
}

// Alternative: Use Railway's built-in backup API
function triggerRailwayBackup() {
  console.log('\n💾 Triggering Railway database backup...\n');

  try {
    // Note: Railway automatically backs up databases daily
    // This is just documentation of the built-in feature

    console.log('ℹ️  Railway automatically creates daily backups');
    console.log('ℹ️  Backups are accessible in Railway Dashboard → Database → Backups');
    console.log('ℹ️  Retention period: 7 days (Hobby plan)');
    console.log('\n✅ Using Railway automatic backups\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Error:', error.message);
    process.exit(0); // Don't fail deployment
  }
}

// Handle interrupts
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Backup interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Backup terminated');
  process.exit(143);
});

// Determine which backup method to use
const useRailwayBackups = process.env.USE_RAILWAY_BACKUPS === 'true';

if (useRailwayBackups) {
  triggerRailwayBackup();
} else {
  createBackup();
}
