process.env.TZ = 'America/Chicago';

/**
 * Custom report timeframes are YYYY-MM-DD calendar dates (event reports, date
 * inputs). They must print the same day for every viewer timezone.
 */
import { describe, it, expect, afterEach } from 'vitest';
import { formatDateRange } from '../report-utils';

const ZONES = ['America/Chicago', 'Pacific/Auckland', 'UTC'] as const;

describe.each(ZONES)('formatDateRange in %s', (tz) => {
  const prev = process.env.TZ;
  afterEach(() => { process.env.TZ = prev; });

  it('prints date-only custom ranges on the stored days', () => {
    process.env.TZ = tz;
    expect(formatDateRange({ type: 'custom', customStart: '2026-10-13', customEnd: '2026-10-15' } as any))
      .toBe('Oct 13, 2026 - Oct 15, 2026');
  });

  it('prints ISO UTC-midnight custom ranges on the stored days', () => {
    process.env.TZ = tz;
    expect(formatDateRange({ type: 'custom', customStart: '2026-01-01T00:00:00.000Z', customEnd: '2026-12-31T00:00:00.000Z' } as any))
      .toBe('Jan 1, 2026 - Dec 31, 2026');
  });

  it('handles missing ends and presets', () => {
    process.env.TZ = tz;
    expect(formatDateRange({ type: 'custom', customStart: '2026-10-13' } as any)).toBe('Oct 13, 2026 - ');
    expect(formatDateRange({ type: 'preset', preset: 'year' } as any)).toBe('Past Year');
  });
});
