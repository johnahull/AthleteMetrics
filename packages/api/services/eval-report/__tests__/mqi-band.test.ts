import { describe, it, expect } from 'vitest';
import { movementBand } from '../mqi-band';
import { MQI_BANDS } from '@shared/mqi-band';

describe('movementBand', () => {
  it.each([
    [0, 'Developing'],
    [8, 'Developing'],
    [9, 'Competent'],
    [14, 'Competent'],
    [15, 'Efficient'],
    [19, 'Efficient'],
    [20, 'Advanced'],
    [24, 'Advanced'],
  ])('maps %s to %s', (score, band) => {
    expect(movementBand(score)).toBe(band);
  });

  it('is null when MQI is absent or out of range', () => {
    expect(movementBand(null)).toBeNull();
    expect(movementBand(undefined)).toBeNull();
    expect(movementBand(-1)).toBeNull();
    expect(movementBand(25)).toBeNull();
    expect(movementBand(Number.NaN)).toBeNull();
  });

  it('returns the band word only, never the raw score', () => {
    expect(movementBand(17)).toBe('Efficient');
    expect(MQI_BANDS.map((b) => b.label)).toEqual(['Developing', 'Competent', 'Efficient', 'Advanced']);
  });
});
