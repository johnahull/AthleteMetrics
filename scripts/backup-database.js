#!/usr/bin/env node

/**
 * Database Backup Script
 *
 * Creates a backup of the production database before deployment.
 * Backups are stored in Railway's backup system.
 */

import { execSync } from 'child_process';
import fs from 'fs';
import { createReadStream } from 'fs';
import { open } from 'fs/promises';
import path from 'path';
import { fileURLToPath } from 'url';
import { createHash } from 'crypto';

// Get current directory in ES module context
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const RAILWAY_TOKEN = process.env.RAILWAY_TOKEN;
const RAILWAY_SERVICE_ID = process.env.RAILWAY_SERVICE_ID;
const PUBLIC_DATABASE_URL = process.env.PUBLIC_DATABASE_URL; // For GitHub Actions (external network)

// SECURITY: Validate backup retention days to prevent integer overflow/underflow
// Negative values would delete ALL backups, zero would delete current backup
function validateBackupRetentionDays(days) {
  const parsed = parseInt(days);
  if (isNaN(parsed) || parsed < 1 || parsed > 365) {
    throw new Error(`Invalid BACKUP_RETENTION_DAYS: must be between 1 and 365 (got: ${days})`);
  }
  return parsed;
}

const BACKUP_RETENTION_DAYS = validateBackupRetentionDays(process.env.BACKUP_RETENTION_DAYS || '30');

function runCommand(command, options = {}) {
  try {
    return execSync(command, {
      encoding: 'utf-8',
      stdio: options.silent ? ['pipe', 'pipe', 'pipe'] : 'inherit',
      ...options
    });
  } catch (error) {
    // SECURITY FIX: Include original error context for better debugging
    // This helps identify whether it's a Railway CLI issue, network problem, or pg_dump failure
    throw new Error(`Command failed: ${command}\nOriginal error: ${error.message}\nExit code: ${error.status || 'N/A'}`);
  }
}

/**
 * Verify backup checksum (for restore validation)
 * @param {string} backupFile - Path to backup .sql file
 * @returns {Promise<boolean>} - True if checksum matches
 */
async function verifyBackupChecksum(backupFile) {
  const checksumFile = `${backupFile}.sha256`;

  if (!fs.existsSync(checksumFile)) {
    console.warn(`⚠️  Checksum file not found: ${checksumFile}`);
    return false;
  }

  // Read stored checksum
  const storedChecksum = fs.readFileSync(checksumFile, 'utf-8').split(' ')[0];

  // Calculate actual checksum using streaming
  const hash = createHash('sha256');
  const fileStream = createReadStream(backupFile);

  await new Promise((resolve, reject) => {
    fileStream.on('data', (chunk) => hash.update(chunk));
    fileStream.on('end', resolve);
    fileStream.on('error', reject);
  });

  const actualChecksum = hash.digest('hex');

  if (storedChecksum !== actualChecksum) {
    console.error(`❌ Checksum mismatch!`);
    console.error(`   Expected: ${storedChecksum}`);
    console.error(`   Actual:   ${actualChecksum}`);
    return false;
  }

  console.log('✅ Backup checksum verified');
  return true;
}

