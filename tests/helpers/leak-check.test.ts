import { describe, it, expect } from 'vitest';
import { diffSnapshots, emptySnapshot, formatLeaks } from './leak-check';

const snap = (over: Partial<Record<'organizations' | 'users' | 'teams' | 'measurements', [string, string][]>>) => {
  const s = emptySnapshot();
  for (const [table, rows] of Object.entries(over)) for (const [id, label] of rows!) (s as any)[table].set(id, label);
  return s;
};

describe('leak check (issue #539)', () => {
  it('reports nothing when the run adds no rows', () => {
    const before = snap({ organizations: [['o1', 'Org 1']], users: [['u1', 'someone']] });
    expect(formatLeaks(diffSnapshots(before, before))).toBeNull();
  });

  it('ignores rows that existed before the run and rows the run deleted', () => {
    const before = snap({ organizations: [['o1', 'Org 1'], ['o2', 'Org 2']] });
    const after = snap({ organizations: [['o1', 'Org 1']] });
    expect(formatLeaks(diffSnapshots(before, after))).toBeNull();
  });

  it('reports rows that appeared during the run, by label, per table', () => {
    const before = snap({ users: [['u1', 'old']] });
    const after = snap({
      users: [['u1', 'old'], ['u2', 'leaky-user']],
      organizations: [['o9', 'Leaky Org']],
      measurements: [['m1', 'VERTICAL_JUMP for u2']],
    });
    const message = formatLeaks(diffSnapshots(before, after))!;
    expect(message).toContain('users: 1 left behind: leaky-user');
    expect(message).toContain('organizations: 1 left behind: Leaky Org');
    expect(message).toContain('measurements: 1 left behind');
    expect(message).not.toContain('teams:');
    expect(message).not.toContain('old');
  });

  it('caps the sample of labels', () => {
    const rows: [string, string][] = Array.from({ length: 15 }, (_, i) => [`m${i}`, `m${i}`]);
    const message = formatLeaks(diffSnapshots(emptySnapshot(), snap({ measurements: rows })))!;
    expect(message).toContain('15 left behind');
    expect(message).toContain('(5 more)');
  });
});
