/** Calendar dates must not move to the next day in UTC+13. */
process.env.TZ = 'Pacific/Auckland';

import { it, expect } from 'vitest';
import { describeWidgetCalendarDateCases } from './calendar-date-widget-cases';

it('runs in UTC+13', () => {
  expect(new Date(2026, 2, 10).getTimezoneOffset()).toBeLessThan(0);
});

describeWidgetCalendarDateCases('Pacific/Auckland');
