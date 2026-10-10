import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

// Words that would mean wellness-survey data in the model. The compile-time half of this guard is
// ../model-guard.ts (checked by tsc); this is the source-level half over every file in the model's type graph.
const WELLNESS = ['sleep', 'soreness', 'stress', 'energy', 'cycle', 'wellness', 'mood', 'readiness', 'pain'] as const;
const MODEL_TYPE_FILES = ['model.ts', 'balance.ts', 'retest.ts', 'tier-match.ts', 'metric-key-map.ts', '../../../shared/mqi-band.ts'];

describe('EvalReportModel', () => {
  it.each(MODEL_TYPE_FILES)('%s mentions no wellness fields', (file) => {
    const src = readFileSync(resolve(__dirname, '..', file), 'utf8').toLowerCase();
    for (const word of WELLNESS) expect(src, word).not.toContain(word);
  });
});
