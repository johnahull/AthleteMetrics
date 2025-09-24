/**
 * Unit tests for chart calculation utilities
 *
 * Tests cover all critical mathematical functions to ensure accuracy
 * and prevent performance regressions in chart rendering.
 */

import { describe, it, expect } from 'vitest';
import {
  calculateCorrelation,
  calculateImprovement,
  getPerformanceQuadrantLabels,
  processAthleteDatasets,
  calculateAthleteAnalytics
} from '../chart-calculations';

describe('Chart Calculations', () => {
  describe('calculateCorrelation', () => {
    it('should return 0 for invalid inputs', () => {
      expect(calculateCorrelation([], [])).toBe(0);
      expect(calculateCorrelation([1], [1])).toBe(0);
      expect(calculateCorrelation([1, 2], [1])).toBe(0);
    });

    it('should calculate perfect positive correlation', () => {
      const result = calculateCorrelation([1, 2, 3, 4], [2, 4, 6, 8]);
      expect(result).toBeCloseTo(1, 5);
    });

    it('should calculate perfect negative correlation', () => {
      const result = calculateCorrelation([1, 2, 3, 4], [8, 6, 4, 2]);
      expect(result).toBeCloseTo(-1, 5);
    });

    it('should calculate zero correlation', () => {
      const result = calculateCorrelation([1, 2, 3, 4], [1, 1, 1, 1]);
      expect(result).toBe(0);
    });

    it('should handle real-world athletic data', () => {
      // Example: 40-yard dash times vs vertical jump heights (should be negative correlation)
      const dashTimes = [4.5, 4.3, 4.7, 4.1, 4.8]; // seconds (lower is better)
      const jumpHeights = [32, 35, 28, 38, 26]; // inches (higher is better)

      const correlation = calculateCorrelation(dashTimes, jumpHeights);
      expect(correlation).toBeLessThan(0); // Should be negative correlation
      expect(Math.abs(correlation)).toBeGreaterThan(0.5); // Should be moderate to strong
    });
  });

  describe('calculateImprovement', () => {
    it('should return 0 for insufficient data', () => {
      expect(calculateImprovement([])).toBe(0);
      expect(calculateImprovement([{ value: 5, date: new Date() }])).toBe(0);
    });

    it('should calculate positive improvement rate', () => {
      const data = [
        { value: 30, date: new Date('2023-01-01') },
        { value: 35, date: new Date('2023-01-11') } // 10 days later, +5 improvement
      ];

      const improvement = calculateImprovement(data);
      expect(improvement).toBeCloseTo(0.5, 2); // 5 units over 10 days = 0.5 per day
    });

    it('should calculate negative improvement rate', () => {
      const data = [
        { value: 4.8, date: new Date('2023-01-01') },
        { value: 4.3, date: new Date('2023-02-01') } // 31 days later, -0.5 improvement
      ];

      const improvement = calculateImprovement(data);
      expect(improvement).toBeCloseTo(-0.016, 2); // -0.5 over ~31 days
    });

    it('should handle unsorted data', () => {
      const data = [
        { value: 35, date: new Date('2023-01-11') },
        { value: 30, date: new Date('2023-01-01') },
        { value: 38, date: new Date('2023-01-21') }
      ];

      const improvement = calculateImprovement(data);
      expect(improvement).toBeGreaterThan(0); // Should show positive trend from 30 to 38
    });
  });

  describe('getPerformanceQuadrantLabels', () => {
    it('should handle both higher is better metrics', () => {
      const labels = getPerformanceQuadrantLabels('VERTICAL_JUMP', 'RSI');

      expect(labels.topRight.color).toBe('green'); // Elite performance
      expect(labels.topRight.label).toContain('Elite');
      expect(labels.bottomLeft.color).toBe('red'); // Needs development
    });

    it('should handle mixed metric directions', () => {
      const labels = getPerformanceQuadrantLabels('DASH_40YD', 'VERTICAL_JUMP');

      expect(labels.topLeft.color).toBe('green'); // Fast dash + high jump = elite
      expect(labels.bottomRight.color).toBe('red'); // Slow dash + low jump = needs work
    });

    it('should handle both lower is better metrics', () => {
      const labels = getPerformanceQuadrantLabels('DASH_40YD', 'AGILITY_505');

      expect(labels.bottomLeft.color).toBe('green'); // Both low times = elite
      expect(labels.topRight.color).toBe('red'); // Both high times = needs work
    });

    it('should generate contextual labels for speed + power', () => {
      const labels = getPerformanceQuadrantLabels('DASH_40YD', 'VERTICAL_JUMP');

      expect(labels.topLeft.label).toContain('Fast'); // Should recognize speed context
      expect(labels.topLeft.label).toContain('Explosive'); // Should recognize power context
    });

    it('should fallback to generic labels for unknown metrics', () => {
      const labels = getPerformanceQuadrantLabels('UNKNOWN_METRIC_1', 'UNKNOWN_METRIC_2');

      expect(labels.topRight.label).toContain('Elite Performance');
    });
  });

  describe('processAthleteDatasets', () => {
    const mockAthleteTrends = {
      'athlete1': {
        athleteId: 'athlete1',
        athleteName: 'Test Athlete',
        metrics: {
          'DASH_40YD': [
            { value: 4.5, date: new Date('2023-01-01'), isPersonalBest: false },
            { value: 4.3, date: new Date('2023-01-15'), isPersonalBest: true }
          ],
          'VERTICAL_JUMP': [
            { value: 30, date: new Date('2023-01-01'), isPersonalBest: false },
            { value: 32, date: new Date('2023-01-08'), isPersonalBest: false }
          ]
        }
      }
    };

    it('should create datasets with connected points', () => {
      const datasets = processAthleteDatasets(
        mockAthleteTrends,
        'DASH_40YD',
        'VERTICAL_JUMP',
        ['rgba(59, 130, 246, 1)']
      );

      expect(datasets).toHaveLength(1);
      expect(datasets[0].label).toBe('Test Athlete');
      expect(datasets[0].data.length).toBeGreaterThan(0);
      expect(datasets[0].showLine).toBe(true);
    });

    it('should mark personal bests correctly', () => {
      const datasets = processAthleteDatasets(
        mockAthleteTrends,
        'DASH_40YD',
        'VERTICAL_JUMP',
        ['rgba(59, 130, 246, 1)']
      );

      const personalBestPoint = datasets[0].data.find((point: any) => point.isPersonalBest);
      expect(personalBestPoint).toBeDefined();
    });

    it('should mark interpolated points', () => {
      const datasets = processAthleteDatasets(
        mockAthleteTrends,
        'DASH_40YD',
        'VERTICAL_JUMP',
        ['rgba(59, 130, 246, 1)']
      );

      // Should have some interpolated points due to mismatched dates
      const interpolatedPoints = datasets[0].data.filter((point: any) => point.isInterpolated);
      expect(interpolatedPoints.length).toBeGreaterThan(0);
    });

    it('should highlight selected athlete', () => {
      const datasets = processAthleteDatasets(
        mockAthleteTrends,
        'DASH_40YD',
        'VERTICAL_JUMP',
        ['rgba(59, 130, 246, 1)'],
        'athlete1'
      );

      expect(datasets[0].borderWidth).toBe(3); // Highlighted border width
    });
  });

  describe('calculateAthleteAnalytics', () => {
    const mockValidAthletes = [{
      athleteId: 'athlete1',
      athleteName: 'Test Athlete',
      metrics: {
        'DASH_40YD': [
          { value: 4.8, date: new Date('2023-01-01') },
          { value: 4.5, date: new Date('2023-01-15') },
          { value: 4.3, date: new Date('2023-02-01') }
        ],
        'VERTICAL_JUMP': [
          { value: 28, date: new Date('2023-01-01') },
          { value: 30, date: new Date('2023-01-15') },
          { value: 32, date: new Date('2023-02-01') }
        ]
      }
    }];

    it('should return null for empty athlete list', () => {
      const analytics = calculateAthleteAnalytics([], 'DASH_40YD', 'VERTICAL_JUMP');
      expect(analytics).toBeNull();
    });

    it('should calculate correlation between metrics', () => {
      const analytics = calculateAthleteAnalytics(
        mockValidAthletes,
        'DASH_40YD',
        'VERTICAL_JUMP'
      );

      expect(analytics?.correlation).toBeDefined();
      expect(analytics?.correlation).toBeLessThan(0); // Should be negative (faster dash, higher jump)
    });

    it('should calculate improvement rates', () => {
      const analytics = calculateAthleteAnalytics(
        mockValidAthletes,
        'DASH_40YD',
        'VERTICAL_JUMP'
      );

      expect(analytics?.xImprovement).toBeLessThan(0); // Dash time improving (getting lower)
      expect(analytics?.yImprovement).toBeGreaterThan(0); // Jump height improving (getting higher)
    });

    it('should use provided statistics for means', () => {
      const mockStatistics = {
        'DASH_40YD': { mean: 4.6, median: 4.5, standardDeviation: 0.3, min: 4.0, max: 5.2 },
        'VERTICAL_JUMP': { mean: 30, median: 30, standardDeviation: 4, min: 22, max: 38 }
      };

      const analytics = calculateAthleteAnalytics(
        mockValidAthletes,
        'DASH_40YD',
        'VERTICAL_JUMP',
        mockStatistics
      );

      expect(analytics?.xMean).toBe(4.6);
      expect(analytics?.yMean).toBe(30);
    });

    it('should prioritize highlighted athlete', () => {
      const multipleAthletes = [
        ...mockValidAthletes,
        {
          athleteId: 'athlete2',
          athleteName: 'Other Athlete',
          metrics: { 'DASH_40YD': [], 'VERTICAL_JUMP': [] }
        }
      ];

      const analytics = calculateAthleteAnalytics(
        multipleAthletes,
        'DASH_40YD',
        'VERTICAL_JUMP',
        undefined,
        'athlete1'
      );

      expect(analytics?.athleteName).toBe('Test Athlete');
    });
  });
});

