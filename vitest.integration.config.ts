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
      ],
      // CRITICAL: Run integration tests sequentially to prevent database race conditions
      // Integration tests share the same database and can interfere with each other
      // when run in parallel (maxForks > 1). Foreign key violations occur when one
      // test deletes an organization while another test tries to create a team.
      fileParallelism: false, // Run test files one at a time
    },
  })
);