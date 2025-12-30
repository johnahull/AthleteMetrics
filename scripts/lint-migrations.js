#!/usr/bin/env node

/**
 * Migration Idempotency Linter
 *
 * Scans migration files for non-idempotent patterns that could cause
 * errors when migrations are re-run.
 *
 * Usage:
 *   node scripts/lint-migrations.js [--fix] [migration-file]
 *
 * Options:
 *   --fix        Show suggested fixes (does not auto-apply)
 *   [file]       Lint specific file instead of all migrations
 *
 * Exit codes:
 *   0 - No issues found
 *   1 - Issues found
 *   2 - Script error
 */

import { readFileSync, readdirSync } from 'fs';
import { join, dirname, basename } from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// ANSI colors for terminal output
const colors = {
  red: '\x1b[31m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  cyan: '\x1b[36m',
  reset: '\x1b[0m',
  bold: '\x1b[1m',
  dim: '\x1b[2m'
};

// Non-idempotent patterns to detect
const LINT_RULES = [
  {
    id: 'create-table-no-if-not-exists',
    severity: 'error',
    pattern: /^\s*CREATE\s+TABLE\s+(?!IF\s+NOT\s+EXISTS\b)(\w+)/gim,
    message: 'CREATE TABLE without IF NOT EXISTS',
    suggestion: (match) => `CREATE TABLE IF NOT EXISTS ${match[1]}`
  },
  {
    id: 'create-index-no-if-not-exists',
    severity: 'error',
    pattern: /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+(?!CONCURRENTLY\s+)(?!IF\s+NOT\s+EXISTS\b)(\w+)/gim,
    message: 'CREATE INDEX without IF NOT EXISTS',
    suggestion: (match) => `CREATE ${match[1] || ''}INDEX IF NOT EXISTS ${match[2]}`
  },
  {
    id: 'create-index-concurrently-no-if-not-exists',
    severity: 'error',
    pattern: /^\s*CREATE\s+(UNIQUE\s+)?INDEX\s+CONCURRENTLY\s+(?!IF\s+NOT\s+EXISTS\b)(\w+)/gim,
    message: 'CREATE INDEX CONCURRENTLY without IF NOT EXISTS',
    suggestion: (match) => `CREATE ${match[1] || ''}INDEX CONCURRENTLY IF NOT EXISTS ${match[2]}`
  },
  {
    id: 'add-column-no-if-not-exists',
    severity: 'error',
    // Match ADD COLUMN without IF NOT EXISTS - improved regex to properly handle optional COLUMN keyword
    pattern: /ALTER\s+TABLE\s+(\w+)\s+ADD\s+COLUMN\s+(?!IF\s+NOT\s+EXISTS\b)(\w+)/gim,
    message: 'ADD COLUMN without IF NOT EXISTS',
    suggestion: (match) => `ALTER TABLE ${match[1]} ADD COLUMN IF NOT EXISTS ${match[2]}`,
    // Skip if inside a DO $$ block (idempotent via IF NOT EXISTS check)
    contextCheck: (content, matchIndex) => {
      const before = content.substring(0, matchIndex);
      const doBlocks = before.match(/DO\s+\$\$/gi) || [];
      const endBlocks = before.match(/END\s+\$\$/gi) || [];
      return doBlocks.length <= endBlocks.length; // Only flag if NOT inside DO block
    }
  },
  {
    id: 'add-constraint-not-wrapped',
    severity: 'warning',
    pattern: /^\s*ALTER\s+TABLE\s+(\w+)\s+ADD\s+CONSTRAINT\s+(\w+)/gim,
    message: 'ADD CONSTRAINT should be wrapped in DO $$ block for idempotency',
    suggestion: (match) => `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_constraint WHERE conname = '${match[2]}') THEN ... END IF; END $$;`,
    // Skip if inside a DO $$ block OR preceded by DROP CONSTRAINT IF EXISTS
    contextCheck: (content, matchIndex) => {
      // Check if this is inside a DO $$ block
      const before = content.substring(0, matchIndex);
      const doBlocks = before.match(/DO\s+\$\$/gi) || [];
      const endBlocks = before.match(/END\s+\$\$/gi) || [];
      const inDoBlock = doBlocks.length > endBlocks.length;
      if (inDoBlock) return false; // Skip - already idempotent via DO block

      // Check if preceded by DROP CONSTRAINT IF EXISTS for the same constraint
      // Look for pattern like: DROP CONSTRAINT IF EXISTS constraint_name; followed by ADD CONSTRAINT constraint_name
      const statement = getStatementContext(content, matchIndex);
      // Find the constraint name in the ADD CONSTRAINT statement
      const addMatch = statement.match(/ADD\s+CONSTRAINT\s+(\w+)/i);
      if (addMatch) {
        const constraintName = addMatch[1];
        // Look in the 2000 chars before for DROP CONSTRAINT IF EXISTS with same name
        // (increased from 500 to handle migrations where DROPs are grouped before ADDs)
        const lookback = content.substring(Math.max(0, matchIndex - 2000), matchIndex);
        const dropPattern = new RegExp(`DROP\\s+CONSTRAINT\\s+IF\\s+EXISTS\\s+${constraintName}`, 'i');
        if (dropPattern.test(lookback)) {
          return false; // Skip - idempotent via DROP IF EXISTS before ADD
        }
      }

      return true; // Flag it - not idempotent
    }
  },
  {
    id: 'insert-no-conflict-handling',
    severity: 'warning',
    // Match INSERT INTO - we'll check for ON CONFLICT in the statement context
    pattern: /^\s*INSERT\s+INTO\s+(\w+)\s*\([^)]+\)\s*VALUES/gim,
    message: 'INSERT without ON CONFLICT or WHERE NOT EXISTS',
    suggestion: (match) => `INSERT INTO ${match[1]} (...) VALUES (...) ON CONFLICT (...) DO NOTHING`,
    // Skip if statement includes ON CONFLICT, WHERE NOT EXISTS, or is a SELECT (CTE)
    contextCheck: (content, matchIndex) => {
      const statement = getStatementContext(content, matchIndex);
      return !statement.includes('ON CONFLICT') &&
             !statement.includes('WHERE NOT EXISTS') &&
             !statement.includes('SELECT');
    }
  },
  {
    id: 'alter-type-add-value-not-wrapped',
    severity: 'error',
    pattern: /^\s*ALTER\s+TYPE\s+\w+\s+ADD\s+VALUE\s+/gim,
    message: 'ALTER TYPE ADD VALUE should be wrapped in DO $$ block for idempotency',
    suggestion: () => `DO $$ BEGIN IF NOT EXISTS (SELECT 1 FROM pg_enum WHERE enumlabel = 'value' AND enumtypid = 'type'::regtype) THEN ALTER TYPE ... ADD VALUE ...; END IF; END $$;`,
    contextCheck: (content, matchIndex) => {
      const before = content.substring(0, matchIndex);
      const doBlocks = before.match(/DO\s+\$\$/gi) || [];
      const endBlocks = before.match(/END\s+\$\$/gi) || [];
      return doBlocks.length <= endBlocks.length;
    }
  },
  {
    id: 'drop-table-no-if-exists',
    severity: 'warning',
    pattern: /^\s*DROP\s+TABLE\s+(?!IF\s+EXISTS\b)(\w+)/gim,
    message: 'DROP TABLE without IF EXISTS',
    suggestion: (match) => `DROP TABLE IF EXISTS ${match[1]}`
  },
  {
    id: 'drop-index-no-if-exists',
    severity: 'warning',
    // Match DROP INDEX without IF EXISTS
    // Use contextCheck to handle CONCURRENTLY and IF EXISTS properly
    pattern: /^\s*DROP\s+INDEX\s+/gim,
    message: 'DROP INDEX without IF EXISTS',
    suggestion: () => `DROP INDEX IF EXISTS <name>`,
    contextCheck: (content, matchIndex) => {
      const statement = getStatementContext(content, matchIndex);
      // Skip if statement includes IF EXISTS
      return !statement.includes('IF EXISTS');
    }
  }
];

