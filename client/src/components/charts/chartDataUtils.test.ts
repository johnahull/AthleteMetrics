import { describe, it, expect } from 'vitest';
import { getChartDataForType } from './chartDataUtils';
import type { ChartDataPoint, TrendData, MultiMetricData } from '@shared/analytics-types';

describe('chartDataUtils', () => {
  describe('getChartDataForType', () => {
    // Mock data
    const mockData: ChartDataPoint[] = [
      {
        athleteId: 'athlete-1',
        athleteName: 'John Doe',
        metric: 'FLY10_TIME',
        value: 1.23,
        date: '2024-01-01',
        teamName: 'Team A'
      },
      {
        athleteId: 'athlete-2',
        athleteName: 'Jane Smith',
        metric: 'VERTICAL_JUMP',
        value: 28.5,
        date: '2024-01-01',
        teamName: 'Team B'
      }
    ];

    const mockTrends: TrendData[] = [
      {
        athleteId: 'athlete-1',
        athleteName: 'John Doe',
        metric: 'FLY10_TIME',
        data: [
          { date: '2024-01-01', value: 1.23 },
          { date: '2024-02-01', value: 1.20 }
        ]
      }
    ];

    const mockMultiMetric: MultiMetricData[] = [
      {
        athleteId: 'athlete-1',
        athleteName: 'John Doe',
        metrics: {
          FLY10_TIME: 1.23,
          VERTICAL_JUMP: 28.5
        }
      }
    ];

    describe('line chart types', () => {
      it('should return trends for line_chart type', () => {
        const result = getChartDataForType('line_chart', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockTrends);
      });

      it('should return trends for multi_line type', () => {
        const result = getChartDataForType('multi_line', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockTrends);
      });

      it('should return trends for connected_scatter type', () => {
        const result = getChartDataForType('connected_scatter', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockTrends);
      });

      it('should return trends for time_series_box_swarm type', () => {
        const result = getChartDataForType('time_series_box_swarm', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockTrends);
      });

      it('should return empty array when trends is undefined', () => {
        const result = getChartDataForType('line_chart', mockData, undefined, mockMultiMetric);
        expect(result).toEqual([]);
      });
    });

    describe('radar chart type', () => {
      it('should prefer multiMetric data when available', () => {
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

      it('should use multiMetric when it has data even if trends is also provided', () => {
        const result = getChartDataForType('radar_chart', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockMultiMetric);
        expect(result).not.toBe(mockTrends);
      });
    });

    describe('standard chart types', () => {
      it('should return data for box_plot type', () => {
        const result = getChartDataForType('box_plot', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockData);
      });

      it('should return data for box_swarm_combo type', () => {
        const result = getChartDataForType('box_swarm_combo', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockData);
      });

      it('should return data for scatter_plot type', () => {
        const result = getChartDataForType('scatter_plot', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockData);
      });

      it('should return data for distribution type', () => {
        const result = getChartDataForType('distribution', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockData);
      });

      it('should return data for bar_chart type', () => {
        const result = getChartDataForType('bar_chart', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockData);
      });

      it('should return data for swarm_plot type', () => {
        const result = getChartDataForType('swarm_plot', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockData);
      });

      it('should return data for violin_plot type', () => {
        const result = getChartDataForType('violin_plot', mockData, mockTrends, mockMultiMetric);
        expect(result).toBe(mockData);
      });
    });

    describe('edge cases', () => {
      it('should handle empty data array', () => {
        const result = getChartDataForType('bar_chart', [], mockTrends, mockMultiMetric);
        expect(result).toEqual([]);
      });

      it('should handle all parameters being empty', () => {
        const result = getChartDataForType('line_chart', [], undefined, undefined);
        expect(result).toEqual([]);
      });

      it('should prioritize trends over data for line charts even if both are empty', () => {
        const result = getChartDataForType('line_chart', mockData, [], mockMultiMetric);
        expect(result).toEqual([]);
        expect(result).not.toBe(mockData);
      });

      it('should return data when only data is provided', () => {
        const result = getChartDataForType('box_plot', mockData);
        expect(result).toBe(mockData);
      });
    });

    describe('type safety', () => {
      it('should return correct type for trend charts', () => {
        const result = getChartDataForType('line_chart', mockData, mockTrends, mockMultiMetric);
        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0 && 'data' in result[0]) {
          expect(result[0]).toHaveProperty('data');
          expect(result[0]).toHaveProperty('athleteId');
        }
      });

      it('should return correct type for radar charts with multiMetric', () => {
        const result = getChartDataForType('radar_chart', mockData, mockTrends, mockMultiMetric);
        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0 && 'metrics' in result[0]) {
          expect(result[0]).toHaveProperty('metrics');
          expect(result[0]).toHaveProperty('athleteId');
        }
      });

      it('should return correct type for standard charts', () => {
        const result = getChartDataForType('box_plot', mockData, mockTrends, mockMultiMetric);
        expect(Array.isArray(result)).toBe(true);
        if (result.length > 0) {
          expect(result[0]).toHaveProperty('value');
          expect(result[0]).toHaveProperty('metric');
        }
      });
    });
  });
});
