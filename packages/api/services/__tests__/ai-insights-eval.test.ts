import { describe, it, expect } from 'vitest';
import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import {
  athleteNamesIn,
  bareNumberSentences,
  belowAverageNotNamed,
  checkInsights,
  countWords,
  focusResultCount,
  headingIssues,
  medicalWords,
  neverSayHits,
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

describe('checkInsights and the style example', () => {
  it('flags a number that only the style example contains as ungrounded', () => {
    const data = { ...golden('individual-benchmarks').data, audience: 'coach' as const, styleExample: 'Your vertical hit 987.65 in the old report.' };
    const failures = checkInsights({ output: '## Summary\n- Vertical of 987.65 is great.', data });
    expect(failures.some(f => f.includes('987.65'))).toBe(true);
  });
});

describe('medicalWords', () => {
  it('flags diagnosis, return-to-play, injury-risk and body-weight or nutrition wording', () => {
    expect(medicalWords('This suggests a hamstring strain diagnosis; cleared for return to play. Lose weight, watch your diet, high injury risk.'))
      .toEqual(['diagnosis', 'return to play', 'lose weight', 'diet', 'injury risk']);
    expect(medicalWords('Weight loss and weight gain advice.')).toEqual(['weight loss', 'weight gain']);
    expect(medicalWords('Risk of injury is raised; fix your nutrition and body weight.')).toEqual(['risk of injury', 'nutrition', 'body weight']);
  });
  it('does not flag plain weight wording', () => {
    expect(medicalWords('Time in the weight room and weight training will help; the bar weight stays with the coach.')).toEqual([]);
  });
  it('passes plain training wording', () => {
    expect(medicalWords('The left leg is 12% slower; treat it as context only and ask the coach to confirm. The restriction is noted.')).toEqual([]);
  });
  it('checkInsights reports it', () => {
    const c = GOLDEN_CASES[0];
    const failures = checkInsights({ output: '## Summary\nReturn to play is safe.', data: { ...c.data, audience: 'coach' } });
    expect(failures).toContain('medical wording: return to play');
  });
});

describe('family checks (meaning, not data)', () => {
  const chris = golden('eval-long-sprint-goal');
  const checkFamily = (file: string, audience: 'parent' | 'athlete' = 'parent') =>
    checkInsights({ output: sample(file), data: { ...chris.data, audience } });

  it('passes a good parent output for the long-sprint goal case', () => {
    expect(checkFamily('long-sprint-parent-good.md')).toEqual([]);
  });

  it('catches every family failure in a bad output', () => {
    const failures = checkFamily('long-sprint-parent-bad.md').join('\n');
    expect(failures).toContain('bare numbers');
    expect(failures).toContain('never-say wording');
    expect(failures).toContain('below-average results not named');
    expect(failures).toContain('focus results 5, expected 2-3');
    expect(failures).toContain('missing headings: The big picture');
    expect(failures).toContain('numbers not in the report data');
  });

  it('does not apply the family checks to a coach output', () => {
    const failures = checkInsights({ output: sample('long-sprint-parent-bad.md'), data: { ...chris.data, audience: 'coach' } }).join('\n');
    expect(failures).not.toContain('bare numbers');
    expect(failures).not.toContain('focus results');
  });

  describe('bareNumberSentences', () => {
    it('flags a sentence that is mostly the number', () => {
      expect(bareNumberSentences('- 40-yard dash: 5.26 s.\n- Top speed: 1.12 s')).toHaveLength(2);
    });
    it('passes a number given with its meaning, and sentences with no number', () => {
      expect(bareNumberSentences('The first 10 yards took 1.74 seconds, so a quicker start lowers the top speed needed later.')).toEqual([]);
      expect(bareNumberSentences('## The big picture\nCasey is working hard.')).toEqual([]);
    });
  });

  describe('neverSayHits', () => {
    it.each([
      ['Casey is cleared to sprint.', 'cleared'],
      ['Casey will run a 7.0 in the spring.', 'predicted time'],
      ['Body weight is the issue.', 'body weight'],
      ['That proves a weak start.', 'proof from one test'],
      ['Add squats twice a week.', 'exercise prescription'],
      ['Both legs are balanced and safe.', 'balanced, safe or ready'],
      ['The diagnosis is clear.', 'diagnosis'],
    ])('flags %s', (text, label) => {
      expect(neverSayHits(text).join(' ')).toContain(label);
    });
    it('passes plain meaning text, including the paused-squat jump', () => {
      expect(neverSayHits('The paused-squat jump and the squat jump match. Both legs hop about the same distance.')).toEqual([]);
    });
  });

  describe('belowAverageNotNamed', () => {
    it('is loose about wording and only reads the first section', () => {
      const out = '## The big picture\nThe 40-yard time, the 5-10-5 shuttle and the jump are low.\n## What to Work On\n- x';
      expect(belowAverageNotNamed(out, chris.data)).toEqual([]);
      const late = '## The big picture\nCasey is working.\n## What to Work On\n- The 40-yard dash, the 5-10-5 shuttle and the jump.';
      expect(belowAverageNotNamed(late, chris.data)).toHaveLength(3);
    });
  });

  describe('focusResultCount', () => {
    it('counts bullets under What to Work On only', () => {
      expect(focusResultCount("## What's Going Well\n- a\n- b\n## What to Work On\n- one\n- two\n")).toBe(2);
      expect(focusResultCount('## The big picture\nx')).toBe(0);
    });
  });
});

describe('eval set', () => {
  it('has the anonymized evaluations, none with a real name', () => {
    const names = GOLDEN_CASES.filter((c) => c.name.startsWith('eval-')).map((c) => c.name);
    expect(names).toEqual(['eval-long-sprint-goal', 'eval-short-sprint-goal', 'eval-no-goal-test-conditions', 'eval-body-measures']);
  });
  it('the long-sprint case carries the corrected gold-target numbers', () => {
    const values = Object.fromEntries(golden('eval-long-sprint-goal').data.metrics.map((m) => [m.code, m.values[0]]));
    expect(values).toMatchObject({ DASH_10YD: 1.74, DASH_20YD: 3.01, DASH_30YD: 4.14, DASH_40YD: 5.26, AGILITY_5105: 4.96, JUMP_CMJ_HOH: 19.1, JUMP_SJ_HEIGHT: 18.9 });
  });
});
