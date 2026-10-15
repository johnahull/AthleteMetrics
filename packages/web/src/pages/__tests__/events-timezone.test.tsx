process.env.TZ = 'America/Chicago';

/** Events list classification by calendar day (America/Chicago). */

import { describe, it, expect, vi, beforeEach, beforeAll, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import Events from '../events';

// Polyfill for happy-dom (Radix UI components)
beforeAll(() => {
  if (typeof Element.prototype.hasPointerCapture === 'undefined') {
    Element.prototype.hasPointerCapture = function () { return false; };
  }
  if (typeof Element.prototype.setPointerCapture === 'undefined') {
    Element.prototype.setPointerCapture = function () {};
  }
  if (typeof Element.prototype.releasePointerCapture === 'undefined') {
    Element.prototype.releasePointerCapture = function () {};
  }
});

// Mock hooks
const mockUseEvents = vi.fn();

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({
    organizationContext: 'org-123',
    userOrganizations: [{ organizationId: 'org-123', organizationName: 'Test Org' }],
    user: { id: 'user-123', role: 'coach' },
  }),
}));

vi.mock('@/lib/events-api', () => ({
  useEvents: () => mockUseEvents(),
}));

// Mock EventCard component
vi.mock('@/components/events', () => ({
  EventCard: ({ event, onManage }: { event: any; onManage?: (e: any) => void }) => (
    <div data-testid={`event-card-${event.id}`}>
      <span>{event.name}</span>
      {onManage && (
        <button onClick={() => onManage(event)}>Manage</button>
      )}
    </div>
  ),
}));

// Create wrapper with providers
function createWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>
      {children}
    </QueryClientProvider>
  );
}

const mk = (id: string, startDate: string, endDate: string | null = null) => ({
  id, name: `Event ${id}`, eventType: 'custom', status: 'published', startDate, endDate,
  location: null, registrationCount: 0, waitlistCount: 0, checkedInCount: 0,
  maxRegistrations: null, organizationId: 'org-123',
});

describe('Events list classification by calendar day', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 13, 15, 0)); // 3pm local, Oct 13
  });
  afterEach(() => vi.useRealTimers());

  it('lists an event dated today as upcoming, not past', () => {
    mockUseEvents.mockReturnValue({
      data: [mk('today', '2026-10-13T00:00:00.000Z')],
      isLoading: false,
    });
    render(<Events />, { wrapper: createWrapper() });
    expect(screen.getByTestId('tab-upcoming')).toHaveTextContent('1');
    expect(screen.getByTestId('tab-past')).toHaveTextContent('0');
  });

  it('lists a multi-day event ending today as upcoming', () => {
    mockUseEvents.mockReturnValue({
      data: [mk('multi', '2026-10-11T00:00:00.000Z', '2026-10-13T00:00:00.000Z')],
      isLoading: false,
    });
    render(<Events />, { wrapper: createWrapper() });
    expect(screen.getByTestId('tab-upcoming')).toHaveTextContent('1');
    expect(screen.getByTestId('tab-past')).toHaveTextContent('0');
  });

  it('lists yesterday as past and tomorrow as upcoming', () => {
    mockUseEvents.mockReturnValue({
      data: [mk('y', '2026-10-12T00:00:00.000Z'), mk('t', '2026-10-14T00:00:00.000Z')],
      isLoading: false,
    });
    render(<Events />, { wrapper: createWrapper() });
    expect(screen.getByTestId('tab-upcoming')).toHaveTextContent('1');
    expect(screen.getByTestId('tab-past')).toHaveTextContent('1');
  });
});
