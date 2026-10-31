import { describe, it, expect } from 'vitest';
import { getMissingProfileFields } from '../profile-completion';

const full = { isSiteAdmin: false, birthDate: '2010-05-05', emails: ['kid@gmail.com'] };
const noDob = { ...full, birthDate: null };
const placeholder = { ...full, emails: ['x@temp.local', 'y@ocr-import.local'] };
const athleteOrg = [{ role: 'athlete' }];
const coachOrg = [{ role: 'coach' }];

describe('getMissingProfileFields', () => {
  it('athlete with everything: nothing missing', () => {
    expect(getMissingProfileFields(full, athleteOrg, false)).toEqual([]);
  });

  it('athlete without DOB: birthDate missing', () => {
    expect(getMissingProfileFields(noDob, athleteOrg, false)).toEqual(['birthDate']);
  });

  it('athlete with only placeholder emails: email missing', () => {
    expect(getMissingProfileFields(placeholder, athleteOrg, false)).toEqual(['email']);
  });

  it('athlete with no emails: email missing; both missing in stable order', () => {
    expect(getMissingProfileFields({ ...noDob, emails: [] }, athleteOrg, false)).toEqual(['birthDate', 'email']);
  });

  it('one real email among placeholders is enough', () => {
    expect(getMissingProfileFields({ ...full, emails: ['x@temp.local', 'real@gmail.com'] }, athleteOrg, false)).toEqual([]);
  });

  it('coach is not gated', () => {
    expect(getMissingProfileFields({ ...noDob, emails: [] }, coachOrg, false)).toEqual([]);
  });

  it('org admin is not gated', () => {
    expect(getMissingProfileFields(noDob, [{ role: 'org_admin' }], false)).toEqual([]);
  });

  it('coach in org A and athlete in org B is gated', () => {
    expect(getMissingProfileFields(noDob, [...coachOrg, ...athleteOrg], false)).toEqual(['birthDate']);
  });

  it('site admin is never gated, even with an athlete membership', () => {
    expect(getMissingProfileFields({ ...noDob, isSiteAdmin: true, emails: [] }, athleteOrg, false)).toEqual([]);
  });

  it('parent (no orgs, active parent link) is not gated', () => {
    expect(getMissingProfileFields(noDob, [], true)).toEqual([]);
  });

  it('no orgs and no parent link counts as athlete', () => {
    expect(getMissingProfileFields(noDob, [], false)).toEqual(['birthDate']);
  });
});
