/**
 * Sprint F-V Profile Analysis Engine
 *
 * Pure functions for interpreting computed F-V profiles:
 * 1. Classification (force-deficit / velocity-deficit / well-balanced)
 * 2. Optimal profile gap analysis (Samozino et al., 2016)
 * 3. Session-over-session delta analysis with alerts
 *
 * No database or side effects — independently testable.
 */

// ============================================================================
// Types
// ============================================================================

export interface ProfileClassification {
  classification: 'force-deficit' | 'velocity-deficit' | 'well-balanced';
  imbalancePercent: number;
  dominantQuality: 'force' | 'velocity' | 'balanced';
  trainingRecommendations: string[];
  explanation: string;
}

export interface OptimalGapResult {
  optimalF0: number;
  optimalV0: number;
  optimalSlope: number;
  f0Gap: number;
  v0Gap: number;
  f0GapPercent: number;
  v0GapPercent: number;
  estimatedTimeImprovement: number;
  recommendation: string;
}

export interface DeltaEntry {
  absolute: number;
  percent: number;
  direction: 'improved' | 'declined' | 'stable';
}

export interface DeltaResult {
  f0Delta: DeltaEntry;
  v0Delta: DeltaEntry;
  pmaxDelta: DeltaEntry;
  slopeDelta: DeltaEntry;
  rfPeakDelta: DeltaEntry;
  drfDelta: DeltaEntry;
  overallTrend: string;
  alerts: string[];
  daysBetweenSessions: number;
}

interface ProfileValues {
  f0Rel: number;
  v0: number;
  pmaxRel: number;
  fvSlope: number;
  rfPeak: number;
  drf: number;
  date: string;
}

// ============================================================================
// Analysis 1: Classification & Training Recommendations
// ============================================================================

/**
 * Compute the optimal F-V slope for a given sprint distance.
 *
 * Based on Samozino et al. (2016): the optimal slope depends on
 * the ratio of acceleration distance to maximum velocity. For shorter
 * sprints, the optimal profile is more force-oriented (steeper slope).
 *
 * Approximation: SFV_opt ≈ -(π / (4 * distance)) * Vmax_typical²
 * Simplified to empirical reference values per distance range.
 */
function getOptimalSlope(sprintDistanceM: number): number {
  // Empirical optimal SFV values (from Samozino et al., 2016)
  // More negative = steeper = more force-oriented
  if (sprintDistanceM <= 20) return -0.80;
  if (sprintDistanceM <= 30) return -0.60;
  if (sprintDistanceM <= 40) return -0.50;
  if (sprintDistanceM <= 60) return -0.45;
  return -0.40; // 100m+
}

const FORCE_DEFICIT_RECS = [
  'Prioritize overspeed training (downhill sprints, assisted towing)',
  'Reduce heavy sled work volume temporarily',
  'Focus on fast-twitch recruitment with short, maximal sprints (10-20m)',
  'Plyometric emphasis on reactive/elastic movements (drop jumps, bounds)',
  'Consider assisted sprint training to develop higher movement velocities',
];

const VELOCITY_DEFICIT_RECS = [
  'Add heavy resisted sprint training (sled pulls at 50-80% BW)',
  'Increase maximal strength work (squats, hip thrusts, deadlifts)',
  'Hill sprints at moderate grades (5-10°) for force application',
  'Contrast training: heavy lift followed by unresisted sprint',
  'Emphasize horizontal force production in gym work',
];

const BALANCED_RECS = [
  'Maintain current training balance between force and velocity work',
  'Focus on Pmax development through mixed training methods',
  'Monitor F-V profile regularly for drift toward either deficit',
  'Consider sport-specific sprint demands for further optimization',
];

