/**
 * Comprehensive tests for chartDataUtils
 *
 * Tests cover data selection logic for different chart types,
 * data validation, and edge cases to ensure reliability.
 */

import { describe, it, expect } from 'vitest';
import { getChartDataForType, hasValidDataForChartType } from '../utils/chartDataUtils';
import type { ChartDataPoint, TrendData, MultiMetricData, ChartType } from '@shared/analytics-types';

describe('getChartDataForType', () => {
  const mockData: ChartDataPoint[] = [
    { athleteId: 'athlete-1', athleteName: 'John Doe', value: 10, metric: 'FLY10_TIME', date: new Date('2025-01-01') }
  ];

  const mockTrends: TrendData[] = [
    {
      athleteId: 'athlete-1',
      athleteName: 'John Doe',
      metric: 'FLY10_TIME',
      data: [{ date: new Date('2025-01-01'), value: 10 }]
    }
  ];

  const mockMultiMetric: MultiMetricData[] = [
    {
      athleteId: 'athlete-1',
      athleteName: 'John Doe',
      metrics: { FLY10_TIME: 1.5, VERTICAL_JUMP: 30 },
      percentileRanks: { FLY10_TIME: 75, VERTICAL_JUMP: 80 }
    }
  ];

  describe('line_chart type', () => {
    it('should return trends for line_chart', () => {
      const result = getChartDataForType('line_chart', mockData, mockTrends, mockMultiMetric);
      expect(result).toBe(mockTrends);
    });

    it('should return empty array when trends is undefined', () => {
      const result = getChartDataForType('line_chart', mockData, undefined, mockMultiMetric);
      expect(result).toEqual([]);
    });

    it('should return empty array when trends is empty', () => {
      const result = getChartDataForType('line_chart', mockData, [], mockMultiMetric);
      expect(result).toEqual([]);
    });
  });

  describe('multi_line type', () => {
    it('should return trends for multi_line', () => {
      const result = getChartDataForType('multi_line', mockData, mockTrends, mockMultiMetric);
      expect(result).toBe(mockTrends);
    });

    it('should return empty array when trends is undefined', () => {
      const result = getChartDataForType('multi_line', mockData, undefined, mockMultiMetric);
      expect(result).toEqual([]);
    });
  });

  describe('connected_scatter type', () => {
    it('should return trends for connected_scatter', () => {
      const result = getChartDataForType('connected_scatter', mockData, mockTrends, mockMultiMetric);
      expect(result).toBe(mockTrends);
    });

    it('should return empty array when trends is undefined', () => {
      const result = getChartDataForType('connected_scatter', mockData, undefined, mockMultiMetric);
      expect(result).toEqual([]);
    });
  });

  describe('time_series_box_swarm type', () => {
    it('should return trends for time_series_box_swarm', () => {
      const result = getChartDataForType('time_series_box_swarm', mockData, mockTrends, mockMultiMetric);
      expect(result).toBe(mockTrends);
    });

    it('should return empty array when trends is undefined', () => {
      const result = getChartDataForType('time_series_box_swarm', mockData, undefined, mockMultiMetric);
      expect(result).toEqual([]);
    });
  });

  describe('radar_chart type', () => {
    it('should prefer multiMetric for radar_chart when available', () => {
      const result = getChartDataForType('radar_chart', mockData, mockTrends, mockMultiMetric);
      expect(result).toBe(mockMultiMetric);
    });

    it('should fallback to data when multiMetric is undefined', () => {
      const result = getChartDataForType('radar_chart', mockData, mockTrends, undefined);
      expect(result).toBe(mockData);
    });

    it('should fallback to data when multiMetric is empty array', () => {
      const result = getChartDataForType('radar_chart', mockData, mockTrends, []);
      expect(result).toBe(mockData);
    });

    it('should use multiMetric when both multiMetric and data are available', () => {
      const result = getChartDataForType('radar_chart', mockData, mockTrends, mockMultiMetric);
      expect(result).toBe(mockMultiMetric);
      expect(result).not.toBe(mockData);
    });
  });

  describe('default/standard chart types', () => {
    const standardChartTypes: ChartType[] = [
      'box_plot',
      'box_swarm_combo',
      'distribution',
      'bar_chart',
      'scatter_plot',
      'swarm_plot',
      'violin_plot'
    ];

    standardChartTypes.forEach(chartType => {
      it(`should return data for ${chartType}`, () => {
        const result = getChartDataForType(chartType, mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockData);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle empty data array', () => {
      const result = getChartDataForType('box_plot', [], undefined, undefined);
      expect(result).toEqual([]);
    });

    it('should handle all parameters as empty/undefined', () => {
      const result = getChartDataForType('line_chart', [], undefined, undefined);
      expect(result).toEqual([]);
    });

    it('should handle radar chart with empty multiMetric and empty data', () => {
      const result = getChartDataForType('radar_chart', [], undefined, []);
      expect(result).toEqual([]);
    });
  });
});

describe('hasValidDataForChartType', () => {
  const mockData: ChartDataPoint[] = [
    { athleteId: 'athlete-1', athleteName: 'John Doe', value: 10, metric: 'FLY10_TIME', date: new Date('2025-01-01') }
  ];

  const mockTrends: TrendData[] = [
    {
      athleteId: 'athlete-1',
      athleteName: 'John Doe',
      metric: 'FLY10_TIME',
      data: [{ date: new Date('2025-01-01'), value: 10 }]
    }
  ];

  const mockMultiMetric: MultiMetricData[] = [
    {
      athleteId: 'athlete-1',
      athleteName: 'John Doe',
      metrics: { FLY10_TIME: 1.5, VERTICAL_JUMP: 30 },
      percentileRanks: { FLY10_TIME: 75, VERTICAL_JUMP: 80 }
    }
  ];

  describe('trend-based chart types', () => {
    const trendChartTypes: ChartType[] = [
      'line_chart',
      'multi_line',
      'connected_scatter',
      'time_series_box_swarm'
    ];

    trendChartTypes.forEach(chartType => {
      it(`should return true for ${chartType} with valid trends`, () => {
        const result = hasValidDataForChartType(chartType, mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(true);
      });

      it(`should return false for ${chartType} with empty trends`, () => {
        const result = hasValidDataForChartType(chartType, mockData, [], mockMultiMetric);
        expect(result).toBe(false);
      });

      it(`should return false for ${chartType} with undefined trends`, () => {
        const result = hasValidDataForChartType(chartType, mockData, undefined, mockMultiMetric);
        expect(result).toBe(false);
      });
    });
  });

  describe('radar_chart type', () => {
    it('should return true when multiMetric is available', () => {
      const result = hasValidDataForChartType('radar_chart', [], undefined, mockMultiMetric);
      expect(result).toBe(true);
    });

    it('should return true when data is available but no multiMetric', () => {
      const result = hasValidDataForChartType('radar_chart', mockData, undefined, undefined);
      expect(result).toBe(true);
    });

    it('should return true when both multiMetric and data are available', () => {
      const result = hasValidDataForChartType('radar_chart', mockData, undefined, mockMultiMetric);
      expect(result).toBe(true);
    });

    it('should return false when neither multiMetric nor data are available', () => {
      const result = hasValidDataForChartType('radar_chart', [], undefined, undefined);
      expect(result).toBe(false);
    });

    it('should return false when multiMetric is empty and data is empty', () => {
      const result = hasValidDataForChartType('radar_chart', [], undefined, []);
      expect(result).toBe(false);
    });
  });

  describe('standard chart types', () => {
    const standardChartTypes: ChartType[] = [
      'box_plot',
      'box_swarm_combo',
      'distribution',
      'bar_chart',
      'scatter_plot',
      'swarm_plot',
      'violin_plot'
    ];

    standardChartTypes.forEach(chartType => {
      it(`should return true for ${chartType} with valid data`, () => {
        const result = hasValidDataForChartType(chartType, mockData, undefined, undefined);
        expect(result).toBe(true);
      });

      it(`should return false for ${chartType} with empty data`, () => {
        const result = hasValidDataForChartType(chartType, [], undefined, undefined);
        expect(result).toBe(false);
      });

      it(`should return false for ${chartType} with undefined data`, () => {
        const result = hasValidDataForChartType(chartType, undefined as any, undefined, undefined);
        expect(result).toBe(false);
      });
    });
  });

  describe('edge cases', () => {
    it('should handle all parameters as empty/undefined', () => {
      const result = hasValidDataForChartType('line_chart', [], undefined, undefined);
      expect(result).toBe(false);
    });

    it('should handle valid trends with empty data', () => {
      const result = hasValidDataForChartType('line_chart', [], mockTrends, undefined);
      expect(result).toBe(true);
    });

    it('should handle radar chart preferring multiMetric over data', () => {
      const result = hasValidDataForChartType('radar_chart', [], undefined, mockMultiMetric);
      expect(result).toBe(true);
    });
  });
});
