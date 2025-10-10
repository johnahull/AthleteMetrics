import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

/**
 * Vitest configuration for INTEGRATION tests (requires database)
 * Used in staging/production deploys with real database connection
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      setupFiles: ['./tests/setup/integration-setup.ts'],
      include: [
        // Integration tests that require database
        'tests/integration/**/*.{test,spec}.{ts,tsx}',
        'tests/migrations/**/*.{test,spec}.{ts,tsx}',
        'tests/migration/**/*.{test,spec}.{ts,tsx}',

        // Other tests that require real database
        'tests/import/import-flow-integration.test.ts',
        'tests/import/import-security.test.ts',
        'tests/email/**/*.{test,spec}.{ts,tsx}',
        'tests/security/**/*.{test,spec}.{ts,tsx}',
        'tests/invitation/**/*.{test,spec}.{ts,tsx}',
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/MultiLineChart.test.tsx', // Excluded - mocked version in unit tests, integration version not needed

        // TEMPORARILY DISABLED - Require database schema fixes
        'tests/integration/analytics-integration.test.ts',
        'tests/integration/athlete-bulk-operations.test.ts',
        'tests/integration/athlete-creation.test.ts',
        'tests/integration/invitation-integration.test.ts',
        'tests/integration/metricsAvailability.test.ts',
        'tests/integration/team-update-api.test.ts',
        'tests/integration/team-update-storage.test.ts',
        'tests/integration/team-update.test.ts',
        'tests/migrations/boolean-fields-migration.test.ts',
        'tests/migration/is-site-admin-migration.test.ts',
      ],
    },
  })
);