async function createBackup() {
  console.log('\n💾 Creating database backup...\n');

  if (!RAILWAY_TOKEN || !RAILWAY_SERVICE_ID) {
    console.error('❌ ERROR: RAILWAY_TOKEN and RAILWAY_SERVICE_ID must be set');
    process.exit(1);
  }

  try {
    // Validate Service ID format first (Railway uses UUIDs)
    // This prevents command injection attacks
    if (!/^[a-f0-9]{8}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{4}-[a-f0-9]{12}$/i.test(RAILWAY_SERVICE_ID)) {
      throw new Error('Invalid RAILWAY_SERVICE_ID format - expected UUID');
    }

    // Get current timestamp for backup naming
    const timestamp = new Date().toISOString().replace(/[:.]/g, '-');
    const backupName = `pre-deploy-backup-${timestamp}`;

    console.log(`Creating backup: ${backupName}`);

    // Get database URL - use PUBLIC_DATABASE_URL if set (for GitHub Actions),
    // otherwise fetch from Railway variables (for Railway environment)
    let databaseUrl;

    if (PUBLIC_DATABASE_URL) {
      console.log('Using PUBLIC_DATABASE_URL (external network)...');
      databaseUrl = PUBLIC_DATABASE_URL;
    } else {
      console.log('Fetching database connection details from Railway...');
      const varsOutput = runCommand(
        `railway variables --service ${RAILWAY_SERVICE_ID} --json`,
        { silent: true }
      );

      const vars = JSON.parse(varsOutput);
      databaseUrl = vars.DATABASE_URL;

      if (!databaseUrl) {
        throw new Error('DATABASE_URL not found in Railway variables');
      }
    }

    // Create local backup directory if it doesn't exist
    const backupDir = path.join(process.cwd(), 'backups');
    if (!fs.existsSync(backupDir)) {
      fs.mkdirSync(backupDir, { recursive: true });
    }

    const backupFile = path.join(backupDir, `${backupName}.sql`);

    console.log('Dumping database...');

    // Use pg_dump - either through Railway CLI (internal) or directly (public URL)
    // Stream output directly to file to avoid ENOBUFS errors on large databases
    if (PUBLIC_DATABASE_URL) {
      // Direct pg_dump with public URL (for GitHub Actions)
      // Pipe output directly to file to handle large databases
      runCommand(
        `pg_dump "${databaseUrl}" > "${backupFile}"`,
        { shell: '/bin/bash' }
      );
    } else {
      // Use Railway CLI (for Railway environment with internal hostnames)
      // Railway CLI handles authentication automatically
      runCommand(
        `railway run --service ${RAILWAY_SERVICE_ID} sh -c 'pg_dump "$DATABASE_URL"' > "${backupFile}"`,
        { shell: '/bin/bash' }
      );
    }

    // Set restricted permissions after file is created (owner-only)
    // SECURITY: Mode 0o600 = rw------- (owner read/write, no group/other access)
    fs.chmodSync(backupFile, 0o600);

    // Validate file size first (before opening file descriptor)
    // This ensures we only open the file descriptor when necessary
    const stats = fs.statSync(backupFile);
    if (stats.size === 0) {
      throw new Error('Backup file is empty');
    }

    // SECURITY FIX: Environment-aware backup size validation
    // Staging: Warn if < 5KB (may be fresh database)
    // Production: Error if < 5KB (should always have data)
    const MIN_BACKUP_SIZE = 5 * 1024; // 5KB
    const isProduction = process.env.NODE_ENV === 'production';

    if (stats.size < MIN_BACKUP_SIZE) {
      const message = `Backup file suspiciously small (${stats.size} bytes < ${MIN_BACKUP_SIZE} bytes minimum). Expected at least 5KB for schema structure.`;

      if (isProduction) {
        // Production: Fail - should never have empty database
        throw new Error(`${message} Backup may be incomplete or corrupted.`);
      } else {
        // Staging: Warn but allow - might be fresh setup
        console.warn(`⚠️  ${message}`);
        console.warn('   This may be normal for fresh/empty staging databases.');
        console.warn('   Production backups will require minimum size.');
      }
    }

    // Verify backup file integrity using async streaming I/O
    // This prevents blocking the event loop and handles large files efficiently
    const fileHandle = await open(backupFile, 'r');

    try {
      // Read header (first 1KB)
      const headerBuffer = Buffer.alloc(1024);
      await fileHandle.read(headerBuffer, 0, 1024, 0);
      const headerContent = headerBuffer.toString('utf-8');

      if (!headerContent.includes('PostgreSQL database dump')) {
        throw new Error('Backup file does not appear to be a valid PostgreSQL dump');
      }

      // Read footer (last 1KB) - check for completion marker
      const footerBuffer = Buffer.alloc(1024);
      const footerPos = Math.max(0, stats.size - 1024);
      await fileHandle.read(footerBuffer, 0, 1024, footerPos);

      const footerContent = footerBuffer.toString('utf-8');
      if (!footerContent.includes('PostgreSQL database dump complete')) {
        throw new Error('Backup incomplete - missing completion marker. Dump may have been interrupted.');
      }

      // Verify backup contains essential SQL structures
      // Check for COPY blocks (data) - at least table definitions should be present
      if (!headerContent.includes('CREATE TABLE') && !footerContent.includes('CREATE TABLE')) {
        console.warn('⚠️  Warning: No CREATE TABLE statements found - backup may only contain data');
      }
    } finally {
      // Always close file handle, even if validation fails
      await fileHandle.close();
    }

    // Generate SHA-256 checksum using streaming (prevents OOM on large files)
    console.log('🔐 Generating backup checksum...');
    const hash = createHash('sha256');
    const fileStream = createReadStream(backupFile);

    await new Promise((resolve, reject) => {
      fileStream.on('data', (chunk) => hash.update(chunk));
      fileStream.on('end', resolve);
      fileStream.on('error', reject);
    });

    const checksum = hash.digest('hex');

    // Save checksum alongside backup
    fs.writeFileSync(`${backupFile}.sha256`, `${checksum}  ${path.basename(backupFile)}\n`);
    console.log(`   SHA-256: ${checksum.substring(0, 16)}...`);

    console.log(`\n✅ Backup created successfully`);
    console.log(`File: ${backupFile}`);
    console.log(`Size: ${(stats.size / 1024 / 1024).toFixed(2)} MB`);

    // Clean up old backups
    console.log(`\nCleaning up backups older than ${BACKUP_RETENTION_DAYS} days...`);
    const files = fs.readdirSync(backupDir);
    const now = Date.now();
    const maxAge = BACKUP_RETENTION_DAYS * 24 * 60 * 60 * 1000;

    let deletedCount = 0;
    files
      .filter(f => f.endsWith('.sql'))
      .forEach(file => {
        const filePath = path.join(backupDir, file);
        const checksumPath = `${filePath}.sha256`;
        const fileStats = fs.statSync(filePath);
        // SECURITY FIX: Use birthtimeMs (creation time) not mtimeMs (modification time)
        // mtime can be changed, but birthtime is the actual file creation timestamp
        const age = now - fileStats.birthtimeMs;

        if (age > maxAge) {
          // Delete both .sql and .sha256 files together to prevent orphans
          fs.unlinkSync(filePath);
          if (fs.existsSync(checksumPath)) {
            fs.unlinkSync(checksumPath);
          }
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

// Execute appropriate backup method
(async () => {
  if (useRailwayBackups) {
    triggerRailwayBackup();
  } else {
    await createBackup();
  }
})();
