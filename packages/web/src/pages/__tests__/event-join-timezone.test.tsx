process.env.TZ = 'America/Chicago';

/** Registration-open logic of the public join page, by calendar day. */
import { describe, it, expect, vi, afterEach } from 'vitest';
import { render, screen } from '@testing-library/react';

const mockEvent = vi.fn();

vi.mock('wouter', () => ({
  useParams: () => ({ code: 'ABC123' }),
  Link: ({ children }: any) => <a>{children}</a>,
}));
vi.mock('@/lib/auth', () => ({ useAuth: () => ({ user: { id: 'u1' } }) }));
vi.mock('@/lib/events-api', () => ({
  useEventByCode: () => ({ data: mockEvent(), isLoading: false, error: null, refetch: vi.fn() }),
  useRegisterForEvent: () => ({ mutateAsync: vi.fn(), isPending: false }),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/components/events', () => ({ EventStatusBadge: () => null }));

import EventJoin from '../event-join';

const ev = (startDate: string) => ({
  id: 'e1', name: 'Lucy Ortiz test', status: 'published', startDate, endDate: null,
  location: null, description: null, registrationMode: 'open', registrationCount: 0,
  maxRegistrations: null, registrationOpensAt: null, registrationClosesAt: null,
});

describe('EventJoin registration window (America/Chicago)', () => {
  afterEach(() => vi.useRealTimers());

  const at3pmOct13 = () => {
    vi.useFakeTimers({ toFake: ['Date'] });
    vi.setSystemTime(new Date(2026, 9, 13, 15, 0));
  };

  it('event dated today is still open for registration', () => {
    at3pmOct13();
    mockEvent.mockReturnValue(ev('2026-10-13T00:00:00.000Z'));
    render(<EventJoin />);
    expect(screen.queryByText('Registration Closed')).not.toBeInTheDocument();
  });

  it('event dated yesterday is closed with the "already started" message', () => {
    at3pmOct13();
    mockEvent.mockReturnValue(ev('2026-10-12T00:00:00.000Z'));
    render(<EventJoin />);
    expect(screen.getByText('Registration Closed')).toBeInTheDocument();
    expect(screen.getByText('This event has already started.')).toBeInTheDocument();
  });
});
