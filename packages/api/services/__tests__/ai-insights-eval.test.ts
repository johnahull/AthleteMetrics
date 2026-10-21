import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  athleteNamesIn,
  checkInsights,
  countWords,
  headingIssues,
  prescriptionNumbers,
  ungroundedNumbers,
  unmeasuredQualities,
} from '../ai-insights-eval';
import { GOLDEN_CASES } from './fixtures/ai-insights-golden';

/**
 * Output checker for the AI insights eval harness, proven against recorded good and
 * deliberately bad sample outputs.
 */

const sample = (file: string) => readFileSync(join(__dirname, 'fixtures/ai-insights-samples', file), 'utf8');
const golden = (name: string) => GOLDEN_CASES.find(c => c.name === name)!;
const check = (file: string, name: string, audience: 'coach' | 'athlete' | 'parent' = 'coach') =>
  checkInsights({ output: sample(file), data: { ...golden(name).data, audience }, athleteNames: golden(name).rosterNames });

describe('ungroundedNumbers', () => {
  const data = (s: string) => `Keep it 150-250 words, 2-3 sentences.\n<report_data>\n${s}\n</report_data>\nUse 3 bullets.`;

  it('passes numbers that appear in the report data, in any decimal formatting', () => {
    expect(ungroundedNumbers('Average 24.6 in (SD 3.10), 78th percentile, 5.0%', data('average 24.60, SD 3.1, 78.0th, 5%'))).toEqual([]);
  });

  it('reports numbers the report data does not contain', () => {
    expect(ungroundedNumbers('12 athletes are 0.15 s slower', data('Fly 1.32 s, 24 athletes'))).toEqual(['12', '0.15']);
  });

  it('compares against the fenced data only, not the instructions around it', () => {
    expect(ungroundedNumbers('150 words, 2 or 3 bullets', data('Fly 1.32 s'))).toEqual(['150', '2', '3']);
  });

  it('reads numbers inside ranges and labels without turning hyphens into minus signs', () => {
    expect(ungroundedNumbers('5-10-5 Agility 1.18-1.51 s', data('5-10-5 range 1.18-1.51'))).toEqual([]);
  });

  it('treats a thousands separator as one number', () => {
    expect(ungroundedNumbers('a 1,200 m run', data('Run 1200 m'))).toEqual([]);
    expect(ungroundedNumbers('a 1,250 m run', data('Run 1200 m'))).toEqual(['1,250']);
  });

  it('keeps a leading minus: a negative value must be in the data, a magnitude may match either sign', () => {
    expect(ungroundedNumbers('-0.07 and 0.07 and -0.5', data('athlete is -0.07, average 0.5'))).toEqual(['-0.5']);
  });
});

describe('prescriptionNumbers', () => {
  it('finds sets, reps and durations the data cannot ground', () => {
    expect(prescriptionNumbers('Do 3 sets of 10, then 4x20 m and 15 minutes of mobility for 6 weeks.'))
      .toEqual(['3 sets', '4x20', '15 minutes', '6 weeks']);
  });

  it('ignores metric values', () => {
    expect(prescriptionNumbers('10-Yard Fly 1.24 s, 78th percentile')).toEqual([]);
  });
});

describe('unmeasuredQualities', () => {
  it('flags comments on effort, attitude and motivation', () => {
    expect(unmeasuredQualities('Jordan works hard, is coachable and motivated; no lazy reps.'))
      .toEqual(['works hard', 'coachable', 'motivated', 'lazy']);
  });
});

describe('athleteNamesIn', () => {
  it('finds full names and name parts as whole words, ignoring case', () => {
    expect(athleteNamesIn('Great work from SMITH and avery jones.', ['Jordan Smith', 'Avery Jones'])).toEqual(['Jordan Smith', 'Avery Jones']);
  });

  it('does not match a name inside a longer word, including accented letters', () => {
    expect(athleteNamesIn('Smithfield results', ['Jordan Smith'])).toEqual([]);
    expect(athleteNamesIn('Joséa ran', ['José Ruiz'])).toEqual([]);
    expect(athleteNamesIn('josé ran', ['José Ruiz'])).toEqual(['José Ruiz']);
  });
});

describe('headingIssues', () => {
  it('accepts the audience headings as ## lines in order, straight or curly apostrophe', () => {
    const output = "## Summary\nx\n## What’s Going Well\nx\n## What to Work On\nx\n## Next Steps\nx";
    expect(headingIssues(output, 'coach')).toEqual([]);
  });

  it('reports headings that are absent, bold only or not level 2', () => {
    expect(headingIssues('## Summary\n### What\'s Going Well\n**Next Steps**', 'coach'))
      .toEqual(["missing headings: What's Going Well, What to Work On, Next Steps"]);
  });

  it('reports extra headings and a wrong order', () => {
    const output = "## What's Going Well\n## Summary\n## What to Work On\n## Next Steps\n## Bonus Tips";
    expect(headingIssues(output, 'coach')).toEqual(['extra headings: Bonus Tips', 'headings out of order']);
  });
});

