import { describe, it, expect } from 'vitest';
import bcrypt from 'bcrypt';
import { INVITATION_PENDING_PASSWORD } from '@shared/schema';
import { assertMayAcceptFor, canClaimThroughInvitation, isUnclaimedAccount, InvitationAccountError } from '../invitation-account';

const ORG = 'org-a';
const INV = { organizationId: ORG, role: 'athlete', playerId: null };
const PARENT_INV = { organizationId: ORG, role: 'parent', playerId: 'child-1' };
const base = { id: 'u1', password: INVITATION_PENDING_PASSWORD, googleId: null, appleId: null, isSiteAdmin: false };

describe('isUnclaimedAccount', () => {
  it('is true only for the pending placeholder without an OAuth identity', async () => {
    expect(await isUnclaimedAccount(base)).toBe(true);
    expect(await isUnclaimedAccount({ ...base, password: await bcrypt.hash('Chosen1!pass', 4) })).toBe(false);
    expect(await isUnclaimedAccount({ ...base, password: null })).toBe(false);
    expect(await isUnclaimedAccount({ ...base, googleId: 'g' })).toBe(false);
    expect(await isUnclaimedAccount({ ...base, appleId: 'a' })).toBe(false);
  });

  it('recognises the hashed placeholder written for imported athletes', async () => {
    expect(await isUnclaimedAccount({ ...base, password: await bcrypt.hash(INVITATION_PENDING_PASSWORD, 4) })).toBe(true);
  });
});

describe('canClaimThroughInvitation', () => {
  it('allows an unclaimed account that belongs only to the inviting organization', async () => {
    expect(await canClaimThroughInvitation(base, [ORG], INV)).toBe(true);
  });

  it('refuses an unclaimed account in no organization', async () => {
    expect(await canClaimThroughInvitation(base, [], INV)).toBe(false);
  });

  it('never claims an account for a parent invitation', async () => {
    expect(await canClaimThroughInvitation(base, [ORG], PARENT_INV)).toBe(false);
  });

  it('refuses another organization, a site admin or a claimed account', async () => {
    expect(await canClaimThroughInvitation(base, [ORG, 'org-b'], INV)).toBe(false);
    expect(await canClaimThroughInvitation({ ...base, isSiteAdmin: true }, [ORG], INV)).toBe(false);
    expect(await canClaimThroughInvitation({ ...base, password: 'not-a-hash' }, [ORG], INV)).toBe(false);
  });
});

describe('assertMayAcceptFor', () => {
  const claimed = { ...base, password: 'not-a-hash' };
  const code = async (fn: () => Promise<unknown>) => {
    try { await fn(); } catch (e) { return (e as InvitationAccountError).code; }
    return 'none';
  };

  it('lets the signed-in owner accept without claiming', async () => {
    expect(await assertMayAcceptFor(claimed, [], INV, 'u1')).toEqual({ claim: false });
  });

  it('claims an unclaimed account', async () => {
    expect(await assertMayAcceptFor(base, [ORG], INV, undefined)).toEqual({ claim: true });
  });

  it('asks an anonymous caller to sign in and refuses another signed-in user', async () => {
    expect(await code(() => assertMayAcceptFor(claimed, [], INV, undefined))).toBe('SIGN_IN_REQUIRED');
    expect(await code(() => assertMayAcceptFor(claimed, [], INV, 'u2'))).toBe('WRONG_ACCOUNT');
  });

  it('refuses the child of a parent invitation, even signed in as them', async () => {
    const child = { ...claimed, id: 'child-1' };
    expect(await code(() => assertMayAcceptFor(child, [ORG], PARENT_INV, 'child-1'))).toBe('ACCOUNT_NOT_ELIGIBLE');
  });

  it('refuses a signed-in member of the inviting organization, except for a parent invitation', async () => {
    const err = await assertMayAcceptFor(claimed, [ORG], INV, 'u1').catch(e => e);
    expect(err.code).toBe('ALREADY_MEMBER');
    expect(err.status).toBe(409);
    expect(await assertMayAcceptFor(claimed, [ORG], PARENT_INV, 'u1')).toEqual({ claim: false });
  });

  it('refuses a deactivated account signed in with an old session', async () => {
    expect(await code(() => assertMayAcceptFor({ ...claimed, isActive: false }, [], INV, 'u1'))).toBe('ACCOUNT_NOT_ELIGIBLE');
  });

  it('never accepts for a site admin, even signed in as them', async () => {
    const admin = { ...claimed, isSiteAdmin: true };
    expect(await code(() => assertMayAcceptFor(admin, [], INV, 'u1'))).toBe('ACCOUNT_NOT_ELIGIBLE');
    expect(await code(() => assertMayAcceptFor(admin, [], INV, undefined))).toBe('ACCOUNT_NOT_ELIGIBLE');
  });
});
