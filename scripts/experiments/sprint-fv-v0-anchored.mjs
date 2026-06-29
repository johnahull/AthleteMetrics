/**
 * Experiment: V0-anchored fit using Christian's measured fly-10.
 *
 * Fly-10 history (from dashr-sample.csv):
 *   Best: 1.13s → 18.10 mph → 8.09 m/s (2025-07-06)
 *
 * Because the fly-10 measures average speed across 20–30yd (after 20yd of accel),
 * the athlete is at 95–98% of V0, not exactly at V0. So we sweep V0 anchors
 * at 8.09, 8.30, 8.50 m/s to test sensitivity.
 *
 * With V0 anchored, the fit reduces to 1 parameter (τ only) — much more robust
 * given 4 split-time data points.
 */

import { levenbergMarquardt } from 'ml-levenberg-marquardt';

const YARDS_TO_METERS = 0.9144;

// Christian's 2025-12-27 dash (from DashR CSV — same data that produced the prod profile)
const splitTimes = { 5: 1.11, 10: 1.87, 20: 3.19, 30: 4.48 };

const entries = Object.entries(splitTimes)
  .map(([d, t]) => ({ distance: parseFloat(d), time: t }))
  .sort((a, b) => a.distance - b.distance);
const distancesM = entries.map((e) => e.distance * YARDS_TO_METERS);
const times = entries.map((e) => e.time);

/**
 * V0-anchored fit: V0 fixed, only τ varies.
 * Model: d(t) = V0 * (t + τ * exp(-t/τ) - τ)
 */
