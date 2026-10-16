/**
 * Measurement and goal dates are calendar dates ('YYYY-MM-DD'). In UTC-7/-8
 * they must not show the previous day.
 */
process.env.TZ = 'America/Los_Angeles';

import { describeCalendarDateCases } from './calendar-date-cases';

describeCalendarDateCases('America/Los_Angeles', true);
