/**
 * Sprint Force-Velocity Profile Computation
 *
 * Implements JB Morin's mono-exponential sprint model:
 *   v(t) = Vmax × (1 - e^(-t/τ))
 *   d(t) = Vmax × (t + τ × e^(-t/τ) - τ)
 *
 * Uses Levenberg-Marquardt nonlinear least-squares fitting to derive
 * Vmax and τ from split times, then computes biomechanical outputs.
 *
 * References:
 *   Morin & Samozino (2016) - "Interpreting Power-Force-Velocity Profiles
 *   for Individualized and Specific Training Prescription in Sprint Running"
 */

import { levenbergMarquardt } from 'ml-levenberg-marquardt';
import type { FitResidual } from '@shared/schema/tables/sprint-fv-profiles';

const YARDS_TO_METERS = 0.9144;

export interface ComputedFvProfile {
  vmax: number;     // Fitted max velocity (m/s)
  tau: number;      // Time constant (s)
  f0Rel: number;    // Relative max horizontal force (N/kg)
  v0: number;       // Theoretical max velocity (m/s) = Vmax
  pmaxRel: number;  // Relative max power (W/kg)
  fvSlope: number;  // F-V slope (N·s/m/kg), negative
  rfPeak: number;   // Peak ratio of force (0-1)
  drf: number;      // Rate of decrease of RF (negative)
  fitR2: number;    // R-squared goodness of fit
  fitResiduals: FitResidual[];
}

/**
 * Compute a complete F-V profile from split times.
 *
 * @param splitTimes - Object mapping distance (string) to cumulative time in seconds
 *                     e.g., { "5": 1.10, "10": 1.82, "20": 3.15, "30": 4.45 }
 * @param bodyMassKg - Athlete body mass in kg (used for absolute force, but all outputs are relative)
 * @param distanceUnit - 'yards' or 'meters'
 */
export function computeFvProfile(
  splitTimes: Record<string, number>,
  bodyMassKg: number,
  distanceUnit: 'yards' | 'meters',
): ComputedFvProfile {
  // Validate inputs
  if (bodyMassKg <= 0) {
    throw new Error('Body mass must be positive');
  }

  const entries = Object.entries(splitTimes)
    .map(([dist, time]) => ({ distance: parseFloat(dist), time }))
    .sort((a, b) => a.distance - b.distance);

  if (entries.length < 3) {
    throw new Error('At least 3 split times are required for curve fitting');
  }

  // Validate positive times
  for (const e of entries) {
    if (e.time <= 0) {
      throw new Error('All split times must be positive');
    }
  }

  // Validate monotonically increasing times
  for (let i = 1; i < entries.length; i++) {
    if (entries[i].time <= entries[i - 1].time) {
      throw new Error('Split times must be monotonically increasing with distance');
    }
  }

  // Convert distances to meters if in yards
  const distancesM = entries.map(e =>
    distanceUnit === 'yards' ? e.distance * YARDS_TO_METERS : e.distance
  );
  const times = entries.map(e => e.time);

  // Fit the mono-exponential model: d(t) = Vmax * (t + tau * exp(-t/tau) - tau)
  // x = observed times, y = known distances
  const { vmax, tau } = fitModel(times, distancesM);

  // Derive biomechanical parameters
  const v0 = vmax;
  const f0Rel = vmax / tau;        // N/kg (relative force)
  const pmaxRel = (f0Rel * v0) / 4; // W/kg (relative power)
  const fvSlope = -f0Rel / v0;      // N·s/m/kg (always negative)

  // Compute ratio of force (RF) and its decrease rate (DRF)
  const { rfPeak, drf } = computeRfMetrics(vmax, tau);

  // Compute fit quality and residuals
  const { fitR2, fitResiduals } = computeFitQuality(times, distancesM, entries, vmax, tau);

  return {
    vmax,
    tau,
    f0Rel,
    v0,
    pmaxRel,
    fvSlope,
    rfPeak,
    drf,
    fitR2,
    fitResiduals,
  };
}

/**
 * Fit the mono-exponential distance-time model using Levenberg-Marquardt.
 */
function fitModel(times: number[], distances: number[]): { vmax: number; tau: number } {
  // Distance model: d(t) = vmax * (t + tau * exp(-t/tau) - tau)
  const distanceModel = (params: number[]) => (t: number) => {
    const [vmax, tau] = params;
    return vmax * (t + tau * Math.exp(-t / tau) - tau);
  };

  // Heuristic initial guesses from the data
  const lastDist = distances[distances.length - 1];
  const lastTime = times[times.length - 1];
  const avgVelocity = lastDist / lastTime;
  const initialVmax = avgVelocity * 1.3; // Vmax is higher than average velocity
  const initialTau = 1.2; // Typical time constant

  const result = levenbergMarquardt(
    { x: times, y: distances },
    distanceModel,
    {
      initialValues: [initialVmax, initialTau],
      minValues: [3.0, 0.7],   // Physical lower bounds (tau < 0.7 exceeds human biomechanical limits)
      maxValues: [15.0, 4.0],  // Physical upper bounds
      maxIterations: 200,
      damping: 0.01,
      errorTolerance: 1e-8,
    }
  );

  const [vmax, tau] = result.parameterValues;
  if (!isFinite(vmax) || !isFinite(tau)) {
    throw new Error('Curve fit did not converge — check split times for accuracy');
  }

  return { vmax, tau };
}

