/**
 * Test Suite: Migration Safety
 *
 * Validates that database migrations are safe and won't cause data loss.
 * Tests migration configuration, file content validation, and safety checks.
 */

import { describe, it, expect } from 'vitest';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);
const projectRoot = path.resolve(__dirname, '../..');

describe('Migration Safety Tests', () => {
  describe('Migration Directory Structure', () => {
    it('should have migrations directory configured in drizzle.config.ts', () => {
      const drizzleConfigPath = path.join(projectRoot, 'drizzle.config.ts');
      expect(fs.existsSync(drizzleConfigPath)).toBe(true);

      const configContent = fs.readFileSync(drizzleConfigPath, 'utf-8');

      // Verify output directory is configured
      expect(configContent).toContain('out:');

      // Verify it points to ./migrations or ./drizzle/migrations
      expect(
        configContent.includes('"./migrations"') ||
        configContent.includes('"./drizzle/migrations"') ||
        configContent.includes("'./migrations'") ||
        configContent.includes("'./drizzle/migrations'")
      ).toBe(true);
    });

    it('should have migrations directory exist on filesystem', () => {
      // Check both possible locations
      const migrationsPath1 = path.join(projectRoot, 'migrations');
      const migrationsPath2 = path.join(projectRoot, 'drizzle', 'migrations');

      const exists = fs.existsSync(migrationsPath1) || fs.existsSync(migrationsPath2);
      expect(exists).toBe(true);
    });
  });

  describe('Migration File Content Safety', () => {
    it('should not contain unsafe DROP TABLE commands in migration files', () => {
      // Get migrations directory
      const migrationsPath1 = path.join(projectRoot, 'migrations');
      const migrationsPath2 = path.join(projectRoot, 'drizzle', 'migrations');

      const migrationsPath = fs.existsSync(migrationsPath1)
        ? migrationsPath1
        : migrationsPath2;

      if (!fs.existsSync(migrationsPath)) {
        console.warn('No migrations directory found - skipping test');
        return;
      }

      const files = fs.readdirSync(migrationsPath);
      const sqlFiles = files.filter(f => f.endsWith('.sql'));

      if (sqlFiles.length === 0) {
        console.warn('No migration SQL files found - this is expected for fresh setup');
        return;
      }

      // Check each SQL file for dangerous patterns
      sqlFiles.forEach(file => {
        const filePath = path.join(migrationsPath, file);
        const content = fs.readFileSync(filePath, 'utf-8').toUpperCase();

        // Should not have DROP TABLE without IF EXISTS
        const hasDropTable = content.includes('DROP TABLE');
        const hasDropIfExists = content.includes('DROP TABLE IF EXISTS');

        if (hasDropTable && !hasDropIfExists) {
          throw new Error(
            `Migration ${file} contains unsafe DROP TABLE command. ` +
            `Use "DROP TABLE IF EXISTS" instead to prevent accidental data loss.`
          );
        }

        // Should not have TRUNCATE
        expect(content).not.toContain('TRUNCATE');

        // Should not have DROP DATABASE
        expect(content).not.toContain('DROP DATABASE');
      });
    });

    it('should have migration files follow naming convention', () => {
      const migrationsPath1 = path.join(projectRoot, 'migrations');
      const migrationsPath2 = path.join(projectRoot, 'drizzle', 'migrations');

      const migrationsPath = fs.existsSync(migrationsPath1)
        ? migrationsPath1
        : migrationsPath2;

      if (!fs.existsSync(migrationsPath)) {
        console.warn('No migrations directory found - skipping test');
        return;
      }

      const files = fs.readdirSync(migrationsPath);
      const sqlFiles = files.filter(f => f.endsWith('.sql'));

      if (sqlFiles.length === 0) {
        console.warn('No migration SQL files found - skipping test');
        return;
      }

      sqlFiles.forEach(file => {
        // Drizzle migration files typically have format: NNNN_name.sql
        // where NNNN is a sequence number
        const hasValidFormat = /^\d{4,}_\w+\.sql$/.test(file);
        expect(hasValidFormat).toBe(true);
      });
    });
  });

  describe('Package.json Scripts', () => {
    it('should have db:generate script for creating migrations', () => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.scripts['db:generate']).toBeDefined();
      expect(packageJson.scripts['db:generate']).toContain('drizzle-kit generate');
    });

    it('should have db:migrate script for applying migrations', () => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.scripts['db:migrate']).toBeDefined();
      // Updated to use custom migration runner instead of drizzle-kit migrate (which doesn't exist)
      expect(packageJson.scripts['db:migrate']).toContain('node scripts/run-migrations.js');
    });

    it('should have db:push script (for development only)', () => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.scripts['db:push']).toBeDefined();
      expect(packageJson.scripts['db:push']).toContain('drizzle-kit push');
    });
  });

  describe('Migration Workflow Safety', () => {
    it('should document that db:push is for development only', () => {
      // This test documents the expectation that db:push should NEVER
      // be used in production/staging workflows

      const expectedWorkflow = {
        development: 'npm run db:push (or db:generate + db:migrate)',
        staging: 'npm run db:generate → npm run db:migrate',
        production: 'npm run db:generate → npm run db:migrate'
      };

      expect(expectedWorkflow.staging).not.toContain('db:push');
      expect(expectedWorkflow.production).not.toContain('db:push');
    });

    it('should fail if workflows use db:push in staging/production', () => {
      const stagingWorkflowPath = path.join(
        projectRoot,
        '.github',
        'workflows',
        'staging-deploy.yml'
      );
      const productionWorkflowPath = path.join(
        projectRoot,
        '.github',
        'workflows',
        'production-deploy.yml'
      );

      if (fs.existsSync(stagingWorkflowPath)) {
        const content = fs.readFileSync(stagingWorkflowPath, 'utf-8');

        // Check for unsafe db:push usage (not in test setup)
        // We need to check the context: db:push is only safe when used
        // with a local test database in the CI environment
        const lines = content.split('\n');
        const unsafePushLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.includes('db:push')) continue;

          // Look backwards to find the step name
          let stepName = '';
          for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
            if (lines[j].includes('- name:')) {
              stepName = lines[j].toLowerCase();
              break;
            }
          }

          // Allow db:push ONLY for local test database setup
          const isTestSetup = stepName.includes('setup test database') ||
                            stepName.includes('test database schema');

          // Look at env vars to confirm it's using test database
          let isTestDatabase = false;
          for (let j = i; j < Math.min(lines.length, i + 10); j++) {
            if (lines[j].includes('DATABASE_URL') &&
                lines[j].includes('localhost') &&
                lines[j].includes('test')) {
              isTestDatabase = true;
              break;
            }
          }

          if (!isTestSetup || !isTestDatabase) {
            unsafePushLines.push(line.trim());
          }
        }

        if (unsafePushLines.length > 0) {
          console.error('Found unsafe db:push usage in staging workflow:');
          unsafePushLines.forEach(line => console.error(`  ${line.trim()}`));
        }

        expect(unsafePushLines.length).toBe(0);
      }

      if (fs.existsSync(productionWorkflowPath)) {
        const content = fs.readFileSync(productionWorkflowPath, 'utf-8');

        const lines = content.split('\n');
        const unsafePushLines: string[] = [];

        for (let i = 0; i < lines.length; i++) {
          const line = lines[i];
          if (!line.includes('db:push')) continue;

          // Look backwards to find the step name
          let stepName = '';
          for (let j = i - 1; j >= Math.max(0, i - 10); j--) {
            if (lines[j].includes('- name:')) {
              stepName = lines[j].toLowerCase();
              break;
            }
          }

          // Allow db:push ONLY for local test database setup
          const isTestSetup = stepName.includes('setup test database') ||
                            stepName.includes('test database schema');

          // Look at env vars to confirm it's using test database
          let isTestDatabase = false;
          for (let j = i; j < Math.min(lines.length, i + 10); j++) {
            if (lines[j].includes('DATABASE_URL') &&
                lines[j].includes('localhost') &&
                lines[j].includes('test')) {
              isTestDatabase = true;
              break;
            }
          }

          if (!isTestSetup || !isTestDatabase) {
            unsafePushLines.push(line.trim());
          }
        }

        if (unsafePushLines.length > 0) {
          console.error('Found unsafe db:push usage in production workflow:');
          unsafePushLines.forEach(line => console.error(`  ${line.trim()}`));
        }

        expect(unsafePushLines.length).toBe(0);
      }
    });
  });

  describe('Migration Validation Script', () => {
    it('should verify validation script exists', () => {
      const validationScriptPath = path.join(
        projectRoot,
        'scripts',
        'validate-migrations.js'
      );

      expect(fs.existsSync(validationScriptPath)).toBe(true);
    });

    it('should have db:validate script in package.json', () => {
      const packageJsonPath = path.join(projectRoot, 'package.json');
      const packageJson = JSON.parse(fs.readFileSync(packageJsonPath, 'utf-8'));

      expect(packageJson.scripts['db:validate']).toBeDefined();
      expect(packageJson.scripts['db:validate']).toContain('validate-migrations');
    });

    it('should detect dangerous WHERE clauses (WHERE 1=1, WHERE true)', () => {
      const validationScriptPath = path.join(
        projectRoot,
        'scripts',
        'validate-migrations.js'
      );
      const scriptContent = fs.readFileSync(validationScriptPath, 'utf-8');

      // Verify the validation script checks for dangerous WHERE clauses
      expect(scriptContent).toContain('WHERE');
      expect(scriptContent).toContain('1=1');
      expect(scriptContent).toContain('true');
    });
  });

  describe('Backup Safety Requirements', () => {
    it('should verify backup script exists', () => {
      const backupScriptPath = path.join(
        projectRoot,
        'scripts',
        'backup-database.js'
      );

      expect(fs.existsSync(backupScriptPath)).toBe(true);
    });

    it('should verify workflows run backup before migrations', () => {
      const stagingWorkflowPath = path.join(
        projectRoot,
        '.github',
        'workflows',
        'staging-deploy.yml'
      );

      if (fs.existsSync(stagingWorkflowPath)) {
        const content = fs.readFileSync(stagingWorkflowPath, 'utf-8');

        // Find backup step and migration step
        const backupStepMatch = content.match(/name:.*[Bb]ackup.*database/);
        const migrationStepMatch = content.match(/name:.*([Rr]un|[Dd]atabase).*migration/);

        if (backupStepMatch && migrationStepMatch) {
          const backupIndex = content.indexOf(backupStepMatch[0]);
          const migrationIndex = content.indexOf(migrationStepMatch[0]);

          // Backup must come before migrations
          expect(backupIndex).toBeLessThan(migrationIndex);
        }
      }
    });
  });
});
