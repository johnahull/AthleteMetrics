/**
 * AM-FEAT-016 step 4: the OCR parser is protocol-neutral for the 5-0-5.
 * It must emit AGILITY_505_UNRESOLVED, never a concrete (_M/_YD) or retired code.
 */
import { describe, it, expect, vi } from 'vitest';
import { DataParser } from '../data-parser';
import { MeasurementValidator } from '../../validators/measurement-validator';
import { ocrConfigSchema, type OCRConfig } from '@shared/ocr-types';

const config = ocrConfigSchema.parse({}) as unknown as OCRConfig;
const NEUTRAL = 'AGILITY_505_UNRESOLVED';

function parse(text: string) {
  vi.spyOn(console, 'log').mockImplementation(() => {});
  return new DataParser(config).parseAthleteData(text).extractedData;
}

describe('DataParser 5-0-5 neutrality', () => {
  it('emits the neutral token for a "5-0-5 2.45" reading', () => {
    const data = parse('John Smith 5-0-5 2.45');
    const metrics = data.map((d) => d.metric);
    expect(metrics).toContain(NEUTRAL);
    expect(metrics).not.toContain('AGILITY_505');
    expect(metrics).not.toContain('AGILITY_505_M');
    expect(metrics).not.toContain('AGILITY_505_YD');
    expect(data.find((d) => d.metric === NEUTRAL)?.value).toBe('2.45');
  });

  // Issue #541 item 5: the inferred (fallback) mapping must resolve to the 5-0-5 only when the line says 5-0-5.
  // A bare "agility" line is any agility drill, so filing it under the 5-0-5 made the meters/yards prompt ask
  // users to confirm a wrong label.
  it('does not file a bare "agility" line under the 5-0-5', () => {
    const data = parse('John Smith agility 2.80');
    expect(data.find((d) => d.value === '2.80')).toBeUndefined();
  });

  it('files a "T-test agility" line under T_TEST, not the 5-0-5', () => {
    const m = parse('John Smith T-test agility 9.80').find((d) => d.value === '9.80');
    expect(m?.metric).toBe('T_TEST');
  });

  it('files a T-test time containing "10" under T_TEST, not FLY10_TIME', () => {
    const m = parse('John Smith t test 10.20').find((d) => d.value === '10.20');
    expect(m?.metric).toBe('T_TEST');
  });

  it('files a "Pro agility" line under the 5-10-5, not the 5-0-5', () => {
    const m = parse('John Smith Pro agility 4.52').find((d) => d.value === '4.52');
    expect(m?.metric).toBe('AGILITY_5105');
  });

  it('files a 5-10-5 line under AGILITY_5105 (its "10" is not a 10-yard fly)', () => {
    const m = parse('John Smith 5-10-5 4.60').find((d) => d.value === '4.60');
    expect(m?.metric).toBe('AGILITY_5105');
  });

  it('still resolves an "agility 505" line to the neutral token', () => {
    const m = parse('John Smith agility 505 2.45').find((d) => d.value === '2.45');
    expect(m?.metric).toBe(NEUTRAL);
  });

  it('keys the default measurement range on the neutral token (1.3-4.0)', () => {
    const ranges = config.validation.measurementRanges;
    expect(ranges[NEUTRAL]).toEqual({ min: 1.3, max: 4.0 });
    expect(Object.keys(ranges)).not.toContain('AGILITY_505');
    // out-of-range value is dropped
    expect(parse('John Smith 5-0-5 4.90').map((d) => d.metric)).not.toContain(NEUTRAL);
  });

  it('keeps a real 5 yd time between 1.3 and 1.5 s (not dropped before the protocol is known)', () => {
    expect(parse('John Smith 5-0-5 1.40').map((d) => d.metric)).toContain(NEUTRAL);
    expect(parse('John Smith 5-0-5 1.20').map((d) => d.metric)).not.toContain(NEUTRAL);
  });
});

