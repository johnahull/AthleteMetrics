/**
 * AM-FEAT-016: CSV template example rows need sample values for the m/yd 5-0-5 codes.
 */
import { describe, it, expect, vi } from 'vitest';

vi.mock('../../db', () => ({ db: {} }));

import { templateGeneratorService } from '../template-generator-service';

describe('TemplateGeneratorService sample values (5-0-5 protocols)', () => {
  it('has a plausible sample for AGILITY_505_M and a shorter one for AGILITY_505_YD', () => {
    const m = Number(templateGeneratorService.getSampleValue('AGILITY_505_M'));
    const yd = Number(templateGeneratorService.getSampleValue('AGILITY_505_YD'));
    expect(m).toBeGreaterThan(1.5);
    expect(m).toBeLessThan(5);
    expect(yd).toBeGreaterThan(1.3);
    expect(yd).toBeLessThan(m);
  });

  it('no longer provides a sample for the retired AGILITY_505 code', () => {
    expect(templateGeneratorService.getSampleValue('AGILITY_505')).toBe('');
  });
});
