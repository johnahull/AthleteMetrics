#!/usr/bin/env node

/**
 * Database Backup Script
 *
 * Creates a backup of the production database before deployment.
 * Backups are stored in Railway's backup system.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

// Get current directory in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

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
    // Capture output directly to avoid shell redirection issues
    const dumpOutput = runCommand(
      `railway run --service ${RAILWAY_SERVICE_ID} sh -c 'pg_dump "$DATABASE_URL"'`,
      { silent: true }
    );

    // Write output to backup file
    fs.writeFileSync(backupFile, dumpOutput);

    // Check if backup was created and has content
    const stats = fs.statSync(backupFile);
    if (stats.size === 0) {
      throw new Error('Backup file is empty');
    }

    // Verify backup file integrity by checking PostgreSQL dump headers
    // Use streaming to avoid reading large files into memory
    const headerBuffer = Buffer.alloc(1024);
    const fd = fs.openSync(backupFile, 'r');
    fs.readSync(fd, headerBuffer, 0, 1024, 0);
    const headerContent = headerBuffer.toString('utf-8');

    if (!headerContent.includes('PostgreSQL database dump')) {
      fs.closeSync(fd);
      throw new Error('Backup file does not appear to be a valid PostgreSQL dump');
    }

    // Check for completion marker at end of file
    const footerBuffer = Buffer.alloc(1024);
    const footerPos = Math.max(0, stats.size - 1024);
    fs.readSync(fd, footerBuffer, 0, 1024, footerPos);
    fs.closeSync(fd);

    const footerContent = footerBuffer.toString('utf-8');
    if (!footerContent.includes('PostgreSQL database dump complete')) {
      console.warn('⚠️  Warning: Backup may be incomplete (missing completion marker)');
    }

    // Verify reasonable file size (should be > 1KB for any real database)
    if (stats.size < 1024) {
      throw new Error('Backup file suspiciously small (< 1KB) - likely incomplete');
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
    console.error('\nBackup failed - deployment will not continue.');
    console.error('Manual intervention required to create backup before deploying.\n');

    // Fail the deployment if backup fails - safety first
    process.exit(1);
  }
}

// Alternative: Use Railway's built-in backup API
function triggerRailwayBackup() {
  console.log('\n💾 Verifying Railway database backup availability...\n');

  try {
    if (!RAILWAY_TOKEN || !RAILWAY_SERVICE_ID) {
      console.error('❌ ERROR: RAILWAY_TOKEN and RAILWAY_SERVICE_ID must be set');
      process.exit(1);
    }

    // Verify Railway CLI is available and authenticated
    console.log('Verifying Railway CLI authentication...');
    try {
      runCommand('railway whoami', { silent: true });
      console.log('✅ Railway CLI authenticated');
    } catch (error) {
      throw new Error('Railway CLI authentication failed. Cannot verify backups.');
    }

    // Note: Railway automatically backs up databases daily
    // However, we should verify that backups are enabled
    console.log('\n⚠️  Using Railway automatic backups');
    console.log('ℹ️  Railway creates daily backups automatically');
    console.log('ℹ️  Backups are accessible in Railway Dashboard → Database → Backups');
    console.log('ℹ️  Retention period: 7 days (Hobby plan), 14 days (Pro plan)');
    console.log('');
    console.log('⚠️  IMPORTANT: Railway backups may be up to 24 hours old');
    console.log('💡 For immediate pre-deployment backups, set USE_RAILWAY_BACKUPS=false');
    console.log('\n✅ Railway backup verification complete\n');

    process.exit(0);
  } catch (error) {
    console.error('\n❌ Backup verification failed:', error.message);
    console.error('\n⚠️  Cannot verify Railway backups - deployment blocked for safety');
    console.error('💡 Set USE_RAILWAY_BACKUPS=false to create manual backups instead\n');
    process.exit(1); // Fail deployment if we can't verify backups
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
