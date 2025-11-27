import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

/**
 * Vitest configuration for INTEGRATION tests (requires database)
 * Used in staging/production deploys with real database connection
 *
 * Note: This config does NOT merge with vitest.config.ts to avoid exclude conflicts
 */
export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom',
    setupFiles: ['./tests/setup/integration-setup.ts'],
    hookTimeout: 30000,
    testTimeout: 10000,
    clearMocks: true,
    mockReset: false,
    restoreMocks: false,
    unstubGlobals: true,
    unstubEnvs: true,
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: false,
        maxForks: 2,
        execArgv: [
          '--expose-gc',
          '--max-old-space-size=2048',
        ],
      },
    },
    isolate: true,
    maxConcurrency: 3,
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
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/MultiLineChart.test.tsx',
      'tests/e2e/**', // Exclude E2E tests (run with playwright)
    ],
    // CRITICAL: Run integration tests sequentially to prevent database race conditions
    // Integration tests share the same database and can interfere with each other
    // when run in parallel (maxForks > 1). Foreign key violations occur when one
    // test deletes an organization while another test tries to create a team.
    fileParallelism: false, // Run test files one at a time
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './packages/web/src'),
      '@shared': path.resolve(__dirname, './packages/shared'),
      '@server': path.resolve(__dirname, './packages/api'),
      'redis': path.resolve(__dirname, './tests/mocks/redis-mock.ts'),
      'connect-redis': path.resolve(__dirname, './tests/mocks/connect-redis-mock.ts'),
    },
  },
});