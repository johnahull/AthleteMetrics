import { describe, it, expect } from 'vitest';
import { ALLOWED_METRICS } from '../analytics-validation';

// ALLOWED_METRICS is a legacy list (actual request validation is by regex), kept consistent
// with site_metrics so the exported constant does not mislead consumers.
describe('ALLOWED_METRICS 5-0-5 per-leg and LSI codes', () => {
  it.each([
    'AGILITY_505_M_L', 'AGILITY_505_M_R', 'AGILITY_505_M_LSI',
    'AGILITY_505_YD_L', 'AGILITY_505_YD_R', 'AGILITY_505_YD_LSI',
  ])('includes %s', (code) => {
    expect(ALLOWED_METRICS as readonly string[]).toContain(code);
  });

  it('does not include an unknown code', () => {
    expect(ALLOWED_METRICS as readonly string[]).not.toContain('AGILITY_505_XX');
  });
});