describe('MeasurementValidator thresholds apply to the neutral token', () => {
  const validator = new MeasurementValidator(config);
  const check = (value: string) =>
    validator.validateMeasurement({
      firstName: 'John',
      lastName: 'Smith',
      metric: NEUTRAL,
      value,
      confidence: 85,
    }).warnings;

  it('warns on very fast and slow agility times', () => {
    expect(check('1.9').some((w) => w.includes('Very fast agility'))).toBe(true);
    expect(check('3.6').some((w) => w.includes('Slow agility'))).toBe(true);
    expect(check('2.5').filter((w) => w.toLowerCase().includes('agility'))).toEqual([]);
  });
});

describe('neutral token never appears in user-visible validator text', () => {
  const validator = new MeasurementValidator(config);
  const run = (value: string) =>
    validator.validateMeasurement({
      firstName: 'John',
      lastName: 'Smith',
      metric: NEUTRAL,
      value,
      confidence: 85,
    });

  it('labels it 5-0-5 in range errors and warnings', () => {
    const high = run('4.5');
    expect(high.errors).toContain('Value too high for 5-0-5: 4.5 (maximum: 4)');
    const low = run('1.31');
    const text = [...high.errors, ...high.warnings, ...low.errors, ...low.warnings].join(' | ');
    expect(text).not.toContain('UNRESOLVED');
    expect(low.warnings.join(' ')).toContain('Unusually low value for 5-0-5');
  });
});

describe('DataParser fly-10 run-in neutrality (AM-FEAT-017)', () => {
  const FLY = 'FLY10_TIME_UNRESOLVED';

  it('emits the neutral token for a "10 yd fly 1.45" reading, never a concrete FLY10 code', () => {
    const data = parse('John Smith 10 yd fly 1.45');
    const metrics = data.map((d) => d.metric);
    expect(metrics).toContain(FLY);
    expect(metrics.filter((m) => /^FLY10_TIME(_RI\d+)?$/.test(m ?? ''))).toEqual([]);
    expect(data.find((d) => d.metric === FLY)?.value).toBe('1.45');
  });

  it('does not file a line as a fly just because a "10" appears in a date or in the value', () => {
    // Before the fix these were guessed as fly readings and forced a 422 on the whole photo.
    expect(parse('John Smith 10/05 2.45').find((d) => d.value === '2.45')).toBeUndefined();
    expect(parse('Jane Doe 2.10').find((d) => d.value === '2.10')).toBeUndefined();
    expect(parse('Jane Doe tendon 1.50').find((d) => d.value === '1.50')).toBeUndefined();
  });

  it('files a "10 fly" / "fly 10" line under the neutral token', () => {
    expect(parse('John Smith 10 fly 1.05').find((d) => d.value === '1.05')?.metric).toBe(FLY);
    expect(parse('John Smith fly 10 1.05').find((d) => d.value === '1.05')?.metric).toBe(FLY);
  });

  it('keeps T-test and 5-10-5 lines out of the fly bucket', () => {
    expect(parse('John Smith t test 10.20').find((d) => d.value === '10.20')?.metric).toBe('T_TEST');
    expect(parse('John Smith 5-10-5 4.60').find((d) => d.value === '4.60')?.metric).toBe('AGILITY_5105');
  });

  it('validates a neutral fly reading (range and warnings) and hides the token in user-visible text', () => {
    const validator = new MeasurementValidator(config);
    const ok = validator.validateMeasurement({ firstName: 'John', lastName: 'Smith', metric: FLY, value: '1.45', confidence: 85 });
    expect(ok.isValid).toBe(true);
    const fast = validator.validateMeasurement({ firstName: 'John', lastName: 'Smith', metric: FLY, value: '0.9', confidence: 85 });
    expect(fast.warnings.some((w) => /fly/i.test(w))).toBe(true);
    const high = validator.validateMeasurement({ firstName: 'John', lastName: 'Smith', metric: FLY, value: '3.5', confidence: 85 });
    expect(high.errors).toContain('Value too high for 10-yard fly: 3.5 (maximum: 3)');
    expect(JSON.stringify([ok, fast, high])).not.toContain('UNRESOLVED');
  });
});

