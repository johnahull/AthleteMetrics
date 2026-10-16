/** Chart labels for calendar dates in America/Los_Angeles. */
process.env.TZ = 'America/Los_Angeles';

import { it, expect } from 'vitest';
import { describeChartCalendarDateCases } from './calendar-date-chart-cases';

it('runs in America/Los_Angeles', () => {
  expect(new Date(2026, 2, 10).getTimezoneOffset()).toBeGreaterThan(0);
});

describeChartCalendarDateCases('America/Los_Angeles');
