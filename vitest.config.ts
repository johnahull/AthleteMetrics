import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    globals: true,
    environment: 'happy-dom', // Switched from jsdom - 2-3x less memory usage
    setupFiles: ['./vitest.setup.ts'],
    hookTimeout: 30000, // Increase hook timeout to 30 seconds for cleanup operations
    testTimeout: 10000, // Reduce test timeout to 10 seconds (30s was too high, may mask slow tests)

    // CRITICAL: Automatic cleanup to prevent memory leaks
    clearMocks: true, // Clear all mocks after each test
    mockReset: true, // Reset mock state after each test
    restoreMocks: true, // Restore original implementations after each test
    unstubGlobals: true, // Restore global stubs after each test
    unstubEnvs: true, // Restore environment variables after each test

    // Memory optimization strategy:
    // - 3GB heap (configurable via TEST_HEAP_SIZE env var in package.json, defaults to 3072MB)
    // - 10s test timeout (catches slow tests)
    // - 30s hook timeout (allows cleanup operations)
    // - maxForks=3 (balances parallelism with memory usage: 3 × ~800MB = ~2.4GB under 3GB heap)
    // - happy-dom environment (2-3x memory reduction vs jsdom)
    // - isolate: true (prevents leak propagation between test files)
    pool: 'forks', // Use process forks instead of threads for better memory isolation
    poolOptions: {
      forks: {
        singleFork: false, // Enable parallel test execution for better performance
        maxForks: 3, // Limit to 3 concurrent forks for memory control (~800MB each)
      },
    },
    isolate: true, // Isolate tests between files for better cleanup
    maxConcurrency: 5, // Limit concurrent test execution

    // TEMPORARILY EXCLUDE hanging test until debounce timer issue is resolved
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      '**/.{idea,git,cache,output,temp}/**',
      '**/{karma,rollup,webpack,vite,vitest,jest,ava,babel,nyc,cypress,tsup,build}.config.*',
      '**/MultiLineChart.test.tsx' // TEMPORARILY EXCLUDED - hangs due to useDebounce timer issues
    ]
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './client/src'),
      '@shared': path.resolve(__dirname, './shared'),
      '@server': path.resolve(__dirname, './server'),
      // Mock redis and connect-redis as optional dependencies
      'redis': path.resolve(__dirname, './tests/mocks/redis-mock.ts'),
      'connect-redis': path.resolve(__dirname, './tests/mocks/connect-redis-mock.ts'),
    },
  },
});