describe('Integration Tests', () => {
  it('should handle realistic athletic performance data', () => {
    // Simulate a season of training data for multiple athletes
    const seasonData = {
      'athlete1': {
        athleteId: 'athlete1',
        athleteName: 'Sprint Specialist',
        metrics: {
          'DASH_40YD': [
            { value: 4.8, date: new Date('2023-01-15'), isPersonalBest: false },
            { value: 4.6, date: new Date('2023-02-15'), isPersonalBest: false },
            { value: 4.4, date: new Date('2023-03-15'), isPersonalBest: true },
            { value: 4.5, date: new Date('2023-04-15'), isPersonalBest: false }
          ],
          'VERTICAL_JUMP': [
            { value: 30, date: new Date('2023-01-15'), isPersonalBest: false },
            { value: 32, date: new Date('2023-02-15'), isPersonalBest: false },
            { value: 35, date: new Date('2023-03-15'), isPersonalBest: true },
            { value: 34, date: new Date('2023-04-15'), isPersonalBest: false }
          ]
        }
      }
    };

    // Test dataset processing
    const datasets = processAthleteDatasets(
      seasonData,
      'DASH_40YD',
      'VERTICAL_JUMP',
      ['rgba(59, 130, 246, 1)']
    );

    expect(datasets[0].data.length).toBe(4); // Should have 4 connected points
    expect(datasets[0].data.filter((p: any) => p.isPersonalBest).length).toBeGreaterThan(0); // Should have PBs

    // Test analytics calculation
    const analytics = calculateAthleteAnalytics(
      Object.values(seasonData),
      'DASH_40YD',
      'VERTICAL_JUMP'
    );

    expect(analytics?.correlation).toBeLessThan(0); // Speed and power negatively correlated
    expect(analytics?.xImprovement).toBeLessThan(0); // Dash time improving
    expect(analytics?.yImprovement).toBeGreaterThan(0); // Jump height improving
  });

  it('should handle edge cases gracefully', () => {
    const edgeCaseData = {
      'athlete1': {
        athleteId: 'athlete1',
        athleteName: 'Inconsistent Athlete',
        metrics: {
          'DASH_40YD': [{ value: 4.5, date: new Date('2023-01-01') }],
          'VERTICAL_JUMP': [{ value: 30, date: new Date('2023-02-01') }] // Different dates
        }
      }
    };

    // Should handle non-overlapping dates
    const datasets = processAthleteDatasets(
      edgeCaseData,
      'DASH_40YD',
      'VERTICAL_JUMP',
      ['rgba(59, 130, 246, 1)']
    );

    expect(datasets[0].data.length).toBeGreaterThan(0);

    // Analytics should handle limited correlation data
    const analytics = calculateAthleteAnalytics(
      Object.values(edgeCaseData),
      'DASH_40YD',
      'VERTICAL_JUMP'
    );

    expect(analytics?.correlation).toBe(0); // No correlation possible with non-overlapping dates
  });
});