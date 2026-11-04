import { describe, it, expect } from 'vitest';
import { radarSegments } from '../eval-report-radar-geometry';

describe('radarSegments', () => {
  it('joins every adjacent pair when all axes are scored, closing the loop', () => {
    expect(radarSegments([10, 20, 30])).toEqual([[0, 1], [1, 2], [2, 0]]);
  });
  it('never draws a segment across an unscored axis', () => {
    expect(radarSegments([10, 20, null, 40, 50, 60])).toEqual([[0, 1], [3, 4], [4, 5], [5, 0]]);
    expect(radarSegments([10, null, 30, null, 50, null])).toEqual([]);
  });
  it('draws nothing for fewer than two scored neighbours', () => {
    expect(radarSegments([null, null, 5])).toEqual([]);
  });
});
