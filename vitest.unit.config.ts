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
        'packages/web/src/**/__tests__/**/*.{test,spec}.{ts,tsx}',

        // Shared utilities (no DB needed)
        'packages/shared/__tests__/**/*.{test,spec}.{ts,tsx}',

        // Server tests that use mocks (no real DB)
        'packages/api/**/__tests__/**/*.{test,spec}.{ts,tsx}',

        // Specific test directories that don't need DB
        'tests/validation/**/*.{test,spec}.{ts,tsx}',
        'tests/analytics/**/*.{test,spec}.{ts,tsx}', // Analytics tests
        'tests/server/**/*.{test,spec}.{ts,tsx}', // Server unit tests (startup, error handling, etc.)
        'tests/import/csv-parsing.test.ts', // Parsing logic only
        'tests/auth/site-admin.test.ts', // Logic tests
      ],
      exclude: [
        '**/node_modules/**',
        '**/dist/**',
        '**/.{idea,git,cache,output,temp}/**',

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
