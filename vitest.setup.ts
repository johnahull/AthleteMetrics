import '@testing-library/jest-dom';
import { beforeAll, afterEach, afterAll, vi } from 'vitest';
import { cleanup } from '@testing-library/react';

// Global mock for useAuth to support components using useContextualLabels
// Tests that need specific auth behavior should override this mock
vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    user: null,
    organizationContext: null,
    userOrganizations: [],
    isLoading: false,
    error: null,
    login: vi.fn(),
    logout: vi.fn(),
    setOrganizationContext: vi.fn(),
  }),
  AuthProvider: ({ children }: { children: React.ReactNode }) => children,
}));

// Mock useContextualLabels globally to avoid QueryClient dependency in component tests
// Tests that need to verify actual contextual labels behavior should override this mock
vi.mock('@/hooks/useContextualLabels', () => ({
  useContextualLabels: () => ({
    orgType: null,
    team: 'Team',
    teams: 'Teams',
    coach: 'Coach',
    coaches: 'Coaches',
    athlete: 'Athlete',
    athletes: 'Athletes',
    all: {
      group: { singular: 'Team', plural: 'Teams' },
      coach: { singular: 'Coach', plural: 'Coaches' },
      athlete: { singular: 'Athlete', plural: 'Athletes' },
    },
    isLoading: false,
    error: null,
  }),
  useContextualLabelsFor: (orgType: string | null) => ({
    orgType,
    team: 'Team',
    teams: 'Teams',
    coach: 'Coach',
    coaches: 'Coaches',
    athlete: 'Athlete',
    athletes: 'Athletes',
    all: {
      group: { singular: 'Team', plural: 'Teams' },
      coach: { singular: 'Coach', plural: 'Coaches' },
      athlete: { singular: 'Athlete', plural: 'Athletes' },
    },
    isLoading: false,
    error: null,
  }),
}));

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

  // Clear all mocks to prevent accumulation
  vi.clearAllMocks();
});

// Global cleanup after all tests in a file
afterAll(() => {
  // Reset modules to free memory from cached imports
  vi.resetModules();

  // Force garbage collection if available (requires --expose-gc flag)
  if (global.gc) {
    global.gc();
  }
});

// Mock environment variables for tests
process.env.NODE_ENV = 'test';
process.env.DATABASE_URL = process.env.DATABASE_URL || 'postgresql://localhost:5432/athletemetrics_test';
process.env.SESSION_SECRET = process.env.SESSION_SECRET || 'test-secret';
process.env.ADMIN_USER = process.env.ADMIN_USER || 'admin';
process.env.ADMIN_PASSWORD = process.env.ADMIN_PASSWORD || 'Admin123456789!';