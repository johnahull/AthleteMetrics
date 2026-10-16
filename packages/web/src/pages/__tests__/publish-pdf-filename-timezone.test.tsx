/** The PDF filename day must not be tomorrow on a UTC-7/-8 evening. */
process.env.TZ = 'America/Los_Angeles';

import { it, expect } from 'vitest';
import { describePublishPdfFilenameCases } from './publish-pdf-filename-cases';

it('runs in UTC-7/-8', () => {
  expect(new Date(2026, 2, 10).getTimezoneOffset()).toBeGreaterThan(0);
});

// 02:00Z on Mar 10 is 7pm on Mar 9 in Los Angeles
describePublishPdfFilenameCases('America/Los_Angeles', '2026-03-10T02:00:00.000Z', '2026-03-09');
