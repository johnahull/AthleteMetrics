import { defineConfig, mergeConfig } from 'vitest/config';
import baseConfig from './vitest.config';

/**
 * Vitest configuration for UNIT tests only (no database required)
 * Used in PR checks for fast feedback
 */
export default mergeConfig(
  baseConfig,
  defineConfig({
    test: {
      include: [
        // Client-side tests (React components, hooks, utils)
        'client/src/**/__tests__/**/*.{test,spec}.{ts,tsx}',

        // Shared utilities (no DB needed)
        'shared/__tests__/**/*.{test,spec}.{ts,tsx}',

        // Server tests that use mocks (no real DB)
        'server/**/__tests__/**/*.{test,spec}.{ts,tsx}',

        // Specific test directories that don't need DB
        'tests/validation/**/*.{test,spec}.{ts,tsx}',
        'tests/analytics/analytics-service.test.ts', // Uses mocked DB
        'tests/import/csv-parsing.test.ts', // Parsing logic only
        'tests/auth/site-admin.test.ts', // Logic tests
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**',
        '**/MultiLineChart.test.tsx', // TEMPORARILY EXCLUDED - hangs
        '**/analytics-endpoints.test.ts', // TEMPORARILY EXCLUDED - broken

        // Explicitly exclude integration tests (require database)
        'tests/integration/**',
        'tests/migrations/**',
        'tests/migration/**',
        'tests/email/**',
        'tests/security/**',
        'tests/invitation/**',
        'tests/import/import-flow-integration.test.ts',
        'tests/import/import-security.test.ts',
      ],
    },
  })
);