/**
 * Compute the ratio of force (RF) metrics.
 *
 * RF represents the proportion of total GRF directed horizontally.
 * RF_peak is the maximum RF at the start of the sprint.
 * DRF is the rate at which RF decreases as the athlete accelerates.
 *
 * Simplified model (Morin et al., 2011):
 *   RF(v) = F_horizontal / F_total
 *   At v=0: RF_peak ≈ F0 / sqrt(F0² + (m*g)²) where g = 9.81
 *   DRF = slope of RF vs velocity (linear regression over acceleration phase)
 */
function computeRfMetrics(vmax: number, tau: number): { rfPeak: number; drf: number } {
  const g = 9.81;
  const f0Rel = vmax / tau;

  // RF_peak: ratio of horizontal to total force at start (v ≈ 0)
  // At v=0, acceleration = vmax/tau = f0_rel, and total force ≈ sqrt(f0_rel² + g²)
  const rfPeak = f0Rel / Math.sqrt(f0Rel * f0Rel + g * g);

  // DRF: linear regression of RF vs velocity over the acceleration phase
  // Sample RF at multiple velocity points from 0 to ~90% Vmax
  const nSamples = 20;
  const velocities: number[] = [];
  const rfValues: number[] = [];

  for (let i = 0; i <= nSamples; i++) {
    const v = (i / nSamples) * 0.9 * vmax;
    // Acceleration at velocity v: a(v) = (vmax - v) / tau
    const a = (vmax - v) / tau;
    // RF = a / sqrt(a² + g²) — simplified horizontal force ratio
    const rf = a / Math.sqrt(a * a + g * g);
    velocities.push(v);
    rfValues.push(rf);
  }

  // Linear regression: RF = intercept + DRF * velocity
  const n = velocities.length;
  const sumV = velocities.reduce((s, v) => s + v, 0);
  const sumRf = rfValues.reduce((s, r) => s + r, 0);
  const sumVRf = velocities.reduce((s, v, i) => s + v * rfValues[i], 0);
  const sumV2 = velocities.reduce((s, v) => s + v * v, 0);

  const drf = (n * sumVRf - sumV * sumRf) / (n * sumV2 - sumV * sumV);

  return { rfPeak, drf };
}

/**
 * Invert the distance model: given a target distance, find the time.
 * Uses Newton's method with clamped steps for stability.
 */
function solveTimeForDistance(distanceM: number, vmax: number, tau: number): number {
  let t = distanceM / (vmax * 0.7); // initial estimate

  for (let iter = 0; iter < 20; iter++) {
    const dPred = vmax * (t + tau * Math.exp(-t / tau) - tau);
    const v = vmax * (1 - Math.exp(-t / tau));
    if (v < 1e-6) { t += 0.01; continue; } // guard against division by near-zero
    const dt = (distanceM - dPred) / v;
    const clampedDt = Math.max(-0.5, Math.min(0.5, dt));
    t += clampedDt;
    if (Math.abs(dt) < 1e-6) break;
  }

  return t;
}

/**
 * Compute R-squared and per-split residuals for model fit quality.
 *
 * Note: R² is computed in the distance domain (predicted vs observed distances)
 * because the LM model fits d(t). The per-split residuals are reported in the
 * time domain (observed - predicted time) which is more intuitive for coaches.
 */
function computeFitQuality(
  times: number[],
  distancesM: number[],
  entries: { distance: number; time: number }[],
  vmax: number,
  tau: number,
): { fitR2: number; fitResiduals: FitResidual[] } {
  const predictedDistances = times.map(t => vmax * (t + tau * Math.exp(-t / tau) - tau));

  // R-squared (distance domain — see function JSDoc)
  const mean = distancesM.reduce((s, d) => s + d, 0) / distancesM.length;
  const ssTot = distancesM.reduce((s, d) => s + (d - mean) ** 2, 0);
  const ssRes = distancesM.reduce((s, d, i) => s + (d - predictedDistances[i]) ** 2, 0);
  const fitR2 = ssTot > 0 ? 1 - ssRes / ssTot : 0;

  // Per-split residuals with time-domain inversion
  const fitResiduals: FitResidual[] = entries.map((e, i) => {
    const predictedTime = solveTimeForDistance(distancesM[i], vmax, tau);
    return {
      distance: e.distance,
      observedTime: e.time,
      predictedTime,
      residual: e.time - predictedTime,
    };
  });

  return { fitR2, fitResiduals };
}
