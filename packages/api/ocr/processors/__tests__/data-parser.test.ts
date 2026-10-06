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

  it('emits the neutral token for the "agility" fallback without 505', () => {
    const data = parse('John Smith agility 2.80');
    const m = data.find((d) => d.value === '2.80');
    expect(m?.metric).toBe(NEUTRAL);
    expect(m?.confidence).toBe(45);
  });

  it('keys the default measurement range on the neutral token (1.5-4.0)', () => {
    const ranges = config.validation.measurementRanges;
    expect(ranges[NEUTRAL]).toEqual({ min: 1.5, max: 4.0 });
    expect(Object.keys(ranges)).not.toContain('AGILITY_505');
    // out-of-range value is dropped
    expect(parse('John Smith 5-0-5 4.90').map((d) => d.metric)).not.toContain(NEUTRAL);
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
