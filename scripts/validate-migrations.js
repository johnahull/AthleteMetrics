#!/usr/bin/env node

/**
 * Migration Validation Script
 *
 * Validates that migration files are safe before applying them.
 * Checks for dangerous patterns that could cause data loss.
 *
 * Usage:
 *   node scripts/validate-migrations.js
 *
 * Exit codes:
 *   0 - All migrations are safe
 *   1 - Unsafe migrations detected or validation error
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '..');

// Dangerous SQL patterns that indicate potential data loss
const DANGEROUS_PATTERNS = [
  {
    pattern: /DROP\s+TABLE(?!\s+IF\s+EXISTS)/i,
    message: 'Contains DROP TABLE without IF EXISTS - could cause data loss',
    severity: 'ERROR'
  },
  {
    pattern: /DROP\s+DATABASE/i,
    message: 'Contains DROP DATABASE - extremely dangerous',
    severity: 'ERROR'
  },
  {
    pattern: /TRUNCATE\s+TABLE/i,
    message: 'Contains TRUNCATE TABLE - deletes all data',
    severity: 'ERROR'
  },
  {
    pattern: /DELETE\s+FROM\s+[\w.]+(?!\s+(WHERE|USING|RETURNING))\s*(?:;|$)/is,
    message: 'Contains DELETE without WHERE/USING clause - could delete all data',
    severity: 'ERROR'
  },
  {
    pattern: /UPDATE\s+[\w.]+\s+SET\s+(?:(?!WHERE|FROM).)*?(?:;|$)/is,
    message: 'Contains UPDATE without WHERE/FROM clause - will update all rows',
    severity: 'ERROR'
  },
  {
    pattern: /ALTER\s+TABLE.*ALTER\s+COLUMN.*TYPE/i,
    message: 'Column type change may cause data loss or conversion errors',
    severity: 'WARNING'
  },
  {
    pattern: /ALTER\s+TABLE.*ADD\s+COLUMN.*NOT\s+NULL(?!.*DEFAULT)/i,
    message: 'Adding NOT NULL column without DEFAULT will fail on existing data',
    severity: 'ERROR'
  },
  {
    pattern: /DROP\s+COLUMN/i,
    message: 'Contains DROP COLUMN - potential data loss',
    severity: 'WARNING'
  },
  {
    pattern: /DELETE\s+FROM\s+[\w.]+\s+WHERE\s+(1\s*=\s*1|true)/i,
    message: 'Contains DELETE with WHERE 1=1 or WHERE true - functionally deletes all data',
    severity: 'ERROR'
  },
  {
    pattern: /UPDATE\s+[\w.]+\s+SET.*WHERE\s+(1\s*=\s*1|true)/is,
    message: 'Contains UPDATE with WHERE 1=1 or WHERE true - functionally updates all rows',
    severity: 'ERROR'
  },
  {
    pattern: /RENAME\s+(TABLE|COLUMN)/i,
    message: 'Contains RENAME operation - can break application if not coordinated with code changes',
    severity: 'WARNING'
  },
  {
    pattern: /CREATE\s+(UNIQUE\s+)?INDEX(?!\s+CONCURRENTLY)/i,
    message: 'Contains CREATE INDEX without CONCURRENTLY - blocks writes during creation',
    severity: 'WARNING'
  },
  {
    pattern: /DROP\s+INDEX(?!\s+CONCURRENTLY)/i,
    message: 'Contains DROP INDEX without CONCURRENTLY - blocks writes during drop',
    severity: 'WARNING'
  },
  {
    pattern: /DROP\s+CONSTRAINT/i,
    message: 'Contains DROP CONSTRAINT - may allow invalid data if not carefully planned',
    severity: 'WARNING'
  },
  {
    pattern: /ON\s+DELETE\s+CASCADE/i,
    message: 'Contains ON DELETE CASCADE - ensure cascading deletes are intentional',
    severity: 'WARNING'
  },
  {
    pattern: /REINDEX(?!\s+.*CONCURRENTLY)/i,
    message: 'REINDEX without CONCURRENTLY blocks all operations',
    severity: 'ERROR'
  },
  {
    pattern: /LOCK\s+TABLE/i,
    message: 'Explicit table locks can block application queries',
    severity: 'WARNING'
  },
  {
    pattern: /ALTER\s+(?:TABLE|COLUMN).*USING/i,
    message: 'ALTER COLUMN USING rewrites entire table - check table size first',
    severity: 'WARNING'
  },
  {
    pattern: /CLUSTER\s+/i,
    message: 'CLUSTER rewrites entire table with exclusive lock - blocks all access during operation',
    severity: 'ERROR'
  },
  {
    pattern: /VALIDATE\s+CONSTRAINT/i,
    message: 'VALIDATE CONSTRAINT performs full table scan with exclusive lock - can block operations for extended periods',
    severity: 'ERROR'
  },
  {
    pattern: /ALTER\s+TABLE.*DISABLE\s+TRIGGER/i,
    message: 'Disabling triggers bypasses data integrity constraints - extremely dangerous',
    severity: 'ERROR'
  },
  {
    pattern: /GRANT\s+.*\s+TO\s+PUBLIC/i,
    message: 'Granting permissions to PUBLIC creates security vulnerability - anyone can access',
    severity: 'ERROR'
  },
  {
    pattern: /REVOKE/i,
    message: 'Revoking permissions may break application database access',
    severity: 'WARNING'
  },
  {
    pattern: /DROP\s+FUNCTION/i,
    message: 'Contains DROP FUNCTION - may break application code that calls this function',
    severity: 'WARNING'
  },
  {
    pattern: /DROP\s+TRIGGER/i,
    message: 'Contains DROP TRIGGER - may disable critical business logic or audit trails',
    severity: 'WARNING'
  },
  {
    pattern: /ALTER\s+TABLE\s+[\w.]+\s+RENAME\s+TO/i,
    message: 'Contains ALTER TABLE RENAME - CRITICAL: will break all queries referencing old table name',
    severity: 'ERROR'
  }
];

/**
 * Find migrations directory
 */