/**
 * Get the statement context around a match
 */
function getStatementContext(content, matchIndex) {
  // Find the start of the statement (previous semicolon or start of file)
  let start = content.lastIndexOf(';', matchIndex);
  start = start === -1 ? 0 : start + 1;

  // Find the end of the statement (next semicolon or end of file)
  let end = content.indexOf(';', matchIndex);
  end = end === -1 ? content.length : end;

  return content.substring(start, end);
}

/**
 * Lint a single migration file
 */
function lintFile(filePath, showFix = false) {
  const content = readFileSync(filePath, 'utf8');
  const fileName = basename(filePath);
  const issues = [];

  for (const rule of LINT_RULES) {
    let match;
    const pattern = new RegExp(rule.pattern.source, rule.pattern.flags);

    while ((match = pattern.exec(content)) !== null) {
      // Check context if rule has contextCheck
      if (rule.contextCheck && !rule.contextCheck(content, match.index)) {
        continue;
      }

      // Calculate line number
      const lineNumber = content.substring(0, match.index).split('\n').length;

      issues.push({
        rule: rule.id,
        severity: rule.severity,
        message: rule.message,
        line: lineNumber,
        match: match[0].trim().substring(0, 60),
        suggestion: showFix && rule.suggestion ? rule.suggestion(match) : null
      });
    }
  }

  return { fileName, filePath, issues };
}

