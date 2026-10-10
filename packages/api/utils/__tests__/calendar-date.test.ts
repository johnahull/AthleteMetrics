/**
 * Event dates are calendar dates stored as UTC midnight. Server-side text must
 * print the stored day whatever the server's TZ is.
 */
process.env.TZ = 'America/Chicago';

import { describe, it, expect } from 'vitest';
import { formatCalendarDate } from '../calendar-date';
import { EmailService } from '../../services/email-service';

describe('server timezone (America/Chicago)', () => {
  it('is actually UTC-5/-6', () => {
    expect(new Date(2026, 9, 13).getTimezoneOffset()).toBeGreaterThan(0);
  });

  it('formatCalendarDate prints the stored UTC day for a YYYY-MM-DD report timeframe', () => {
    // event-report-routes stores event.startDate as YYYY-MM-DD in the report timeframe;
    // plain toLocaleDateString() printed 10/12/2026 here.
    expect(formatCalendarDate('2026-10-13')).toBe('10/13/2026');
    expect(formatCalendarDate('2026-10-13T00:00:00.000Z')).toBe('10/13/2026');
  });

  it('event invitation email shows the stored day', () => {
    const svc = new EmailService() as any;
    const html: string = svc.generateEventInvitationTemplate({
      to: 'a@example.com', eventName: 'Lucy Ortiz test',
      eventDate: new Date('2026-10-13T00:00:00.000Z'),
      inviterName: 'Coach', acceptUrl: 'https://example.com/accept',
      expiresAt: new Date(Date.now() + 86400000),
    });
    expect(html).toContain('Tuesday, October 13, 2026');
  });
});
