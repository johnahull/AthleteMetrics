/** Chart labels for calendar dates in Pacific/Auckland. */
process.env.TZ = 'Pacific/Auckland';

import { it, expect } from 'vitest';
import { describeChartCalendarDateCases } from './calendar-date-chart-cases';

it('runs in Pacific/Auckland', () => {
  expect(new Date(2026, 2, 10).getTimezoneOffset()).toBeLessThan(0);
});

describeChartCalendarDateCases('Pacific/Auckland');
