import { describe, it, expect } from 'vitest';
import { durationAxis } from '../utils/durationAxis';

const format = { unit: 's', displayFormat: 'duration' as const, decimalPrecision: 1 };

describe('durationAxis', () => {
  it('puts ticks on round mm:ss steps across the scale', () => {
    const scale = { min: 395, max: 425, ticks: [] as { value: number }[] };
    durationAxis(format).afterBuildTicks(scale);
    expect(scale.ticks.map((t) => t.value)).toEqual([395, 400, 405, 410, 415, 420, 425]);
  });

  it('uses a 1-minute step for a 5-minute range', () => {
    const scale = { min: 290, max: 610, ticks: [] as { value: number }[] };
    durationAxis(format).afterBuildTicks(scale);
    expect(scale.ticks.map((t) => t.value)).toEqual([300, 360, 420, 480, 540, 600]);
  });

  it('keeps one tick for a single value off the step grid', () => {
    const scale = { min: 402.5, max: 402.5, ticks: [] as { value: number }[] };
    durationAxis(format).afterBuildTicks(scale);
    expect(scale.ticks.map((t) => t.value)).toEqual([402.5]);
  });

  it('labels ticks as m:ss without decimals', () => {
    expect(durationAxis(format).ticks.callback(420)).toBe('7:00');
    expect(durationAxis(format).ticks.callback('405')).toBe('6:45');
  });
});
