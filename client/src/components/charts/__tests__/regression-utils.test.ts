import { describe, it, expect } from 'vitest';

// Mock the regression calculation function from ScatterPlotChart
function calculateRegression(points: { x: number; y: number }[]) {
  if (points.length < 2) return null;

  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);

  const slope = (n * sumXY - sumX * sumY) / (n * sumX2 - sumX * sumX);
  const intercept = (sumY - slope * sumX) / n;

  return { slope, intercept };
}

// Mock correlation calculation function
function calculateCorrelation(points: { x: number; y: number }[]) {
  if (points.length < 2) return null;

  const n = points.length;
  const sumX = points.reduce((sum, p) => sum + p.x, 0);
  const sumY = points.reduce((sum, p) => sum + p.y, 0);
  const sumXY = points.reduce((sum, p) => sum + p.x * p.y, 0);
  const sumX2 = points.reduce((sum, p) => sum + p.x * p.x, 0);
  const sumY2 = points.reduce((sum, p) => sum + p.y * p.y, 0);

  const numerator = n * sumXY - sumX * sumY;
  const denominator = Math.sqrt((n * sumX2 - sumX * sumX) * (n * sumY2 - sumY * sumY));

  return denominator === 0 ? 0 : numerator / denominator;
}

describe('Regression Utilities', () => {
  describe('calculateRegression', () => {
    it('should return null for insufficient data points', () => {
      expect(calculateRegression([])).toBeNull();
      expect(calculateRegression([{ x: 1, y: 2 }])).toBeNull();
    });

    it('should calculate correct slope and intercept for perfect positive correlation', () => {
      const points = [
        { x: 1, y: 1 },
        { x: 2, y: 2 },
        { x: 3, y: 3 },
        { x: 4, y: 4 }
      ];

      const result = calculateRegression(points);
      expect(result).not.toBeNull();
      expect(result!.slope).toBeCloseTo(1, 5);
      expect(result!.intercept).toBeCloseTo(0, 5);
    });

    it('should calculate correct slope and intercept for perfect negative correlation', () => {
      const points = [
        { x: 1, y: 4 },
        { x: 2, y: 3 },
        { x: 3, y: 2 },
        { x: 4, y: 1 }
      ];

      const result = calculateRegression(points);
      expect(result).not.toBeNull();
      expect(result!.slope).toBeCloseTo(-1, 5);
      expect(result!.intercept).toBeCloseTo(5, 5);
    });

    it('should handle horizontal line (zero slope)', () => {
      const points = [
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 3, y: 5 },
        { x: 4, y: 5 }
      ];

      const result = calculateRegression(points);
      expect(result).not.toBeNull();
      expect(result!.slope).toBeCloseTo(0, 5);
      expect(result!.intercept).toBeCloseTo(5, 5);
    });

    it('should handle real-world athletic performance data', () => {
      // Simulated athlete performance data: 40-yard dash vs vertical jump
      const points = [
        { x: 4.5, y: 35.2 }, // Faster 40 time, higher vertical jump
        { x: 4.8, y: 32.1 },
        { x: 5.1, y: 28.9 },
        { x: 5.4, y: 25.6 },
        { x: 5.7, y: 22.3 }
      ];

      const result = calculateRegression(points);
      expect(result).not.toBeNull();
      // Should have negative slope (faster time = higher vertical)
      expect(result!.slope).toBeLessThan(0);
      expect(Math.abs(result!.slope)).toBeGreaterThan(0);
      expect(result!.intercept).toBeGreaterThan(0);
    });

    it('should handle identical x values gracefully', () => {
      const points = [
        { x: 5, y: 10 },
        { x: 5, y: 20 },
        { x: 5, y: 30 }
      ];

      const result = calculateRegression(points);
      // Should handle division by zero case
      expect(result).toBeDefined();
      expect(isNaN(result!.slope) || !isFinite(result!.slope)).toBe(true);
    });
  });

  describe('calculateCorrelation', () => {
    it('should return null for insufficient data points', () => {
      expect(calculateCorrelation([])).toBeNull();
      expect(calculateCorrelation([{ x: 1, y: 2 }])).toBeNull();
    });

    it('should return 1 for perfect positive correlation', () => {
      const points = [
        { x: 1, y: 2 },
        { x: 2, y: 4 },
        { x: 3, y: 6 },
        { x: 4, y: 8 }
      ];

      const result = calculateCorrelation(points);
      expect(result).toBeCloseTo(1, 5);
    });

    it('should return -1 for perfect negative correlation', () => {
      const points = [
        { x: 1, y: 8 },
        { x: 2, y: 6 },
        { x: 3, y: 4 },
        { x: 4, y: 2 }
      ];

      const result = calculateCorrelation(points);
      expect(result).toBeCloseTo(-1, 5);
    });

    it('should return 0 for no correlation', () => {
      const points = [
        { x: 1, y: 5 },
        { x: 2, y: 5 },
        { x: 3, y: 5 },
        { x: 4, y: 5 }
      ];

      const result = calculateCorrelation(points);
      expect(result).toBeCloseTo(0, 5);
    });

    it('should calculate realistic correlation for athletic performance metrics', () => {
      // Simulated data showing moderate negative correlation between 40-yard dash time and vertical jump
      const points = [
        { x: 4.3, y: 38.5 },
        { x: 4.5, y: 36.2 },
        { x: 4.7, y: 33.8 },
        { x: 4.9, y: 31.5 },
        { x: 5.1, y: 29.2 },
        { x: 5.3, y: 26.9 },
        { x: 5.5, y: 24.6 }
      ];

      const result = calculateCorrelation(points);
      expect(result).not.toBeNull();
      expect(result).toBeLessThan(0); // Negative correlation
      expect(result).toBeGreaterThan(-1); // Not perfect correlation
      expect(Math.abs(result!)).toBeGreaterThan(0.5); // Strong correlation
    });

    it('should handle edge cases gracefully', () => {
      // All same values
      const sameValues = [
        { x: 5, y: 5 },
        { x: 5, y: 5 },
        { x: 5, y: 5 }
      ];

      const result = calculateCorrelation(sameValues);
      expect(result).toBe(0); // Should handle division by zero
    });
  });

  describe('Edge Cases and Robustness', () => {
    it('should handle very large numbers', () => {
      const points = [
        { x: 1000000, y: 2000000 },
        { x: 2000000, y: 4000000 },
        { x: 3000000, y: 6000000 }
      ];

      const regression = calculateRegression(points);
      const correlation = calculateCorrelation(points);

      expect(regression).not.toBeNull();
      expect(correlation).not.toBeNull();
      expect(isFinite(regression!.slope)).toBe(true);
      expect(isFinite(regression!.intercept)).toBe(true);
      expect(isFinite(correlation!)).toBe(true);
    });

    it('should handle very small decimal numbers', () => {
      const points = [
        { x: 0.001, y: 0.002 },
        { x: 0.002, y: 0.004 },
        { x: 0.003, y: 0.006 }
      ];

      const regression = calculateRegression(points);
      const correlation = calculateCorrelation(points);

      expect(regression).not.toBeNull();
      expect(correlation).not.toBeNull();
      expect(isFinite(regression!.slope)).toBe(true);
      expect(isFinite(regression!.intercept)).toBe(true);
      expect(isFinite(correlation!)).toBe(true);
    });

    it('should handle negative values', () => {
      const points = [
        { x: -10, y: -20 },
        { x: -5, y: -10 },
        { x: 0, y: 0 },
        { x: 5, y: 10 },
        { x: 10, y: 20 }
      ];

      const regression = calculateRegression(points);
      const correlation = calculateCorrelation(points);

      expect(regression).not.toBeNull();
      expect(correlation).toBeCloseTo(1, 5);
      expect(regression!.slope).toBeCloseTo(2, 5);
      expect(regression!.intercept).toBeCloseTo(0, 5);
    });
  });
});