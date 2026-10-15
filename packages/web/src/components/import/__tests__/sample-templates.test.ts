import { describe, it, expect } from 'vitest';
import { MEASUREMENTS_SAMPLE_CSV } from '../sample-templates';
import { assertFlyInDistanceMatches } from '@shared/fly-run-in';

describe('measurements sample CSV', () => {
  const [header, ...rows] = MEASUREMENTS_SAMPLE_CSV.split('\n');
  const cols = header.split(',');
  it('every row passes the fly-in distance check', () => {
    expect(rows.length).toBeGreaterThan(0);
    for (const line of rows) {
      const cells = line.split(',');
      const metric = cells[cols.indexOf('metric')];
      const fly = cells[cols.indexOf('flyInDistance')];
      expect(() => assertFlyInDistanceMatches(metric, fly), line).not.toThrow();
    }
  });
});
