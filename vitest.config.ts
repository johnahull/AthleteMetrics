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

    // Memory optimization settings
    pool: 'forks', // Use process forks instead of threads for better memory isolation
    poolOptions: {
      forks: {
        singleFork: false, // Enable parallel test execution for better performance
        maxForks: 3, // Limit to 3 concurrent forks for memory control (~800MB each)
      },
    },
    isolate: true, // Isolate tests between files for better cleanup
    maxConcurrency: 5, // Limit concurrent test execution
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