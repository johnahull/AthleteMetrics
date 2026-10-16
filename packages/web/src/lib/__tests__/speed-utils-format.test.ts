import { describe, it, expect } from 'vitest';
import { formatFly10TimeWithSpeed } from '../speed-utils';

describe('formatFly10TimeWithSpeed', () => {
  it('separates the seconds unit from the time with a space', () => {
    expect(formatFly10TimeWithSpeed(1.95)).toBe('1.95 s (10.5 mph)');
  });
});