// Issue #585: a value cut out of a bigger number, duplicate fly rows, and a "10" that is not a distance.
describe('DataParser value and distance boundaries (#585)', () => {
  const FLY = 'FLY10_TIME_UNRESOLVED';
  const context = { firstName: 'John', lastName: 'Smith', confidence: 70 };

  // Raw rows from one line, before parseAthleteData's per-athlete consolidation hides duplicates.
  function rawRows(line: string) {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    return (new DataParser(config) as any).extractMeasurements(line, context) as Array<{ metric?: string; value: string }>;
  }

  it('does not cut a fly time out of a bigger number ("10 fly 11.05" is not 1.05)', () => {
    expect(parse('John Smith 10 fly 11.05').find((d) => d.value === '1.05')).toBeUndefined();
  });

  it('does not read "1.055" as a 1.05 fly time', () => {
    expect(parse('John Smith fly 10 1.055').find((d) => d.value === '1.05')).toBeUndefined();
    expect(rawRows('fly 10 1.055').find((d) => d.value === '1.05')).toBeUndefined();
  });

  it('gives exactly one fly row for "fly 10 1.05" and for "10 yd fly 1.05"', () => {
    expect(rawRows('fly 10 1.05').filter((d) => d.metric === FLY)).toEqual([
      expect.objectContaining({ metric: FLY, value: '1.05' }),
    ]);
    expect(rawRows('10 yd fly 1.05').filter((d) => d.metric === FLY)).toEqual([
      expect.objectContaining({ metric: FLY, value: '1.05' }),
    ]);
  });

  it('does not treat a "10" inside another number as the fly distance', () => {
    expect(rawRows('fly 10.5 1.05').filter((d) => d.metric === FLY)).toEqual([]);
    expect(rawRows('fly 1,10 1.05').filter((d) => d.metric === FLY)).toEqual([]);
    expect(parse('John Smith fly 10.5 1.05').find((d) => d.metric === FLY)).toBeUndefined();
    expect(parse('John Smith fly 1,10 1.05').find((d) => d.metric === FLY)).toBeUndefined();
  });

  it('does not cut a 40 yd or 5-0-5 time out of a bigger number', () => {
    expect(parse('John Smith 40 yd 14.52').find((d) => d.value === '4.52')).toBeUndefined();
    expect(parse('John Smith 505 12.45').find((d) => d.value === '2.45')).toBeUndefined();
  });

  it('does not cut a 5-10-5, T-test or RSI value out of a bigger number', () => {
    expect(rawRows('5-10-5 14.31').find((d) => d.value === '4.31')).toBeUndefined();
    expect(rawRows('t test 110.20').find((d) => d.value === '10.20')).toBeUndefined();
    expect(rawRows('rsi 12.15').find((d) => d.value === '2.15')).toBeUndefined();
    expect(rawRows('fly 10 2.1.05').find((d) => d.value === '1.05')).toBeUndefined();
  });

  // A dot leader or ellipsis before the value is common in printed result sheets; it is not part of the number.
  it('still reads a value after a dot leader', () => {
    expect(parse('John Smith Fly 10........1.05').find((d) => d.metric === FLY)?.value).toBe('1.05');
    expect(parse('Smith John 10 yd fly...1.08').find((d) => d.metric === FLY)?.value).toBe('1.08');
    expect(parse('John Smith 40yd....4.52').find((d) => d.metric === 'DASH_40YD')?.value).toBe('4.52');
    expect(parse('John Smith 5-10-5....4.31').find((d) => d.metric === 'AGILITY_5105')?.value).toBe('4.31');
    expect(parse('John Smith T-test..10.25').find((d) => d.metric === 'T_TEST')?.value).toBe('10.25');
    expect(parse('John Smith sprint....4.52').find((d) => d.metric === 'DASH_40YD')?.value).toBe('4.52');
  });

  it('still reads a value followed by a unit or a full stop', () => {
    expect(parse('John Smith fly 10 1.05s').find((d) => d.metric === FLY)?.value).toBe('1.05');
    expect(parse('John Smith fly 10 1.05.').find((d) => d.metric === FLY)?.value).toBe('1.05');
  });

  it('gives one inferred row when both generic time patterns read the same value', () => {
    vi.spyOn(console, 'log').mockImplementation(() => {});
    const rows = (new DataParser(config) as any).extractGenericTimes('sprint 4.52', context) as Array<{ value: string }>;
    expect(rows.map((r) => r.value)).toEqual(['4.52']);
  });
});
