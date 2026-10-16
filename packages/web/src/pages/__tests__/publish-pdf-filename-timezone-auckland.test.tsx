/** The PDF filename day must not be yesterday on a UTC+13 morning. */
process.env.TZ = 'Pacific/Auckland';

import { it, expect } from 'vitest';
import { describePublishPdfFilenameCases } from './publish-pdf-filename-cases';

it('runs in UTC+13', () => {
  expect(new Date(2026, 2, 10).getTimezoneOffset()).toBeLessThan(0);
});

// 20:00Z on Mar 9 is 9am on Mar 10 in Auckland
describePublishPdfFilenameCases('Pacific/Auckland', '2026-03-09T20:00:00.000Z', '2026-03-10');
