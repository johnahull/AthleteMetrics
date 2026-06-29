/**
 * Experiment: relax the τ floor and see where LM naturally converges.
 *
 * Uses Christian Hull's actual production splits (2026-04-20):
 *   5y=1.11s, 10y=1.87s, 20y=3.19s, 30y=4.48s, body=68.04kg
 *
 * Runs the same ml-levenberg-marquardt library our service uses, with
 * different τ lower bounds and different starting τ guesses, to detect:
 *   - whether the production fit is stuck at a boundary
 *   - whether lowering the floor produces a stable, off-boundary minimum
 *   - whether the starting τ guess matters (multi-start robustness)
 */

import { levenbergMarquardt } from 'ml-levenberg-marquardt';

const YARDS_TO_METERS = 0.9144;

// Christian Hull's production data
const splitTimes = { 5: 1.11, 10: 1.87, 20: 3.19, 30: 4.48 };
const bodyMassKg = 68.04;

const entries = Object.entries(splitTimes)
  .map(([d, t]) => ({ distance: parseFloat(d), time: t }))
  .sort((a, b) => a.distance - b.distance);

const distancesM = entries.map((e) => e.distance * YARDS_TO_METERS);
const times = entries.map((e) => e.time);

// Same model as packages/api/services/sprint-fv-computation.ts
const distanceModel = (params) => (t) => {
  const [vmax, tau] = params;
  return vmax * (t + tau * Math.exp(-t / tau) - tau);
};

function runFit({ minTau, initialTau, initialVmax }) {
  try {
    const result = levenbergMarquardt(
      { x: times, y: distancesM },
      distanceModel,
      {
        initialValues: [initialVmax, initialTau],
        minValues: [3.0, minTau],
        maxValues: [15.0, 4.0],
        maxIterations: 500,
        damping: 0.01,
        errorTolerance: 1e-10,
      },
    );
    const [vmax, tau] = result.parameterValues;

    // Compute fit residuals (distance domain) + derived metrics
    const predicted = times.map((t) => vmax * (t + tau * Math.exp(-t / tau) - tau));
    const residualsM = distancesM.map((d, i) => d - predicted[i]);
    const ssRes = residualsM.reduce((s, r) => s + r * r, 0);
    const mean = distancesM.reduce((s, d) => s + d, 0) / distancesM.length;
    const ssTot = distancesM.reduce((s, d) => s + (d - mean) ** 2, 0);
    const r2 = 1 - ssRes / ssTot;

    const f0Rel = vmax / tau;
    const pmaxRel = (f0Rel * vmax) / 4;
    const slope = -f0Rel / vmax;
    const peakAccelG = f0Rel / 9.81;

    return {
      converged: true,
      vmax, tau,
      f0Rel, pmaxRel, slope,
      peakAccelG,
      r2,
      ssRes,
      residualsM,
      pinnedAtFloor: Math.abs(tau - minTau) < 1e-4,
    };
  } catch (err) {
    return { converged: false, error: err.message };
  }
}

function fmt(fit) {
  if (!fit.converged) return `  FAILED: ${fit.error}`;
  return [
    `  τ=${fit.tau.toFixed(4)}${fit.pinnedAtFloor ? ' ⚠ PINNED' : ''}`,
    `  V0=${fit.vmax.toFixed(4)} m/s`,
    `  F0rel=${fit.f0Rel.toFixed(3)} N/kg   Pmax_rel=${fit.pmaxRel.toFixed(3)} W/kg`,
    `  slope=${fit.slope.toFixed(4)}   peak_accel=${fit.peakAccelG.toFixed(2)}g`,
    `  R²=${fit.r2.toFixed(6)}   SSR=${fit.ssRes.toExponential(3)} m²`,
    `  residuals(m)=[${fit.residualsM.map((r) => r.toFixed(3)).join(', ')}]`,
  ].join('\n');
}

console.log('══════════════════════════════════════════════════════════════════');
console.log(' Sprint F-V τ-floor sweep — Christian Hull 2026-04-20');
console.log(' Splits (yards): 5=1.11s, 10=1.87s, 20=3.19s, 30=4.48s');
console.log(' Body mass: 68.04 kg');
console.log('══════════════════════════════════════════════════════════════════\n');

console.log('### Production config (τ ≥ 0.7, initialTau=1.2) — reproduces prod');
console.log(fmt(runFit({ minTau: 0.7, initialTau: 1.2, initialVmax: 7.96 })));

console.log('\n### Sweep τ floor with production initial guess (initialTau=1.2)');
for (const floor of [0.7, 0.6, 0.5, 0.4, 0.3, 0.1]) {
  console.log(`\n-- τ ≥ ${floor}`);
  console.log(fmt(runFit({ minTau: floor, initialTau: 1.2, initialVmax: 7.96 })));
}

console.log('\n### Multi-start robustness (τ ≥ 0.3, vary initialTau)');
for (const initTau of [0.5, 0.7, 0.9, 1.2, 1.5, 2.0]) {
  console.log(`\n-- initialTau=${initTau}`);
  console.log(fmt(runFit({ minTau: 0.3, initialTau: initTau, initialVmax: 7.96 })));
}

console.log('\n### ChatGPT reference point (τ=0.89, V0=7.22) — compute residuals');
{
  const vmax = 7.22, tau = 0.89;
  const predicted = times.map((t) => vmax * (t + tau * Math.exp(-t / tau) - tau));
  const residualsM = distancesM.map((d, i) => d - predicted[i]);
  const ssRes = residualsM.reduce((s, r) => s + r * r, 0);
  const mean = distancesM.reduce((s, d) => s + d, 0) / distancesM.length;
  const ssTot = distancesM.reduce((s, d) => s + (d - mean) ** 2, 0);
  const r2 = 1 - ssRes / ssTot;
  console.log(`  V0=${vmax}, τ=${tau}`);
  console.log(`  F0rel=${(vmax / tau).toFixed(3)} N/kg   Pmax_rel=${((vmax / tau) * vmax / 4).toFixed(3)} W/kg`);
  console.log(`  peak_accel=${(vmax / tau / 9.81).toFixed(2)}g`);
  console.log(`  R²=${r2.toFixed(6)}   SSR=${ssRes.toExponential(3)} m²`);
  console.log(`  residuals(m)=[${residualsM.map((r) => r.toFixed(3)).join(', ')}]`);
}
