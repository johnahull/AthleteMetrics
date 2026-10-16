import { describe, it, expect } from 'vitest';
import { buildMeasurementRows, buildBenchmarkRows } from '../pdf-metric-rows';

const groups = [
  { group: 'speed', label: 'Speed', codes: ['DASH_10YD', 'DASH_20YD'] },
  { group: 'power', label: 'Power', codes: ['JUMP_CMJ_HOH'] },
  { group: 'body_composition', label: 'Body Composition', codes: ['BODY_WEIGHT'] },
] as any[];
const labels: Record<string, string> = { DASH_10YD: '10 yd', DASH_20YD: '20 yd', JUMP_CMJ_HOH: 'CMJ', BODY_WEIGHT: 'Weight' };
const units: Record<string, string> = { DASH_10YD: 's', DASH_20YD: 's', JUMP_CMJ_HOH: 'in', BODY_WEIGHT: 'lb' };
const durationText = () => null;
const heading = (label: string, colSpan: number) => ({
  content: label,
  colSpan,
  styles: { fontStyle: 'bold', fillColor: [241, 245, 249] },
});

describe('buildMeasurementRows', () => {
  const measurements = { DASH_10YD: 1.7, DASH_20YD: 2.9, JUMP_CMJ_HOH: 20, BODY_WEIGHT: 150 };

  it('inserts a heading row before each group, in group order', () => {
    const rows = buildMeasurementRows({
      measurements, percentiles: { DASH_10YD: 50 }, labels, units, showPercentile: true, durationText, metricGroups: groups,
    });
    expect(rows).toEqual([
      [heading('Speed', 3)],
      ['10 yd', '1.70 s', '50.0'],
      ['20 yd', '2.90 s', 'N/A'],
      [heading('Power', 3)],
      ['CMJ', '20.00 in', 'N/A'],
      [heading('Body Composition', 3)],
      ['Weight', '150.00 lb', 'N/A'],
    ]);
  });

  it('uses colSpan 2 without percentiles and skips groups with no data', () => {
    const rows = buildMeasurementRows({
      measurements: { JUMP_CMJ_HOH: 20 }, percentiles: {}, labels, units, showPercentile: false, durationText, metricGroups: groups,
    });
    expect(rows).toEqual([[heading('Power', 2)], ['CMJ', '20.00 in']]);
  });

  it('falls back to plain entry order without metricGroups', () => {
    const rows = buildMeasurementRows({
      measurements: { JUMP_CMJ_HOH: 20 }, percentiles: {}, labels, units, showPercentile: false, durationText,
    });
    expect(rows).toEqual([['CMJ', '20.00 in']]);
  });

  it('prefers durationText when it returns a value', () => {
    const rows = buildMeasurementRows({
      measurements: { DASH_10YD: 90 }, percentiles: {}, labels, units, showPercentile: false,
      durationText: () => '1:30', metricGroups: groups,
    });
    expect(rows[1]).toEqual(['10 yd', '1:30']);
  });
});

describe('buildBenchmarkRows', () => {
  const tier = (name: string, order: number, color: string) => ({
    tierName: name, tierOrder: order, tierColor: color, benchmarkName: 'B', athleteValue: 2, isBestTier: true,
  });
  const single = { benchmarkName: 'Bench', benchmarkValue: 3, athleteValue: 2, meetsOrExceeds: true };
  const benchmarkComparisons = {
    BODY_WEIGHT: [single],
    JUMP_CMJ_HOH: [tier('Elite', 1, 'green'), single],
    DASH_10YD: [tier('Varsity', 2, 'blue')],
  };

  it('groups tier and single rows with headings and aligned color array', () => {
    const { tierRows, tierColors, singleRows } = buildBenchmarkRows({
      benchmarkComparisons, labels, units, durationText, metricGroups: groups,
    });
    expect(tierRows).toHaveLength(4);
    expect(tierRows[0]).toEqual([heading('Speed', 4)]);
    expect((tierRows[1] as any[])[0]).toBe('10 yd');
    expect(tierRows[2]).toEqual([heading('Power', 4)]);
    expect(tierColors).toEqual([null, 'blue', null, 'green']);

    expect(singleRows.map((r) => (r.length === 1 ? (r[0] as any).content : r[0]))).toEqual([
      'Power', 'CMJ', 'Body Composition', 'Weight',
    ]);
    expect(singleRows[0]).toEqual([heading('Power', 5)]);
    expect((singleRows[1] as any[])[4]).toBe('Yes');
  });

  it('returns empty arrays when nothing applies', () => {
    expect(buildBenchmarkRows({ benchmarkComparisons: {}, labels, units, durationText, metricGroups: groups }))
      .toEqual({ tierRows: [], tierColors: [], singleRows: [] });
  });
});
