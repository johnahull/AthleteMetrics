/**
 * Unit Tests for PendingTasksBanner Component
 *
 * Tests verify:
 * - Dismiss button functionality
 * - 24-hour localStorage snooze
 * - Banner reappears after snooze expires
 * - Banner reappears when new requests arrive
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PendingTasksBanner } from '../PendingTasksBanner';
import * as authModule from '@/lib/auth';

// Mock the auth hook
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(),
}));

// Mock Link component from wouter
vi.mock('wouter', () => ({
  Link: ({ children, href }: any) => <a href={href}>{children}</a>,
}));

const mockUser = {
  id: 'test-user-123',
  username: 'testathlete',
  email: 'test@athlete.com',
  firstName: 'Test',
  lastName: 'Athlete',
  fullName: 'Test Athlete',
  role: 'athlete' as const,
  isSiteAdmin: false,
};

const mockRequests = [
  {
    id: 'request-1',
    organizationId: 'org-1',
    templateId: 'template-1',
    requestedBy: 'coach-1',
    distributionMethod: 'athlete_account' as const,
    targetAthleteIds: ['test-user-123'],
    targetTeamIds: [],
    status: 'active' as const,
    requiresAuth: true,
    createdAt: new Date().toISOString(),
  },
  {
    id: 'request-2',
    organizationId: 'org-1',
    templateId: 'template-1',
    requestedBy: 'coach-1',
    distributionMethod: 'athlete_account' as const,
    targetAthleteIds: ['test-user-123'],
    targetTeamIds: [],
    status: 'active' as const,
    requiresAuth: true,
    createdAt: new Date().toISOString(),
  },
];

// Local storage key helper
const DISMISS_KEY = 'wellness-tasks-dismissed';

describe('PendingTasksBanner', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
      },
    });

    // Mock useAuth to return test user
    vi.mocked(authModule.useAuth).mockReturnValue({
      user: mockUser,
      login: vi.fn(),
      logout: vi.fn(),
      isLoading: false,
      organizationContext: null,
      userOrganizations: null,
      setOrganizationContext: vi.fn(),
      impersonationStatus: null,
      startImpersonation: vi.fn(),
      stopImpersonation: vi.fn(),
      checkImpersonationStatus: vi.fn(),
    });

    // Clear localStorage before each test
    localStorage.clear();

    // Mock fetch
    global.fetch = vi.fn();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it('should render banner with pending count and complete button', async () => {
    // Mock fetch to return pending requests
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRequests,
    } as Response);

    render(
      <QueryClientProvider client={queryClient}>
        <PendingTasksBanner />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('pending-tasks-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/You have 2 wellness questionnaires to complete/i)).toBeInTheDocument();
    expect(screen.getByText(/Complete Now/i)).toBeInTheDocument();
  });

  it('should hide banner when dismiss button is clicked', async () => {
    // Mock fetch to return pending requests
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRequests,
    } as Response);

    const user = userEvent.setup();

    render(
      <QueryClientProvider client={queryClient}>
        <PendingTasksBanner />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('pending-tasks-banner')).toBeInTheDocument();
    });

    // Click dismiss button
    const dismissButton = screen.getByTestId('dismiss-banner');
    await user.click(dismissButton);

    // Banner should be hidden
    await waitFor(() => {
      expect(screen.queryByTestId('pending-tasks-banner')).not.toBeInTheDocument();
    });
  });

  it('should store dismiss timestamp in localStorage for 24 hours', async () => {
    // Mock fetch
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRequests,
    } as Response);

    const user = userEvent.setup();
    const nowTimestamp = Date.now();
    vi.spyOn(Date, 'now').mockReturnValue(nowTimestamp);

    render(
      <QueryClientProvider client={queryClient}>
        <PendingTasksBanner />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('pending-tasks-banner')).toBeInTheDocument();
    });

    // Click dismiss
    const dismissButton = screen.getByTestId('dismiss-banner');
    await user.click(dismissButton);

    // Check localStorage
    const dismissData = JSON.parse(localStorage.getItem(DISMISS_KEY) || '{}');
    expect(dismissData.dismissedAt).toBe(nowTimestamp);
    expect(dismissData.requestIds).toEqual(['request-1', 'request-2']);

    vi.restoreAllMocks();
  });

  it('should stay hidden for 24 hours after dismiss', async () => {
    const nowTimestamp = Date.now();
    const twoHoursAgo = nowTimestamp - (2 * 60 * 60 * 1000);

    // Set localStorage to show banner was dismissed 2 hours ago
    localStorage.setItem(DISMISS_KEY, JSON.stringify({
      dismissedAt: twoHoursAgo,
      requestIds: ['request-1', 'request-2'],
    }));

    // Mock fetch
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRequests,
    } as Response);

    render(
      <QueryClientProvider client={queryClient}>
        <PendingTasksBanner />
      </QueryClientProvider>
    );

    // Banner should still be hidden (within 24 hours)
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('pending-tasks-banner')).not.toBeInTheDocument();
  });

  it('should reappear after 24 hours', async () => {
    const nowTimestamp = Date.now();
    const twentyFiveHoursAgo = nowTimestamp - (25 * 60 * 60 * 1000);

    // Set localStorage to show banner was dismissed 25 hours ago
    localStorage.setItem(DISMISS_KEY, JSON.stringify({
      dismissedAt: twentyFiveHoursAgo,
      requestIds: ['request-1', 'request-2'],
    }));

    // Mock fetch
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRequests,
    } as Response);

    render(
      <QueryClientProvider client={queryClient}>
        <PendingTasksBanner />
      </QueryClientProvider>
    );

    // Banner should reappear (>24 hours passed)
    await waitFor(() => {
      expect(screen.getByTestId('pending-tasks-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/You have 2 wellness questionnaires to complete/i)).toBeInTheDocument();
  });

  it('should reappear when new requests arrive (even within 24h)', async () => {
    const nowTimestamp = Date.now();
    const twoHoursAgo = nowTimestamp - (2 * 60 * 60 * 1000);

    // Set localStorage to show banner was dismissed 2 hours ago with only 1 request
    localStorage.setItem(DISMISS_KEY, JSON.stringify({
      dismissedAt: twoHoursAgo,
      requestIds: ['request-1'], // Only request-1 was dismissed
    }));

    // Mock fetch to return 2 requests (new request-2 added)
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => mockRequests,
    } as Response);

    render(
      <QueryClientProvider client={queryClient}>
        <PendingTasksBanner />
      </QueryClientProvider>
    );

    // Banner should reappear because request-2 is new
    await waitFor(() => {
      expect(screen.getByTestId('pending-tasks-banner')).toBeInTheDocument();
    });

    expect(screen.getByText(/You have 2 wellness questionnaires to complete/i)).toBeInTheDocument();
  });

  it('should not render when no pending requests', async () => {
    // Mock fetch to return empty array
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [],
    } as Response);

    render(
      <QueryClientProvider client={queryClient}>
        <PendingTasksBanner />
      </QueryClientProvider>
    );

    // Banner should not render
    await waitFor(() => {
      expect(fetch).toHaveBeenCalled();
    });

    expect(screen.queryByTestId('pending-tasks-banner')).not.toBeInTheDocument();
  });

  it('should handle plural/singular correctly', async () => {
    // Mock fetch with single request
    vi.mocked(global.fetch).mockResolvedValueOnce({
      ok: true,
      json: async () => [mockRequests[0]],
    } as Response);

    render(
      <QueryClientProvider client={queryClient}>
        <PendingTasksBanner />
      </QueryClientProvider>
    );

    await waitFor(() => {
      expect(screen.getByTestId('pending-tasks-banner')).toBeInTheDocument();
    });

    // Should be singular "questionnaire"
    expect(screen.getByText(/You have 1 wellness questionnaire to complete/i)).toBeInTheDocument();
  });
});