export function classifyProfile(
  f0Rel: number,
  v0: number,
  sprintDistanceM: number,
): ProfileClassification {
  const actualSlope = -f0Rel / v0;
  const optimalSlope = getOptimalSlope(sprintDistanceM);

  // Percent difference from optimal (positive = steeper than optimal = force-dominant)
  const slopeDiff = ((actualSlope - optimalSlope) / Math.abs(optimalSlope)) * 100;

  const THRESHOLD = 10; // ±10% defines "well-balanced"

  if (slopeDiff < -THRESHOLD) {
    // Actual slope is more negative (steeper) than optimal → force-dominant → VELOCITY-deficit
    // e.g., optimal = -0.60, actual = -1.20 → slopeDiff = -100%
    // Morin convention: "velocity-deficit" = athlete lacks velocity (has excess force)
    return {
      classification: 'velocity-deficit',
      imbalancePercent: Math.abs(slopeDiff),
      dominantQuality: 'force',
      trainingRecommendations: FORCE_DEFICIT_RECS,
      explanation: `This athlete's F-V profile is force-dominant — strong acceleration but limited top-end speed. ` +
        `The F-V slope is ${Math.abs(slopeDiff).toFixed(0)}% steeper than optimal for a ${sprintDistanceM.toFixed(0)}m sprint.`,
    };
  }

  if (slopeDiff > THRESHOLD) {
    // Actual slope is less negative (shallower) than optimal → velocity-dominant → FORCE-deficit
    // e.g., optimal = -0.60, actual = -0.40 → slopeDiff = +33%
    // Morin convention: "force-deficit" = athlete lacks force (has excess velocity)
    return {
      classification: 'force-deficit',
      imbalancePercent: Math.abs(slopeDiff),
      dominantQuality: 'velocity',
      trainingRecommendations: VELOCITY_DEFICIT_RECS,
      explanation: `This athlete's F-V profile is velocity-dominant — good top-end speed but limited acceleration force. ` +
        `The F-V slope is ${Math.abs(slopeDiff).toFixed(0)}% shallower than optimal for a ${sprintDistanceM.toFixed(0)}m sprint.`,
    };
  }

  return {
    classification: 'well-balanced',
    imbalancePercent: Math.abs(slopeDiff),
    dominantQuality: 'balanced',
    trainingRecommendations: BALANCED_RECS,
    explanation: `This athlete's F-V profile is well-balanced for a ${sprintDistanceM.toFixed(0)}m sprint. ` +
      `The F-V slope is within ${Math.abs(slopeDiff).toFixed(0)}% of the optimal ratio.`,
  };
}

// ============================================================================
// Analysis 2: Optimal Profile Gap Analysis
// ============================================================================

/**
 * Compute the gap between the athlete's actual F-V profile and the
 * theoretical optimal for their sprint distance and Pmax.
 *
 * The optimal F0/V0 ratio maximizes performance for a given Pmax
 * (Samozino et al., 2016).
 */
export function computeOptimalGap(
  f0Rel: number,
  v0: number,
  pmaxRel: number,
  bodyMassKg: number,
  sprintDistanceM: number,
): OptimalGapResult {
  const optimalSlope = getOptimalSlope(sprintDistanceM);

  // Given Pmax = F0 * V0 / 4 and optimal slope = -F0/V0:
  // F0_opt = sqrt(4 * Pmax * |slope_opt|)
  // V0_opt = sqrt(4 * Pmax / |slope_opt|)
  const absSlope = Math.abs(optimalSlope);
  const optimalF0 = Math.sqrt(4 * pmaxRel * absSlope);
  const optimalV0 = Math.sqrt(4 * pmaxRel / absSlope);

  const f0Gap = f0Rel - optimalF0;
  const v0Gap = v0 - optimalV0;
  const f0GapPercent = optimalF0 > 0 ? (f0Gap / optimalF0) * 100 : 0;
  const v0GapPercent = optimalV0 > 0 ? (v0Gap / optimalV0) * 100 : 0;

  // Estimate time improvement if the athlete moved to optimal profile
  // while keeping the same Pmax.
  // Use simplified sprint time model: t ≈ d/V0 + tau for the dominant term
  const actualTau = v0 / f0Rel;
  const optimalTau = optimalV0 / optimalF0;
  const actualTime = estimateSprintTime(sprintDistanceM, v0, actualTau);
  const optimalTime = estimateSprintTime(sprintDistanceM, optimalV0, optimalTau);
  const estimatedTimeImprovement = Math.max(0, actualTime - optimalTime);

  // Build recommendation
  let recommendation: string;
  if (f0Gap > 0 && v0Gap < 0) {
    recommendation = `Increasing V0 by ${Math.abs(v0Gap).toFixed(2)} m/s (while maintaining Pmax) ` +
      `could improve ${sprintDistanceM.toFixed(0)}m time by ~${estimatedTimeImprovement.toFixed(2)}s.`;
  } else if (f0Gap < 0 && v0Gap > 0) {
    recommendation = `Increasing F0 by ${Math.abs(f0Gap).toFixed(2)} N/kg (while maintaining Pmax) ` +
      `could improve ${sprintDistanceM.toFixed(0)}m time by ~${estimatedTimeImprovement.toFixed(2)}s.`;
  } else {
    recommendation = `Profile is near optimal. Estimated time improvement from further balancing: ~${estimatedTimeImprovement.toFixed(2)}s.`;
  }

  return {
    optimalF0,
    optimalV0,
    optimalSlope,
    f0Gap,
    v0Gap,
    f0GapPercent,
    v0GapPercent,
    estimatedTimeImprovement,
    recommendation,
  };
}

/**
 * Estimate sprint time using the analytical model.
 * t ≈ d/vmax + tau * ln(1 / (1 - d/(vmax*t)))
 * Solved iteratively (Newton's method, ~5 iterations converges).
 */
