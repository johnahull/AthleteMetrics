import { describe, it, expect } from 'vitest';
import { balanceLine } from '../balance';

// LSI = faster / slower x 100; the 0.15s gap rule needs times near 1s to stay out of the way of the % bands
const b = (left: number | null, right: number | null, hasTierSet = true) => balanceLine({ left, right, hasTierSet });

describe('balanceLine', () => {
  it('is balanced at 95 and above', () => {
    expect(b(0.95, 1.0)?.status).toBe('balanced'); // exactly 95
    expect(b(0.99, 1.0)?.status).toBe('balanced');
  });

  it('is keep an eye on it from 90 to under 95', () => {
    expect(b(0.9, 1.0)?.status).toBe('keep_an_eye'); // exactly 90
    expect(b(0.949, 1.0)?.status).toBe('keep_an_eye'); // 94.9
  });

  it('is worth working on below 90', () => {
    expect(b(0.89, 1.0)?.status).toBe('worth_working_on');
  });

  it('is worth working on when the gap is over 0.15s even if the percentage is 90+', () => {
    const r = b(9.0, 9.16); // 98.3%, gap 0.16
    expect(r?.status).toBe('worth_working_on');
  });

  it('does not trigger the absolute rule at exactly 0.15s', () => {
    expect(b(9.0, 9.15)?.status).toBe('balanced');
  });

  it('triggers the absolute rule just over 0.15s (no rounding to 0.01)', () => {
    expect(b(9.0, 9.151)?.status).toBe('worth_working_on');
    expect(b(9.0, 9.154)?.status).toBe('worth_working_on');
  });

  it('is omitted for non-finite times, never balanced', () => {
    expect(b(Number.NaN, 6)).toBeNull();
    expect(b(5, Number.POSITIVE_INFINITY)).toBeNull();
  });

  it('is omitted when only one leg was tested', () => {
    expect(b(5.4, null)).toBeNull();
    expect(b(null, 5.4)).toBeNull();
    expect(b(null, null)).toBeNull();
  });

  it('shows the value with a neutral label when there is no tier set', () => {
    const r = b(5.4, 6.0, false);
    expect(r?.status).toBe('neutral');
    expect(r?.lsiPercent).toBeCloseTo(90, 6);
    expect(r?.label).not.toMatch(/balanced|working on|eye/i);
  });

  it('never uses risk or injury wording', () => {
    for (const r of [b(5.0, 6.0), b(5.4, 6.0), b(5.9, 6.0), b(5.4, 6.0, false)]) {
      expect(r?.label).not.toMatch(/risk|injur|elevated|medical/i);
    }
  });
});
