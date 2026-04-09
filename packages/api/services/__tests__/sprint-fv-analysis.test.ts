import { describe, it, expect } from 'vitest';
import {
  classifyProfile,
  computeOptimalGap,
  computeDeltas,
  type ProfileClassification,
  type OptimalGapResult,
  type DeltaResult,
} from '../sprint-fv-analysis';

describe('classifyProfile', () => {
  // Sprint distance in meters for a ~30yd test (27.432m)
  const sprintDistance = 27.432;

  it('should classify a velocity-deficit profile (steep slope, force-dominant)', () => {
    // High F0/V0 ratio → steep slope → force-dominant → velocity-deficit (Morin convention)
    // slope = -9.5/7.5 = -1.27, optimal ≈ -0.60 → much steeper → lacks velocity
    const result = classifyProfile(9.5, 7.5, sprintDistance);
    expect(result.classification).toBe('velocity-deficit');
    expect(result.dominantQuality).toBe('force');
    expect(result.imbalancePercent).toBeGreaterThan(10);
    expect(result.trainingRecommendations.length).toBeGreaterThanOrEqual(3);
    expect(result.explanation).toBeTruthy();
  });

  it('should classify a force-deficit profile (shallow slope, velocity-dominant)', () => {
    // Low F0/V0 ratio → shallow slope → velocity-dominant → force-deficit (Morin convention)
    // slope = -3.0/10.0 = -0.30, optimal ≈ -0.60 → much shallower → lacks force
    const result = classifyProfile(3.0, 10.0, sprintDistance);
    expect(result.classification).toBe('force-deficit');
    expect(result.dominantQuality).toBe('velocity');
    expect(result.imbalancePercent).toBeGreaterThan(10);
    expect(result.trainingRecommendations.length).toBeGreaterThanOrEqual(3);
  });

  it('should classify a well-balanced profile', () => {
    // F0/V0 ratio close to optimal: slope = -5.4/9.0 = -0.60 ≈ optimal
    const result = classifyProfile(5.4, 9.0, sprintDistance);
    expect(result.classification).toBe('well-balanced');
    expect(result.dominantQuality).toBe('balanced');
    expect(result.imbalancePercent).toBeLessThanOrEqual(10);
  });

  it('should include actionable training recommendations', () => {
    // Velocity-deficit (steep slope, force-dominant) → needs overspeed/velocity work
    const velDeficit = classifyProfile(9.5, 7.5, sprintDistance);
    const recsText = velDeficit.trainingRecommendations.join(' ').toLowerCase();
    expect(recsText).toMatch(/overspeed|velocity|assisted|fast/);

    // Force-deficit (shallow slope, velocity-dominant) → needs resistance/strength
    const forceDeficit = classifyProfile(3.0, 10.0, sprintDistance);
    const recsText2 = forceDeficit.trainingRecommendations.join(' ').toLowerCase();
    expect(recsText2).toMatch(/resist|sled|strength|heavy/);
  });

  it('should work with different sprint distances', () => {
    // 40yd = 36.576m — longer distance shifts the optimal balance
    const result40yd = classifyProfile(7.0, 9.5, 36.576);
    expect(result40yd).toBeDefined();
    expect(['force-deficit', 'velocity-deficit', 'well-balanced']).toContain(result40yd.classification);
  });
});

describe('computeOptimalGap', () => {
  const sprintDistance = 27.432; // ~30yd

  it('should compute optimal F0 and V0 targets', () => {
    const result = computeOptimalGap(7.0, 9.0, 15.75, 80, sprintDistance);
    expect(result.optimalF0).toBeGreaterThan(0);
    expect(result.optimalV0).toBeGreaterThan(0);
    expect(result.optimalSlope).toBeLessThan(0);
  });

  it('should show positive gap when F0 exceeds optimal', () => {
    // Very high F0 for this V0 → F0 surplus
    const result = computeOptimalGap(10.0, 8.0, 20.0, 80, sprintDistance);
    expect(result.f0Gap).toBeGreaterThan(0); // surplus
    expect(result.v0Gap).toBeLessThan(0); // deficit
  });

  it('should estimate time improvement > 0 for imbalanced profiles', () => {
    const result = computeOptimalGap(10.0, 7.0, 17.5, 80, sprintDistance);
    expect(result.estimatedTimeImprovement).toBeGreaterThan(0);
  });

  it('should estimate near-zero time improvement for balanced profiles', () => {
    const result = computeOptimalGap(7.5, 9.0, 16.875, 80, sprintDistance);
    expect(result.estimatedTimeImprovement).toBeLessThan(0.15);
  });

  it('should include a recommendation string', () => {
    const result = computeOptimalGap(10.0, 7.0, 17.5, 80, sprintDistance);
    expect(result.recommendation).toBeTruthy();
    expect(result.recommendation.length).toBeGreaterThan(10);
  });
});

describe('computeDeltas', () => {
  const currentProfile = {
    f0Rel: 7.5, v0: 9.0, pmaxRel: 16.875,
    fvSlope: -0.833, rfPeak: 0.48, drf: -0.08,
    date: '2026-04-08',
  };

  const previousProfile = {
    f0Rel: 7.0, v0: 8.8, pmaxRel: 15.4,
    fvSlope: -0.795, rfPeak: 0.46, drf: -0.085,
    date: '2026-03-15',
  };

  it('should compute absolute and percent deltas', () => {
    const result = computeDeltas(currentProfile, previousProfile);
    expect(result.f0Delta.absolute).toBeCloseTo(0.5, 1);
    expect(result.f0Delta.percent).toBeCloseTo(7.14, 0);
    expect(result.v0Delta.absolute).toBeCloseTo(0.2, 1);
  });

  it('should mark improvements correctly', () => {
    const result = computeDeltas(currentProfile, previousProfile);
    // F0, V0, Pmax all increased → improved
    expect(result.f0Delta.direction).toBe('improved');
    expect(result.v0Delta.direction).toBe('improved');
    expect(result.pmaxDelta.direction).toBe('improved');
  });

  it('should mark declines correctly', () => {
    const declined = { ...currentProfile, f0Rel: 6.5 };
    const result = computeDeltas(declined, previousProfile);
    expect(result.f0Delta.direction).toBe('declined');
  });

  it('should mark stable when change is < 1%', () => {
    const stable = { ...currentProfile, f0Rel: 7.05 }; // 0.7% change from 7.0
    const result = computeDeltas(stable, previousProfile);
    expect(result.f0Delta.direction).toBe('stable');
  });

  it('should compute days between sessions', () => {
    const result = computeDeltas(currentProfile, previousProfile);
    expect(result.daysBetweenSessions).toBe(24);
  });

  it('should include overall trend summary', () => {
    const result = computeDeltas(currentProfile, previousProfile);
    expect(result.overallTrend).toBeTruthy();
  });

  it('should flag significant declines as alerts', () => {
    const bigDecline = { ...currentProfile, v0: 8.0 }; // >5% decline from 8.8
    const result = computeDeltas(bigDecline, previousProfile);
    expect(result.alerts.length).toBeGreaterThan(0);
    expect(result.alerts.some(a => a.toLowerCase().includes('v0'))).toBe(true);
  });
});
