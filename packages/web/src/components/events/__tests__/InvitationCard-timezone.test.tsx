process.env.TZ = 'America/Chicago';

import { describe, it, expect } from 'vitest';
import { render, screen } from '@testing-library/react';
import { InvitationCard } from '../InvitationCard';

function inv(eventOverrides: Record<string, unknown> = {}): any {
  return {
    id: 'inv-1', token: 'tok', status: 'pending',
    event: {
      id: 'e1', name: 'Lucy Ortiz test', startDate: '2026-10-13T00:00:00.000Z', endDate: null,
      location: null, description: null, status: 'published', eventType: 'custom', ...eventOverrides,
    },
  };
}

describe('InvitationCard calendar date (America/Chicago)', () => {
  it('shows the stored day', () => {
    render(<InvitationCard invitation={inv()} />);
    expect(screen.getByText('Tuesday, October 13, 2026')).toBeInTheDocument();
  });

  it('shows a multi-day range on the stored days', () => {
    render(<InvitationCard invitation={inv({ endDate: '2026-10-15T00:00:00.000Z' })} />);
    expect(screen.getByText('Oct 13 - Oct 15, 2026')).toBeInTheDocument();
  });
});