function anchoredFit(v0) {
  // Wrap the single-param fit in LM with V0 fixed via closure
  const model = (params) => (t) => {
    const [tau] = params;
    return v0 * (t + tau * Math.exp(-t / tau) - tau);
  };

  // Expand x,y to a 2-param dummy vector to satisfy LM — collapse the second param
  const result = levenbergMarquardt(
    { x: times, y: distancesM },
    model,
    {
      initialValues: [0.9],
      minValues: [0.3],
      maxValues: [4.0],
      maxIterations: 500,
      damping: 0.01,
      errorTolerance: 1e-10,
    },
  );
  const [tau] = result.parameterValues;

  const predicted = times.map((t) => v0 * (t + tau * Math.exp(-t / tau) - tau));
  const residualsM = distancesM.map((d, i) => d - predicted[i]);
  const ssRes = residualsM.reduce((s, r) => s + r * r, 0);
  const mean = distancesM.reduce((s, d) => s + d, 0) / distancesM.length;
  const ssTot = distancesM.reduce((s, d) => s + (d - mean) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;

  const f0Rel = v0 / tau;
  const pmaxRel = (f0Rel * v0) / 4;
  const slope = -f0Rel / v0;
  const peakAccelG = f0Rel / 9.81;

  return { v0, tau, f0Rel, pmaxRel, slope, peakAccelG, r2, ssRes, residualsM };
}

/**
 * Classify with same logic as packages/api/services/sprint-fv-analysis.ts.
 * Optimal slope for a 30yd (27.4m) sprint ≈ -0.60 (Samozino et al. 2016 lookup).
 */
function classify(slope) {
  const optimalSlope = -0.60;
  const THRESHOLD = 10;
  const slopeDiff = ((slope - optimalSlope) / Math.abs(optimalSlope)) * 100;
  if (slopeDiff < -THRESHOLD) {
    return { classification: 'velocity-deficit (force-dominant)', imbalancePercent: Math.abs(slopeDiff) };
  }
  if (slopeDiff > THRESHOLD) {
    return { classification: 'force-deficit (velocity-dominant)', imbalancePercent: Math.abs(slopeDiff) };
  }
  return { classification: 'well-balanced', imbalancePercent: Math.abs(slopeDiff) };
}

function printFit(label, fit) {
  const { classification, imbalancePercent } = classify(fit.slope);
  console.log(`\n${label}`);
  console.log(`  V0=${fit.v0.toFixed(3)} m/s  (anchored)   τ=${fit.tau.toFixed(4)} s`);
  console.log(`  F0rel=${fit.f0Rel.toFixed(3)} N/kg   Pmax_rel=${fit.pmaxRel.toFixed(3)} W/kg`);
  console.log(`  slope=${fit.slope.toFixed(4)}   peak_accel=${fit.peakAccelG.toFixed(2)}g`);
  console.log(`  R²=${fit.r2.toFixed(6)}   SSR=${fit.ssRes.toExponential(3)} m²`);
  console.log(`  residuals(m)=[${fit.residualsM.map((r) => r.toFixed(3)).join(', ')}]`);
  console.log(`  → CLASSIFICATION: ${classification}  (imbalance ${imbalancePercent.toFixed(1)}%)`);
}

console.log('══════════════════════════════════════════════════════════════════');
console.log(' V0-anchored Sprint F-V fit — Christian Hull 2025-12-27');
console.log(' Splits (y): 5=1.11  10=1.87  20=3.19  30=4.48');
console.log(' Fly-10 anchor: 8.09 m/s (best of 8 fly-10 tests in CSV)');
console.log('══════════════════════════════════════════════════════════════════');

console.log('\n### Baseline (unconstrained 2-param, τ floor 0.7 = production)');
{
  const model = (params) => (t) => {
    const [vmax, tau] = params;
    return vmax * (t + tau * Math.exp(-t / tau) - tau);
  };
  const result = levenbergMarquardt({ x: times, y: distancesM }, model, {
    initialValues: [7.96, 1.2],
    minValues: [3.0, 0.7],
    maxValues: [15.0, 4.0],
    maxIterations: 500,
    damping: 0.01,
    errorTolerance: 1e-10,
  });
  const [vmax, tau] = result.parameterValues;
  const predicted = times.map((t) => vmax * (t + tau * Math.exp(-t / tau) - tau));
  const residualsM = distancesM.map((d, i) => d - predicted[i]);
  const ssRes = residualsM.reduce((s, r) => s + r * r, 0);
  const mean = distancesM.reduce((s, d) => s + d, 0) / distancesM.length;
  const ssTot = distancesM.reduce((s, d) => s + (d - mean) ** 2, 0);
  printFit('PROD FIT (τ pinned):', {
    v0: vmax, tau,
    f0Rel: vmax / tau,
    pmaxRel: ((vmax / tau) * vmax) / 4,
    slope: -(vmax / tau) / vmax,
    peakAccelG: (vmax / tau) / 9.81,
    r2: 1 - ssRes / ssTot,
    ssRes,
    residualsM,
  });
}

console.log('\n### V0-anchored fits (sweep anchor across fly-10 uncertainty)');
for (const v0 of [8.09, 8.30, 8.50]) {
  printFit(`ANCHORED V0=${v0.toFixed(2)} m/s`, anchoredFit(v0));
}

console.log('\n══════════════════════════════════════════════════════════════════');
console.log(' Summary — classification stability under V0 anchor');
console.log('══════════════════════════════════════════════════════════════════');
const summary = [
  { label: 'Prod (unconstrained, pinned τ)', v0: null },
  { label: 'Anchored V0=8.09', v0: 8.09 },
  { label: 'Anchored V0=8.30', v0: 8.30 },
  { label: 'Anchored V0=8.50', v0: 8.50 },
];
for (const s of summary) {
  let fit;
  if (s.v0 === null) {
    // recompute prod
    const model = (p) => (t) => p[0] * (t + p[1] * Math.exp(-t / p[1]) - p[1]);
    const r = levenbergMarquardt({ x: times, y: distancesM }, model, {
      initialValues: [7.96, 1.2], minValues: [3, 0.7], maxValues: [15, 4], maxIterations: 500, damping: 0.01, errorTolerance: 1e-10,
    });
    const [v, t] = r.parameterValues;
    fit = { v0: v, tau: t, slope: -(v / t) / v, f0Rel: v / t };
  } else {
    fit = anchoredFit(s.v0);
  }
  const c = classify(fit.slope);
  console.log(`  ${s.label.padEnd(36)} τ=${fit.tau.toFixed(3)}  F0rel=${fit.f0Rel.toFixed(2)}  ${c.classification} (${c.imbalancePercent.toFixed(0)}%)`);
}
