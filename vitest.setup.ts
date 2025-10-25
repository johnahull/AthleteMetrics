import '@testing-library/jest-dom';
import { beforeAll, afterEach, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Setup for all tests
beforeAll(() => {
  // Any global setup can go here
});

// Cleanup after each test
afterEach(() => {
  cleanup();

  // CRITICAL: Clear all timers to prevent memory leaks and hanging tests
  // This clears setInterval, setTimeout, and other timer-based code
  vi.clearAllTimers();
  vi.useRealTimers(); // Restore real timers if fake timers were used
});

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/athletemetrics_test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123456789!';