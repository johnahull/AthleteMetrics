import { describe, it, expect } from 'vitest';
import { buildPrompt } from '../ai-insights-service';
import { athleteNamesIn } from '../ai-insights-eval';
import { GOLDEN_CASES, goldenAudiences } from './fixtures/ai-insights-golden';

/**
 * Snapshots of the built prompt for the golden set (no network). A prompt change shows up as a
 * snapshot diff to review; update with `npx vitest run -u` once the diff is intended.
 */

describe('golden prompts', () => {
  for (const c of GOLDEN_CASES) {
    for (const audience of goldenAudiences(c)) {
      it(`${c.name} (${audience})`, async () => {
        const prompt = buildPrompt({ ...c.data, audience });
        await expect(prompt).toMatchFileSnapshot(`./__snapshots__/ai-insights-golden/${c.name}.${audience}.txt`);
        // Team prompts carry aggregates only
        if (c.rosterNames) expect(athleteNamesIn(prompt, c.rosterNames)).toEqual([]);
      });
    }
  }
});
