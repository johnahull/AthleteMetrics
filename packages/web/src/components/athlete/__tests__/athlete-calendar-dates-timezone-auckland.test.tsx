/**
 * Measurement and goal dates are calendar dates ('YYYY-MM-DD'). In UTC+13
 * they must not move to the next day either.
 */
process.env.TZ = 'Pacific/Auckland';

import { describeCalendarDateCases } from './calendar-date-cases';

describeCalendarDateCases('Pacific/Auckland', false);