describe('countWords', () => {
  it('counts words, not markdown symbols', () => {
    expect(countWords('## Summary\n- **Fly**: 1.24 s')).toBe(4);
  });
});

describe('checkInsights on recorded samples', () => {
  it('passes a good team output', () => {
    expect(check('team-good.md', 'team-benchmarks')).toEqual([]);
  });

  it('catches every violation in a bad team output', () => {
    const failures = check('team-bad.md', 'team-benchmarks').join('\n');
    expect(failures).toContain('numbers not in the report data: 0.15');
    expect(failures).toContain('athlete names in a team output: Jordan Smith');
    expect(failures).toContain('change over time claimed without history: improved');
    expect(failures).toContain('missing headings: Next Steps');
    expect(failures).toMatch(/word count \d+ outside 200-350/);
  });

  it('passes a good individual coach output', () => {
    expect(check('individual-coach-good.md', 'individual-benchmarks')).toEqual([]);
  });

  it('catches invented numbers, prescriptions, unmeasured qualities, trends and headings in a bad individual output', () => {
    const failures = check('individual-coach-bad.md', 'individual-benchmarks').join('\n');
    expect(failures).toContain('numbers not in the report data: 28');
    expect(failures).toContain('training prescriptions not in the report data: 3 sets');
    expect(failures).toContain('unmeasured qualities: works hard, coachable');
    expect(failures).toContain('change over time claimed without history: improved, since the last');
    expect(failures).toContain("missing headings: What's Going Well");
  });

  it('flags past-tense change words without history, but not training advice that uses bare verbs', () => {
    const data = { ...golden('individual-benchmarks').data, audience: 'coach' as const };
    const failures = (output: string) => checkInsights({ output, data }).find(f => f.startsWith('change over time'));
    expect(failures('Speed dropped and the jump increased; agility regressed, power grew, rose, fell, gained and lost ground.'))
      .toBe('change over time claimed without history: dropped, increased, regressed, grew, rose, fell, gained, lost');
    expect(failures('Sprint work aims to increase top speed and decrease ground contact time; drop-in jumps help you gain power.'))
      .toBeUndefined();
  });

  it('flags claims that a change happened, not advice that mentions improving', () => {
    const data = { ...golden('individual-benchmarks').data, audience: 'coach' as const };
    const failures = (output: string) => checkInsights({ output, data }).find(f => f.startsWith('change over time'));
    expect(failures('Work to improve your sprint time; keep improving the jump. There is room for improvement, and a decline in power would show on a retest.'))
      .toBeUndefined();
    expect(failures('Jordan improved 5% since the last test and the jump declined.'))
      .toBe('change over time claimed without history: improved, since the last, declined');
  });

  it('reports small integers separately: they are weak evidence of grounding', () => {
    const failures = checkInsights({
      output: '## Summary\nx\n## What\'s Going Well\nx\n## What to Work On\n2 gaps\n## Next Steps\nx',
      data: { ...golden('individual-limited').data, audience: 'coach' },
    });
    expect(failures).toContain('small integers not in the report data (weak check): 2');
  });

  it('passes a short good output for limited data (lower word minimum, says there is no gap)', () => {
    expect(check('individual-limited-coach-good.md', 'individual-limited')).toEqual([]);
  });

  it('flags an unfilled {{first_name}} placeholder in the output', () => {
    const failures = checkInsights({
      output: '## Summary\n{{first_name}} x\n## What\'s Going Well\nx\n## What to Work On\nx\n## Next Steps\nx',
      data: { ...golden('individual-limited').data, audience: 'coach' },
    });
    expect(failures).toContain('unfilled placeholder: {{first_name}}');
  });

  it('flags a single-brace placeholder too', () => {
    const failures = checkInsights({
      output: '## Summary\n{first_name} x\n## What\'s Going Well\nx\n## What to Work On\nx\n## Next Steps\nx',
      data: { ...golden('individual-limited').data, audience: 'coach' },
    });
    expect(failures).toContain('unfilled placeholder: {first_name}');
  });

  it('flags the athlete name appearing in the prompt', () => {
    const data = { ...golden('individual-limited').data, audience: 'coach' as const, keyFacts: ['Riley Chen led the group'] };
    expect(checkInsights({ output: 'x', data })).toContain('athlete name in the prompt');
  });

  it('does not check names on individual outputs (the athlete is named on purpose)', () => {
    expect(checkInsights({
      output: sample('individual-coach-good.md'),
      data: { ...golden('individual-benchmarks').data, audience: 'coach' },
      athleteNames: ['Jordan Smith'],
    })).toEqual([]);
  });
});
