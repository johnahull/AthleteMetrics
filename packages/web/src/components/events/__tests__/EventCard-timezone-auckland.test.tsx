/**
 * Event dates are calendar dates stored as UTC midnight. In UTC-5 the card
 * must show Oct 13, not Oct 12.
 */
process.env.TZ = 'Pacific/Auckland';

import { describe, it, expect, afterEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { EventCard } from '../EventCard';

function ev(overrides: Record<string, unknown> = {}): any {
  return {
    id: 'e1', name: 'Lucy Ortiz test', eventType: 'custom', status: 'published',
    startDate: '2026-10-13T00:00:00.000Z', endDate: null, location: null, description: null,
    registrationCount: 0, waitlistCount: 0, checkedInCount: 0, maxRegistrations: null,
    organizationId: 'org-1', registrationMode: 'open', visibility: 'org_private', ...overrides,
  };
}

describe('EventCard calendar date (Pacific/Auckland)', () => {
  afterEach(() => vi.useRealTimers());

  it('runs in UTC+13', () => {
    expect(new Date(2026, 9, 13).getTimezoneOffset()).toBeLessThan(0);
  });

  it('shows the stored day for a single-day event', () => {
    render(<EventCard event={ev()} />);
    expect(screen.getByText('Oct 13, 2026')).toBeInTheDocument();
  });

  it('shows a multi-day range on the stored days', () => {
    render(<EventCard event={ev({ endDate: '2026-10-15T00:00:00.000Z' })} />);
    expect(screen.getByText('Oct 13-15, 2026')).toBeInTheDocument();
  });

  it('does not mark an event happening today as Completed', () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date(2026, 9, 13, 15, 0));
    render(<EventCard event={ev()} />);
    expect(screen.queryByText('Completed')).not.toBeInTheDocument();
    expect(screen.getByText('In Progress')).toBeInTheDocument();
  });
});
