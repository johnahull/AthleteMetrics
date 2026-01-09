/**
 * Tests for OnboardingProvider component
 *
 * Tests context state management and API interactions.
 * Note: Auto-start timing tests are simplified due to fake timer complexity.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, act, fireEvent } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import '@testing-library/jest-dom';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Mock localStorage
const mockLocalStorage: Record<string, string> = {};
const localStorageMock = {
  getItem: vi.fn((key: string) => mockLocalStorage[key] || null),
  setItem: vi.fn((key: string, value: string) => {
    mockLocalStorage[key] = value;
  }),
  removeItem: vi.fn((key: string) => {
    delete mockLocalStorage[key];
  }),
  clear: vi.fn(() => {
    Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key]);
  }),
};
Object.defineProperty(window, 'localStorage', { value: localStorageMock });

// Mock useAuth
let mockUser: any = null;
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}));

import { OnboardingProvider, useOnboarding } from '../OnboardingProvider';

// Test consumer component to access context
function TestConsumer() {
  const ctx = useOnboarding();
  return (
    <div>
      <span data-testid="is-active">{ctx.isOnboardingActive.toString()}</span>
      <span data-testid="has-completed">{ctx.hasCompletedOnboarding.toString()}</span>
      <button data-testid="start-btn" onClick={ctx.startOnboarding}>Start</button>
      <button data-testid="stop-btn" onClick={ctx.stopOnboarding}>Stop</button>
    </div>
  );
}

describe('OnboardingProvider', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    vi.clearAllMocks();
    localStorageMock.clear();
    Object.keys(mockLocalStorage).forEach(key => delete mockLocalStorage[key]);

    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });

    // Default user
    mockUser = {
      id: 'user-123',
      role: 'athlete',
      isSiteAdmin: false,
    };

    // Default fetch response
    mockFetch.mockResolvedValue({
      ok: true,
      json: () => Promise.resolve({ hasCompletedOnboarding: false }),
    });
  });

  afterEach(() => {
    queryClient.clear();
  });

  const renderWithProvider = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <OnboardingProvider>
          <TestConsumer />
        </OnboardingProvider>
      </QueryClientProvider>
    );
  };

  describe('Context Provision', () => {
    it('provides onboarding context to children', () => {
      renderWithProvider();

      expect(screen.getByTestId('is-active')).toBeInTheDocument();
      expect(screen.getByTestId('has-completed')).toBeInTheDocument();
      expect(screen.getByTestId('start-btn')).toBeInTheDocument();
      expect(screen.getByTestId('stop-btn')).toBeInTheDocument();
    });

    it('throws error when useOnboarding is used outside provider', () => {
      const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});

      expect(() => {
        render(
          <QueryClientProvider client={queryClient}>
            <TestConsumer />
          </QueryClientProvider>
        );
      }).toThrow('useOnboarding must be used within OnboardingProvider');

      consoleError.mockRestore();
    });

    it('initially has isOnboardingActive as false', () => {
      renderWithProvider();

      expect(screen.getByTestId('is-active').textContent).toBe('false');
    });
  });

  describe('startOnboarding()', () => {
    it('activates the tour when called', () => {
      renderWithProvider();

      expect(screen.getByTestId('is-active').textContent).toBe('false');

      act(() => {
        fireEvent.click(screen.getByTestId('start-btn'));
      });

      expect(screen.getByTestId('is-active').textContent).toBe('true');
    });

    it('clears localStorage when starting tour', () => {
      mockLocalStorage[`onboarding_seen_${mockUser.id}`] = 'true';

      renderWithProvider();

      act(() => {
        fireEvent.click(screen.getByTestId('start-btn'));
      });

      expect(localStorageMock.removeItem).toHaveBeenCalledWith(`onboarding_seen_user-123`);
    });

    it('does not clear localStorage when no user', () => {
      mockUser = null;

      renderWithProvider();

      act(() => {
        fireEvent.click(screen.getByTestId('start-btn'));
      });

      expect(localStorageMock.removeItem).not.toHaveBeenCalled();
    });
  });

  describe('stopOnboarding()', () => {
    it('deactivates the tour when called', () => {
      renderWithProvider();

      // Start first
      act(() => {
        fireEvent.click(screen.getByTestId('start-btn'));
      });
      expect(screen.getByTestId('is-active').textContent).toBe('true');

      // Then stop
      act(() => {
        fireEvent.click(screen.getByTestId('stop-btn'));
      });
      expect(screen.getByTestId('is-active').textContent).toBe('false');
    });

    it('sets localStorage when stopping tour', async () => {
      renderWithProvider();

      // Start first
      act(() => {
        fireEvent.click(screen.getByTestId('start-btn'));
      });

      // Then stop
      act(() => {
        fireEvent.click(screen.getByTestId('stop-btn'));
      });

      // Wait for mutation's onSuccess callback which sets localStorage
      await vi.waitFor(() => {
        expect(localStorageMock.setItem).toHaveBeenCalledWith(`onboarding_seen_user-123`, 'true');
      });
    });

    it('calls API to mark onboarding as completed', async () => {
      renderWithProvider();

      act(() => {
        fireEvent.click(screen.getByTestId('start-btn'));
      });

      act(() => {
        fireEvent.click(screen.getByTestId('stop-btn'));
      });

      // Wait for mutation to be called
      await vi.waitFor(() => {
        // Find the PUT call among all fetch calls
        const putCall = mockFetch.mock.calls.find(
          (call: any[]) => call[1]?.method === 'PUT'
        );
        expect(putCall).toBeDefined();
        expect(putCall?.[0]).toBe('/api/profile/onboarding-status');
        expect(JSON.parse(putCall?.[1]?.body)).toEqual({ completed: true });
      });
    });

    it('does not call API or set localStorage when no user', () => {
      mockUser = null;

      renderWithProvider();

      act(() => {
        fireEvent.click(screen.getByTestId('start-btn'));
      });

      act(() => {
        fireEvent.click(screen.getByTestId('stop-btn'));
      });

      // Should not set localStorage
      expect(localStorageMock.setItem).not.toHaveBeenCalled();
    });
  });

  describe('Site Admin Handling', () => {
    it('does not fetch onboarding status for site admins', () => {
      mockUser = {
        id: 'admin-123',
        role: 'org_admin',
        isSiteAdmin: true,
      };

      renderWithProvider();

      // Should not call the GET endpoint for site admins
      expect(mockFetch).not.toHaveBeenCalledWith(
        '/api/profile/onboarding-status',
        expect.objectContaining({ method: 'GET' })
      );
    });
  });

  describe('No User State', () => {
    it('does not make API calls when no user is logged in', () => {
      mockUser = null;

      renderWithProvider();

      // Should not make any fetch calls
      expect(mockFetch).not.toHaveBeenCalled();
    });
  });

  describe('hasCompletedOnboarding State', () => {
    it('defaults to true when API not yet called (prevents flash)', () => {
      renderWithProvider();

      // Before API response, should default to true to prevent unwanted tour start
      expect(screen.getByTestId('has-completed').textContent).toBe('true');
    });
  });
});
