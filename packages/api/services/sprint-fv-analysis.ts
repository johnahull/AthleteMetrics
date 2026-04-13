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
  sprintDistanceM: number;
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
// Parameter Plausibility Validation
// ============================================================================

/**
 * Check computed parameters against literature ranges and return warnings
 * for values that exceed physiological norms.
 *
 * Thresholds based on Morin et al. (2011, 2016), Samozino et al. (2016):
 * - F0_rel: trained 5–9 N/kg, elite 8–12 N/kg → warn > 14
 * - tau: trained 1.0–1.5s, elite 0.8–1.2s → warn < 0.8
 * - V0: normal athletic range 5–12 m/s → warn < 5
 * - Pmax_rel: trained 10–20, elite 20–30 W/kg → warn > 30
 */
export function validateParameters(params: {
  f0Rel: number;
  v0: number;
  tau: number;
  pmaxRel: number;
}): string[] {
  const warnings: string[] = [];

  if (params.f0Rel > 14) {
    warnings.push(
      `F₀ relative (${params.f0Rel.toFixed(1)} N/kg) exceeds the elite sprinter range (8–12 N/kg). ` +
      `This may indicate the sprint distance is too short for reliable model fitting.`
    );
  }

  if (params.tau < 0.75) {
    warnings.push(
      `Time constant τ (${params.tau.toFixed(2)}s) is at the physiological lower limit. ` +
      `The sprint distance may be too short for reliable max-velocity estimation.`
    );
  }

  if (params.v0 < 5) {
    warnings.push(
      `V₀ (${params.v0.toFixed(1)} m/s) is below the normal athletic range (5+ m/s). ` +
      `Check that split times are accurate.`
    );
  }

  if (params.pmaxRel > 30) {
    warnings.push(
      `Pmax relative (${params.pmaxRel.toFixed(1)} W/kg) exceeds the elite range (20–30 W/kg). ` +
      `This is likely inflated by extreme F₀ or V₀ values.`
    );
  }

  return warnings;
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
// Analysis 2: Acceleration Profile (from velocity-time curve)
// ============================================================================

export interface AccelerationProfile {
  tau: number;
  timeTo90Pct: number;
  timeTo95Pct: number;
  accelerationPhaseM: number;
  tauRating: 'explosive' | 'fast' | 'average' | 'slow';
  trainingInsights: string[];
}

/**
 * Analyze the velocity-time curve for training-relevant insights.
 *
 * Tau (time constant) tells you how quickly an athlete reaches top speed.
 * Lower tau = faster acceleration = better force application early in the sprint.
 */
export function analyzeAcceleration(
  vmax: number,
  tau: number,
  sprintDistanceM: number,
): AccelerationProfile {
  // Time to reach % of Vmax: v(t) = Vmax(1 - e^(-t/τ))
  // Solving: t = -τ * ln(1 - fraction)
  const timeTo90Pct = -tau * Math.log(1 - 0.90);
  const timeTo95Pct = -tau * Math.log(1 - 0.95);

  // Distance covered during acceleration phase (to 95% Vmax)
  const accelerationPhaseM = vmax * (timeTo95Pct + tau * Math.exp(-timeTo95Pct / tau) - tau);

  // Rate tau against population norms (Morin et al. data, trained sprinters)
  // tau < 0.9s = explosive, 0.9-1.1 = fast, 1.1-1.4 = average, > 1.4 = slow
  let tauRating: AccelerationProfile['tauRating'];
  if (tau < 0.9) tauRating = 'explosive';
  else if (tau < 1.1) tauRating = 'fast';
  else if (tau < 1.4) tauRating = 'average';
  else tauRating = 'slow';

  const trainingInsights: string[] = [];

  if (tauRating === 'slow') {
    trainingInsights.push(
      'Acceleration is below average — prioritize block starts, short sled pulls (20-40% BW), and first-step explosiveness drills',
    );
    trainingInsights.push(
      'Strengthen hip extensors (glutes/hamstrings) for horizontal force in the drive phase',
    );
  } else if (tauRating === 'average') {
    trainingInsights.push(
      'Acceleration is adequate — targeted work on the first 10m can yield meaningful gains',
    );
    trainingInsights.push(
      'Contrast training (heavy squat → 10m sprint) can sharpen early acceleration',
    );
  } else if (tauRating === 'fast') {
    trainingInsights.push(
      'Strong acceleration — maintain with regular short sprint work and max-strength training',
    );
  } else {
    trainingInsights.push(
      'Elite-level acceleration — focus on maintaining this quality while developing top speed',
    );
  }

  // Sprint distance context
  const accelPct = (accelerationPhaseM / sprintDistanceM) * 100;
  if (accelPct > 90) {
    trainingInsights.push(
      `The athlete is still accelerating through ${accelPct.toFixed(0)}% of the ${sprintDistanceM.toFixed(0)}m sprint — top speed is never fully reached. Longer sprint distances would better reveal max velocity capacity.`,
    );
  } else if (accelPct > 70) {
    trainingInsights.push(
      `Acceleration covers ~${accelPct.toFixed(0)}% of the sprint, leaving a short max-velocity phase. This is typical for distances under 30m.`,
    );
  }

  return { tau, timeTo90Pct, timeTo95Pct, accelerationPhaseM, tauRating, trainingInsights };
}

// ============================================================================
// Analysis 3: Power Profile (from P-V curve)
// ============================================================================

export interface PowerProfile {
  pmaxRel: number;
  velocityAtPmax: number;
  rfPeak: number;
  rfPeakRating: 'excellent' | 'good' | 'average' | 'poor';
  drf: number;
  drfRating: 'excellent' | 'good' | 'average' | 'poor';
  trainingInsights: string[];
}

/**
 * Analyze the power-velocity curve and force application efficiency.
 *
 * RF Peak: how well the athlete directs force horizontally at sprint start.
 * DRF: how quickly force application efficiency drops as speed increases.
 */
export function analyzePower(
  f0Rel: number,
  v0: number,
  pmaxRel: number,
  rfPeak: number,
  drf: number,
): PowerProfile {
  const velocityAtPmax = v0 / 2;

  // RF Peak norms (model-computed from F0_rel): > 0.71 excellent, 0.63-0.71 good, 0.52-0.63 average, < 0.52 poor
  // Note: these are higher than empirical force-plate norms because RF_peak = F0/(F0²+g²)^0.5
  let rfPeakRating: PowerProfile['rfPeakRating'];
  if (rfPeak > 0.71) rfPeakRating = 'excellent';
  else if (rfPeak > 0.63) rfPeakRating = 'good';
  else if (rfPeak > 0.52) rfPeakRating = 'average';
  else rfPeakRating = 'poor';

  // DRF norms (always negative): closer to 0 is better
  // > -0.06 excellent, -0.06 to -0.08 good, -0.08 to -0.10 average, < -0.10 poor
  let drfRating: PowerProfile['drfRating'];
  const absDrf = Math.abs(drf);
  if (absDrf < 0.06) drfRating = 'excellent';
  else if (absDrf < 0.08) drfRating = 'good';
  else if (absDrf < 0.10) drfRating = 'average';
  else drfRating = 'poor';

  const trainingInsights: string[] = [];

  // Pmax context
  if (pmaxRel > 25) {
    trainingInsights.push(
      `Pmax of ${pmaxRel.toFixed(1)} W/kg is elite-level — this athlete has exceptional sprint power output`,
    );
  } else if (pmaxRel > 20) {
    trainingInsights.push(
      `Pmax of ${pmaxRel.toFixed(1)} W/kg is strong — near elite sprint power. Continue combined force and velocity training`,
    );
  } else if (pmaxRel > 15) {
    trainingInsights.push(
      `Pmax of ${pmaxRel.toFixed(1)} W/kg is average for trained athletes — improvement will come from addressing the weaker side of the F-V profile`,
    );
  } else {
    trainingInsights.push(
      `Pmax of ${pmaxRel.toFixed(1)} W/kg suggests room for significant improvement — general strength and power training should be a priority`,
    );
  }

  // RF Peak insights
  if (rfPeakRating === 'poor' || rfPeakRating === 'average') {
    trainingInsights.push(
      `RF Peak (${(rfPeak * 100).toFixed(0)}%) is ${rfPeakRating} — the athlete is losing force to vertical push-off. Focus on forward lean, hip extension angle, and sled marches to improve horizontal force direction`,
    );
  } else if (rfPeakRating === 'excellent') {
    trainingInsights.push(
      `RF Peak (${(rfPeak * 100).toFixed(0)}%) is excellent — strong horizontal force application at sprint start`,
    );
  }

  // DRF insights
  if (drfRating === 'poor' || drfRating === 'average') {
    trainingInsights.push(
      `DRF (${drf.toFixed(3)}) indicates force application drops off quickly as speed increases — work on maintaining forward trunk lean longer into the sprint and transition mechanics`,
    );
  } else if (drfRating === 'excellent') {
    trainingInsights.push(
      `DRF (${drf.toFixed(3)}) is excellent — the athlete maintains horizontal force well through the acceleration phase`,
    );
  }

  return { pmaxRel, velocityAtPmax, rfPeak, rfPeakRating, drf, drfRating, trainingInsights };
}

// ============================================================================
// Analysis 4: Optimal Profile Gap Analysis
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

  // Build recommendation (metric units for DB storage — frontend overrides with unit-aware display)
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
    sprintDistanceM,
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
