import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom', // Switched from jsdom - 2-3x less memory usage
    setupFiles: ['./vitest.setup.ts'], // Unit tests don't need database validation
    hookTimeout: 30000, // Increase hook timeout to 30 seconds for cleanup operations
    testTimeout: 10000, // Reduce test timeout to 10 seconds (30s was too high, may mask slow tests)

    // CRITICAL: Automatic cleanup to prevent memory leaks
    clearMocks: true, // Clear all mocks after each test
    mockReset: false, // DISABLED: Breaks Express app mocks used by supertest
    restoreMocks: false, // DISABLED: Breaks Express app.address() in integration tests
    unstubGlobals: true, // Restore global stubs after each test
    unstubEnvs: true, // Restore environment variables after each test

    // Memory optimization strategy:
    // - 2GB heap per fork (reduced from 4GB to detect leaks earlier)
    // - 10s test timeout (catches slow tests)
    // - 30s hook timeout (allows cleanup operations)
    // - maxForks=2 (reduced from 3: 2 × ~800MB = ~1.6GB under 2GB heap)
    // - happy-dom environment (2-3x memory reduction vs jsdom)
    // - isolate: true (prevents leak propagation between test files)
    // - execArgv with gc flags to help Node release memory faster
    pool: 'forks', // Use process forks instead of threads for better memory isolation
    poolOptions: {
      forks: {
        singleFork: false, // Enable parallel test execution for better performance
        maxForks: 2, // Limit to 2 concurrent forks for memory control (~800MB each)
        execArgv: [
          '--expose-gc', // Allow manual garbage collection in tests if needed
          '--max-old-space-size=2048', // 2GB per fork (overrides package.json for individual workers)
        ],
      },
    },
    isolate: true, // Isolate tests between files for better cleanup
    maxConcurrency: 3, // Reduced from 5 to limit concurrent test execution

    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      // Exclude Playwright E2E tests (run with playwright, not vitest)
      'tests/e2e/**',
      // Exclude integration tests by default (need database)
      'tests/integration/**',
    ],

  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './packages/web/src'),
      '@shared': path.resolve(__dirname, './packages/shared'),
      '@server': path.resolve(__dirname, './packages/api'),
      // Mock redis and connect-redis as optional dependencies
      'redis': path.resolve(__dirname, './tests/mocks/redis-mock.ts'),
      'connect-redis': path.resolve(__dirname, './tests/mocks/connect-redis-mock.ts'),
    },
  },
});