function findMigrationsDirectory() {
  const possiblePaths = [
    path.join(projectRoot, 'drizzle', 'migrations'),
    path.join(projectRoot, 'migrations')
  ];

  for (const dirPath of possiblePaths) {
    if (fs.existsSync(dirPath)) {
      return dirPath;
    }
  }

  return null;
}

/**
 * Validate a single migration file
 */
function validateMigrationFile(filePath) {
  try {
    let content = fs.readFileSync(filePath, 'utf-8');
    const fileName = path.basename(filePath);
    const issues = [];

    // FIRST: Check raw content (catches patterns in quoted strings/comments)
    // This prevents attackers from hiding dangerous SQL inside string literals
    for (const { pattern, message, severity } of DANGEROUS_PATTERNS) {
      if (pattern.test(content)) {
        issues.push({
          file: fileName,
          severity,
          message: `${message} (in raw content)`,
          type: 'DANGEROUS_PATTERN'
        });
      }
    }

    // THEN: Strip SQL comments and string literals, then check again
    // This catches dangerous SQL that appears in executable code
    // CRITICAL: Must handle PostgreSQL dollar-quoted strings to prevent hiding dangerous SQL
    // Use backreference (\1) to match opening and closing tags
    // Order matters: Remove dollar-quotes first (including nested), then string literals, then comments
    const cleanedContent = content
      .replace(/\$([a-zA-Z0-9_]*)\$[\s\S]*?\$\1\$/g, '')  // Remove dollar-quoted strings (backreference matches same tag)
      .replace(/'(?:''|[^'])*'/g, '')                     // Remove single-quoted strings
      .replace(/--[^\n]*/g, '')                           // Remove line comments
      .replace(/\/\*[\s\S]*?\*\//g, '');                 // Remove block comments

    for (const { pattern, message, severity } of DANGEROUS_PATTERNS) {
      if (pattern.test(cleanedContent)) {
        // Only add if not already detected in raw content
        const alreadyDetected = issues.some(
          issue => issue.message.includes(message) && issue.message.includes('(in raw content)')
        );
        if (!alreadyDetected) {
          issues.push({
            file: fileName,
            severity,
            message: `${message} (outside quotes)`,
            type: 'DANGEROUS_PATTERN'
          });
        }
      }
    }

    return issues;
  } catch (error) {
    console.error(`❌ Error reading migration file ${filePath}: ${error.message}`);
    return [{
      file: path.basename(filePath),
      severity: 'ERROR',
      message: `Failed to read file: ${error.message}`,
      type: 'FILE_ERROR'
    }];
  }
}

/**
 * Main validation function
 */
function validateMigrations() {
  console.log('🔍 Validating database migrations...\n');

  const migrationsDir = findMigrationsDirectory();

  if (!migrationsDir) {
    console.log('ℹ️  No migrations directory found - this is normal for fresh setup');
    console.log('📝 Migrations will be created when you run: npm run db:generate\n');
    return 0;
  }

  console.log(`📁 Migrations directory: ${migrationsDir}\n`);

  let files;
  try {
    files = fs.readdirSync(migrationsDir);
  } catch (error) {
    console.error(`❌ Error reading migrations directory: ${error.message}`);
    return 1;
  }

  const sqlFiles = files.filter(f => f.endsWith('.sql'));

  if (sqlFiles.length === 0) {
    console.log('ℹ️  No migration files found - this is normal for fresh setup');
    console.log('📝 Generate migrations with: npm run db:generate\n');
    return 0;
  }

  console.log(`📊 Found ${sqlFiles.length} migration file(s)\n`);

  let hasErrors = false;
  let hasWarnings = false;

  for (const file of sqlFiles) {
    const filePath = path.join(migrationsDir, file);
    const issues = validateMigrationFile(filePath);

    if (issues.length === 0) {
      console.log(`✅ ${file} - SAFE`);
    } else {
      for (const issue of issues) {
        if (issue.severity === 'ERROR') {
          hasErrors = true;
          console.error(`❌ ${file} - ERROR: ${issue.message}`);
        } else if (issue.severity === 'WARNING') {
          hasWarnings = true;
          console.warn(`⚠️  ${file} - WARNING: ${issue.message}`);
        }
      }
    }
  }

  console.log('');

  if (hasErrors) {
    console.error('❌ Migration validation FAILED');
    console.error('⚠️  CRITICAL: Unsafe migrations detected!');
    console.error('');
    console.error('🛑 DO NOT apply these migrations to production/staging databases');
    console.error('📝 Review the migration files and fix the issues before proceeding');
    console.error('');
    return 1;
  }

  if (hasWarnings) {
    console.warn('⚠️  Migration validation completed with WARNINGS');
    console.warn('');
    console.warn('📝 Review the warnings above and ensure they are intentional');
    console.warn('💾 Make sure you have a database backup before applying migrations');
    console.warn('');
    return 0; // Warnings don't block deployment
  }

  console.log('✅ All migrations are SAFE');
  console.log('');
  return 0;
}

// Handle interrupts
process.on('SIGINT', () => {
  console.log('\n\n⚠️  Validation interrupted by user');
  process.exit(130);
});

process.on('SIGTERM', () => {
  console.log('\n\n⚠️  Validation terminated');
  process.exit(143);
});

// Run validation
const exitCode = validateMigrations();
process.exit(exitCode);
