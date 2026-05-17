/**
 * Unit tests for measurement export utilities
 *
 * Tests cover CSV generation, date formatting, metric name mapping,
 * and browser download functionality for athlete measurement exports.
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { measurementsToCSVString, exportMeasurementsToCSV } from '../measurement-export';
import type { Measurement } from '@shared/schema';

describe('measurementsToCSVString', () => {
  it('should return correct CSV headers', () => {
    const csv = measurementsToCSVString([]);

    expect(csv).toBe('Date,Metric,Value,Units,Status,Season,Team,Notes');
  });

  it('should format dates as YYYY-MM-DD', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'FLY10_TIME',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      }
    ];

    const csv = measurementsToCSVString(measurements as Measurement[]);
    const lines = csv.split('\n');

    expect(lines[1]).toContain('2024-01-15');
  });

  it('should resolve metric codes to labels when metricLabels is provided', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'FLY10_TIME',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      },
      {
        id: '2',
        date: '2024-01-16',
        metric: 'VERTICAL_JUMP',
        value: '32.000',
        units: 'in',
        isVerified: false,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      }
    ];

    const metricLabels = {
      FLY10_TIME: '10-Yard Fly Time',
      VERTICAL_JUMP: 'Vertical Jump',
    };

    const csv = measurementsToCSVString(measurements as Measurement[], metricLabels);

    // Labels replace raw codes when provided
    expect(csv).toContain('10-Yard Fly Time');
    expect(csv).toContain('Vertical Jump');
    expect(csv).not.toContain('FLY10_TIME');
    expect(csv).not.toContain('VERTICAL_JUMP');
  });

  it('underscore-splits the metric code when metricLabels is omitted', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'FLY10_TIME',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      },
    ];

    const csv = measurementsToCSVString(measurements as Measurement[]);

    // No metricLabels argument: falls back to underscore-split prose so a
    // CSV without a labels map still reads as text, not raw underscored codes.
    expect(csv).toContain('FLY10 TIME');
    expect(csv).not.toContain('FLY10_TIME');
  });

  it('underscore-splits unknown codes when not in the supplied labels map', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'UNKNOWN_METRIC',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      },
    ];

    // metricLabels provided but missing the specific code
    const csv = measurementsToCSVString(measurements as Measurement[], { FLY10_TIME: '10-Yard Fly Time' });

    expect(csv).toContain('UNKNOWN METRIC');
    expect(csv).not.toContain('UNKNOWN_METRIC');
  });

  it('should show "Verified" or "Unverified" for status', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'FLY10_TIME',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      },
      {
        id: '2',
        date: '2024-01-16',
        metric: 'VERTICAL_JUMP',
        value: '32.000',
        units: 'in',
        isVerified: false,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      }
    ];

    const csv = measurementsToCSVString(measurements as Measurement[]);

    expect(csv).toContain('Verified');
    expect(csv).toContain('Unverified');
  });

  it('should handle empty notes gracefully', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'FLY10_TIME',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      }
    ];

    const csv = measurementsToCSVString(measurements as Measurement[]);
    const lines = csv.split('\n');

    // Should end with empty field for notes (no "null" or "undefined")
    expect(lines[1]).toMatch(/,,$/);
  });

  it('should escape commas and quotes in notes', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'FLY10_TIME',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: null,
        teamNameSnapshot: null,
        notes: 'Great performance, improved from last week',
      },
      {
        id: '2',
        date: '2024-01-16',
        metric: 'VERTICAL_JUMP',
        value: '32.000',
        units: 'in',
        isVerified: false,
        season: null,
        teamNameSnapshot: null,
        notes: 'Coach said "excellent jump"',
      }
    ];

    const csv = measurementsToCSVString(measurements as Measurement[]);

    // Notes with commas should be quoted
    expect(csv).toContain('"Great performance, improved from last week"');
    // Quotes should be escaped with double quotes
    expect(csv).toContain('"Coach said ""excellent jump"""');
  });

  it('should return headers only for empty array', () => {
    const csv = measurementsToCSVString([]);

    expect(csv).toBe('Date,Metric,Value,Units,Status,Season,Team,Notes');
    expect(csv.split('\n')).toHaveLength(1);
  });

  it('should handle season and team fields', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'FLY10_TIME',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: '2024-Spring',
        teamNameSnapshot: 'Varsity Football',
        notes: null,
      }
    ];

    const csv = measurementsToCSVString(measurements as Measurement[]);

    expect(csv).toContain('2024-Spring');
    expect(csv).toContain('Varsity Football');
  });

  it('should resolve all metric types when metricLabels covers them', () => {
    const metricTypes = [
      'FLY10_TIME',
      'VERTICAL_JUMP',
      'AGILITY_505',
      'AGILITY_5105',
      'T_TEST',
      'DASH_40YD',
      'TOP_SPEED',
      'RSI',
    ];

    const metricLabels: Record<string, string> = {
      FLY10_TIME: '10-Yard Fly Time',
      VERTICAL_JUMP: 'Vertical Jump',
      AGILITY_505: '5-0-5 Agility',
      AGILITY_5105: '5-10-5 Agility',
      T_TEST: 'T-Test',
      DASH_40YD: '40-Yard Dash',
      TOP_SPEED: 'Top Speed',
      RSI: 'Reactive Strength Index',
    };

    const measurements: Partial<Measurement>[] = metricTypes.map((metric, i) => ({
      id: `${i}`,
      date: '2024-01-15',
      metric,
      value: '10.000',
      units: 's',
      isVerified: true,
      season: null,
      teamNameSnapshot: null,
      notes: null,
    }));

    const csv = measurementsToCSVString(measurements as Measurement[], metricLabels);

    expect(csv).toContain('10-Yard Fly Time');
    expect(csv).toContain('Vertical Jump');
    expect(csv).toContain('5-0-5 Agility');
    expect(csv).toContain('5-10-5 Agility');
    expect(csv).toContain('T-Test');
    expect(csv).toContain('40-Yard Dash');
    expect(csv).toContain('Top Speed');
    expect(csv).toContain('Reactive Strength Index');
  });
});

describe('exportMeasurementsToCSV', () => {
  let createElementSpy: any;
  let appendChildSpy: any;
  let removeChildSpy: any;
  let clickSpy: any;
  let createObjectURLSpy: any;
  let revokeObjectURLSpy: any;

  beforeEach(() => {
    // Mock DOM APIs
    clickSpy = vi.fn();
    const mockAnchor = {
      href: '',
      download: '',
      click: clickSpy,
    };

    createElementSpy = vi.spyOn(document, 'createElement').mockReturnValue(mockAnchor as any);
    appendChildSpy = vi.spyOn(document.body, 'appendChild').mockImplementation(() => mockAnchor as any);
    removeChildSpy = vi.spyOn(document.body, 'removeChild').mockImplementation(() => mockAnchor as any);

    // Mock URL APIs
    createObjectURLSpy = vi.spyOn(URL, 'createObjectURL').mockReturnValue('blob:mock-url');
    revokeObjectURLSpy = vi.spyOn(URL, 'revokeObjectURL').mockImplementation(() => {});
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('should create download with correct filename', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'FLY10_TIME',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      }
    ];

    exportMeasurementsToCSV(measurements as Measurement[], 'my-measurements.csv');

    const mockAnchor = createElementSpy.mock.results[0].value;
    expect(mockAnchor.download).toBe('my-measurements.csv');
    expect(clickSpy).toHaveBeenCalled();
  });

  it('should use default filename with current date', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'FLY10_TIME',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      }
    ];

    exportMeasurementsToCSV(measurements as Measurement[]);

    const mockAnchor = createElementSpy.mock.results[0].value;
    const today = new Date().toISOString().split('T')[0];
    expect(mockAnchor.download).toBe(`measurements-${today}.csv`);
  });

  it('should create Blob with CSV content', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'FLY10_TIME',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      }
    ];

    exportMeasurementsToCSV(measurements as Measurement[]);

    expect(createObjectURLSpy).toHaveBeenCalledWith(expect.any(Blob));
    const blob = createObjectURLSpy.mock.calls[0][0];
    expect(blob.type).toBe('text/csv;charset=utf-8;');
  });

  it('should clean up Blob URL after download', () => {
    const measurements: Partial<Measurement>[] = [
      {
        id: '1',
        date: '2024-01-15',
        metric: 'FLY10_TIME',
        value: '1.500',
        units: 's',
        isVerified: true,
        season: null,
        teamNameSnapshot: null,
        notes: null,
      }
    ];

    exportMeasurementsToCSV(measurements as Measurement[]);

    expect(revokeObjectURLSpy).toHaveBeenCalledWith('blob:mock-url');
    expect(removeChildSpy).toHaveBeenCalled();
  });
});
