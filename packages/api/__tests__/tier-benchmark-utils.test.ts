/**
 * Unit tests for tier benchmark utility functions.
 * Pure function tests — no DB required.
 */

import { describe, it, expect } from 'vitest';
import { deriveTierGroupName } from '../utils/report-utils';

describe('deriveTierGroupName', () => {
  it('strips standard tier suffix from benchmark name', () => {
    expect(deriveTierGroupName('40yd Dash - Elite')).toBe('40yd Dash');
    expect(deriveTierGroupName('Vertical Jump - Good')).toBe('Vertical Jump');
    expect(deriveTierGroupName('Agility 505 - Average')).toBe('Agility 505');
    expect(deriveTierGroupName('T-Test - Below Average')).toBe('T-Test');
  });

  it('strips the last dash-separated segment regardless of name', () => {
    expect(deriveTierGroupName('Sprint - Excellent')).toBe('Sprint');
    expect(deriveTierGroupName('Sprint - Needs Improvement')).toBe('Sprint');
    expect(deriveTierGroupName('Sprint - Custom Tier Name')).toBe('Sprint');
  });

  it('handles multi-segment names by only stripping the last segment', () => {
    expect(deriveTierGroupName('Vertical Jump - Soccer - Girls - High School'))
      .toBe('Vertical Jump - Soccer - Girls');
  });

  it('returns the original name if no dash separator exists', () => {
    expect(deriveTierGroupName('SprintBenchmark')).toBe('SprintBenchmark');
    expect(deriveTierGroupName('Elite')).toBe('Elite');
  });

  it('handles empty string', () => {
    expect(deriveTierGroupName('')).toBe('');
  });
});
