/** Calendar dates must not show the previous day in UTC-7/-8. */
process.env.TZ = 'America/Los_Angeles';

import { it, expect } from 'vitest';
import { describeWidgetCalendarDateCases } from './calendar-date-widget-cases';

it('runs in UTC-7/-8', () => {
  expect(new Date(2026, 2, 10).getTimezoneOffset()).toBeGreaterThan(0);
});

describeWidgetCalendarDateCases('America/Los_Angeles');
