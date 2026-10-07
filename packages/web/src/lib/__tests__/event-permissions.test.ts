import { describe, it, expect } from 'vitest';
import { canManageEvent } from '../event-permissions';

const event = { organizationId: 'org-1' };
const member = (role: string, organizationId = 'org-1') => [{ organizationId, role }] as any;
const user = { isSiteAdmin: false } as any;

describe('canManageEvent', () => {
  it('allows a site admin for any event', () => {
    expect(canManageEvent({ isSiteAdmin: true } as any, null, event)).toBe(true);
    expect(canManageEvent({ isSiteAdmin: true } as any, null, { organizationId: null })).toBe(true);
  });

  it("allows a coach or org admin of the event's organization", () => {
    expect(canManageEvent(user, member('coach'), event)).toBe(true);
    expect(canManageEvent(user, member('org_admin'), event)).toBe(true);
  });

  it('denies athletes, other organizations, missing user/event and events without an organization', () => {
    expect(canManageEvent(user, member('athlete'), event)).toBe(false);
    expect(canManageEvent(user, member('coach', 'org-2'), event)).toBe(false);
    expect(canManageEvent(user, null, event)).toBe(false);
    expect(canManageEvent(null, member('coach'), event)).toBe(false);
    expect(canManageEvent(user, member('coach'), undefined)).toBe(false);
    expect(canManageEvent(user, member('coach'), { organizationId: null })).toBe(false);
  });
});
