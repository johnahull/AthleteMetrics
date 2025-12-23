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

  it('should use metric codes (database labels injected by caller in production)', () => {
    // NOTE: getMetricDisplayName now returns metric codes directly.
    // In production, labels come from useMetricConfig hook via database.
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

    // Now returns metric codes (fallback behavior)
    expect(csv).toContain('FLY10_TIME');
    expect(csv).toContain('VERTICAL_JUMP');
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

  it('should handle all metric types (outputs metric codes)', () => {
    // NOTE: getMetricDisplayName now returns metric codes directly.
    // In production, labels come from useMetricConfig hook via database.
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

    const csv = measurementsToCSVString(measurements as Measurement[]);

    // Now outputs metric codes (fallback behavior - labels come from database in production)
    expect(csv).toContain('FLY10_TIME');
    expect(csv).toContain('VERTICAL_JUMP');
    expect(csv).toContain('AGILITY_505');
    expect(csv).toContain('AGILITY_5105');
    expect(csv).toContain('T_TEST');
    expect(csv).toContain('DASH_40YD');
    expect(csv).toContain('TOP_SPEED');
    expect(csv).toContain('RSI');
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