/**
 * Get all migration files
 */
function getMigrationFiles() {
  const migrationsDir = join(__dirname, '..', 'migrations');
  const files = readdirSync(migrationsDir);

  return files
    .filter(file => file.endsWith('.sql') && !file.endsWith('_down.sql'))
    .map(file => join(migrationsDir, file))
    .sort();
}

/**
 * Print results
 */
function printResults(results, showFix) {
  let totalErrors = 0;
  let totalWarnings = 0;
  let filesWithIssues = 0;

  for (const result of results) {
    if (result.issues.length === 0) continue;

    filesWithIssues++;
    console.log(`\n${colors.bold}${result.fileName}${colors.reset}`);

    for (const issue of result.issues) {
      const severityColor = issue.severity === 'error' ? colors.red : colors.yellow;
      const severityLabel = issue.severity === 'error' ? 'error' : 'warn';

      if (issue.severity === 'error') totalErrors++;
      else totalWarnings++;

      console.log(
        `  ${colors.dim}${issue.line}:${colors.reset} ` +
        `${severityColor}${severityLabel}${colors.reset} ` +
        `${issue.message}`
      );
      console.log(`     ${colors.dim}${issue.match}...${colors.reset}`);

      if (issue.suggestion) {
        console.log(`     ${colors.cyan}Fix: ${issue.suggestion}${colors.reset}`);
      }
    }
  }

  // Summary
  console.log('\n' + '─'.repeat(60));

  if (totalErrors === 0 && totalWarnings === 0) {
    console.log(`${colors.green}✓ All migrations are idempotent${colors.reset}`);
    return 0;
  }

  const summary = [];
  if (totalErrors > 0) {
    summary.push(`${colors.red}${totalErrors} error(s)${colors.reset}`);
  }
  if (totalWarnings > 0) {
    summary.push(`${colors.yellow}${totalWarnings} warning(s)${colors.reset}`);
  }

  console.log(
    `Found ${summary.join(', ')} in ${filesWithIssues} file(s)\n`
  );

  if (totalErrors > 0) {
    console.log(`${colors.red}✗ Fix errors before committing${colors.reset}`);
    console.log(`  See docs/MIGRATION_IDEMPOTENCY.md for patterns\n`);
    return 1;
  }

  console.log(`${colors.yellow}⚠ Consider fixing warnings for better idempotency${colors.reset}\n`);
  return 0;
}

/**
 * Main entry point
 */
function main() {
  const args = process.argv.slice(2);
  const showFix = args.includes('--fix');
  const fileArg = args.find(arg => !arg.startsWith('--'));

  console.log(`${colors.bold}Migration Idempotency Linter${colors.reset}`);
  console.log('─'.repeat(60));

  let files;
  if (fileArg) {
    // Lint specific file
    const filePath = fileArg.startsWith('/') ? fileArg : join(process.cwd(), fileArg);
    files = [filePath];
    console.log(`Linting: ${fileArg}`);
  } else {
    // Lint all migrations
    files = getMigrationFiles();
    console.log(`Linting ${files.length} migration files...`);
  }

  const results = files.map(file => lintFile(file, showFix));
  const exitCode = printResults(results, showFix);

  process.exit(exitCode);
}

main();