function estimateSprintTime(distanceM: number, vmax: number, tau: number): number {
  if (vmax <= 0 || tau <= 0) return distanceM / 5; // fallback for degenerate inputs

  let t = distanceM / (vmax * 0.7);

  for (let iter = 0; iter < 20; iter++) {
    const dPred = vmax * (t + tau * Math.exp(-t / tau) - tau);
    const v = vmax * (1 - Math.exp(-t / tau));
    if (v < 1e-6) { t += 0.01; continue; } // guard against near-zero velocity
    const dt = (distanceM - dPred) / v;
    const clampedDt = Math.max(-0.5, Math.min(0.5, dt));
    t += clampedDt;
    if (Math.abs(dt) < 1e-6) break;
  }

  return t;
}

// ============================================================================
// Analysis 3: Session-over-Session Delta Analysis
// ============================================================================

const STABLE_THRESHOLD = 1;   // < 1% change = stable
const ALERT_THRESHOLD = 5;    // > 5% decline = alert

/**
 * Compute deltas between current and previous profile.
 */
export function computeDeltas(
  current: ProfileValues,
  previous: ProfileValues,
): DeltaResult {
  const f0Delta = computeDelta(current.f0Rel, previous.f0Rel, 'higher');
  const v0Delta = computeDelta(current.v0, previous.v0, 'higher');
  const pmaxDelta = computeDelta(current.pmaxRel, previous.pmaxRel, 'higher');
  const rfPeakDelta = computeDelta(current.rfPeak, previous.rfPeak, 'higher');
  // For slope: closer to 0 isn't always better; closer to optimal is better
  // Simplified: treat as magnitude (less negative = higher)
  const slopeDelta = computeDelta(current.fvSlope, previous.fvSlope, 'closer-to-zero');
  // DRF: closer to 0 is better (less decrease in RF)
  const drfDelta = computeDelta(current.drf, previous.drf, 'closer-to-zero');

  const daysBetween = Math.round(
    (new Date(current.date).getTime() - new Date(previous.date).getTime()) / (1000 * 60 * 60 * 24)
  );

  // Build alerts
  const alerts: string[] = [];
  if (v0Delta.direction === 'declined' && Math.abs(v0Delta.percent) > ALERT_THRESHOLD) {
    alerts.push(`V0 declined ${Math.abs(v0Delta.percent).toFixed(1)}% since last session`);
  }
  if (f0Delta.direction === 'declined' && Math.abs(f0Delta.percent) > ALERT_THRESHOLD) {
    alerts.push(`F0 declined ${Math.abs(f0Delta.percent).toFixed(1)}% since last session`);
  }
  if (pmaxDelta.direction === 'declined' && Math.abs(pmaxDelta.percent) > ALERT_THRESHOLD) {
    alerts.push(`Pmax declined ${Math.abs(pmaxDelta.percent).toFixed(1)}% since last session`);
  }

  // Overall trend
  const improving = [f0Delta, v0Delta, pmaxDelta].filter(d => d.direction === 'improved').length;
  const declining = [f0Delta, v0Delta, pmaxDelta].filter(d => d.direction === 'declined').length;

  let overallTrend: string;
  if (improving >= 2 && declining === 0) {
    overallTrend = 'Overall improvement across key metrics';
  } else if (declining >= 2 && improving === 0) {
    overallTrend = 'Overall decline across key metrics — consider recovery or training load';
  } else {
    const parts: string[] = [];
    if (f0Delta.direction === 'improved') parts.push('force capacity improving');
    else if (f0Delta.direction === 'declined') parts.push('force capacity declining');
    if (v0Delta.direction === 'improved') parts.push('velocity improving');
    else if (v0Delta.direction === 'declined') parts.push('velocity declining');
    if (parts.length === 0) parts.push('Profile largely stable');
    overallTrend = parts.join(', ').replace(/^./, c => c.toUpperCase());
  }

  return {
    f0Delta,
    v0Delta,
    pmaxDelta,
    slopeDelta,
    rfPeakDelta,
    drfDelta,
    overallTrend,
    alerts,
    daysBetweenSessions: daysBetween,
  };
}

function computeDelta(
  current: number,
  previous: number,
  direction: 'higher' | 'closer-to-zero',
): DeltaEntry {
  const absolute = current - previous;
  const percent = previous !== 0 ? (absolute / Math.abs(previous)) * 100 : 0;

  let improved: boolean;
  if (direction === 'higher') {
    improved = current > previous;
  } else {
    // closer-to-zero: smaller absolute value is better
    improved = Math.abs(current) < Math.abs(previous);
  }

  let dir: 'improved' | 'declined' | 'stable';
  if (Math.abs(percent) < STABLE_THRESHOLD) {
    dir = 'stable';
  } else if (improved) {
    dir = 'improved';
  } else {
    dir = 'declined';
  }

  return { absolute, percent, direction: dir };
}
