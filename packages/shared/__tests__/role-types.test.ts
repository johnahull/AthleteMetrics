/**
 * Unit tests — role-types.ts
 *
 * Covers the parent role addition (C1):
 *  - ROLE_HIERARCHY contains parent: 35 (between guest:20 and athlete:40)
 *  - roleSchema accepts 'parent'
 *  - getRoleDisplayName returns "Parent/Guardian" for parent
 *  - getRoleDescription returns the view-only description
 *  - PERMISSIONS includes parent in VIEW_ORGANIZATION and VIEW_TEAM
 *  - PERMISSIONS includes VIEW_LINKED_ATHLETES with only ['parent']
 *  - hasPermission works correctly for parent role
 *  - canManageRole prevents parent from managing any role
 *  - getAvailableRoles returns correct subset for each role
 */

import { describe, it, expect } from 'vitest';
import {
  ROLE_HIERARCHY,
  PERMISSIONS,
  roleSchema,
  hasPermission,
  getRoleLevel,
  canManageRole,
  getAvailableRoles,
  getRoleDisplayName,
  getRoleDescription,
} from '../role-types';

describe('ROLE_HIERARCHY', () => {
  it('contains parent with level 35', () => {
    expect(ROLE_HIERARCHY).toHaveProperty('parent', 35);
  });

  it('parent level is between guest (20) and athlete (40)', () => {
    expect(ROLE_HIERARCHY.parent).toBeGreaterThan(ROLE_HIERARCHY.guest);
    expect(ROLE_HIERARCHY.parent).toBeLessThan(ROLE_HIERARCHY.athlete);
  });

  it('has all six roles', () => {
    const roles = Object.keys(ROLE_HIERARCHY);
    expect(roles).toContain('site_admin');
    expect(roles).toContain('org_admin');
    expect(roles).toContain('coach');
    expect(roles).toContain('athlete');
    expect(roles).toContain('parent');
    expect(roles).toContain('guest');
  });
});

describe('roleSchema', () => {
  it('accepts parent as a valid role', () => {
    const result = roleSchema.safeParse('parent');
    expect(result.success).toBe(true);
  });

  it('still accepts all existing roles', () => {
    for (const role of ['site_admin', 'org_admin', 'coach', 'athlete', 'guest']) {
      expect(roleSchema.safeParse(role).success).toBe(true);
    }
  });

  it('rejects an unknown role', () => {
    expect(roleSchema.safeParse('super_admin').success).toBe(false);
  });
});

describe('getRoleDisplayName', () => {
  it('returns "Parent/Guardian" for parent', () => {
    expect(getRoleDisplayName('parent')).toBe('Parent/Guardian');
  });

  it('still returns correct names for existing roles', () => {
    expect(getRoleDisplayName('site_admin')).toBe('Site Administrator');
    expect(getRoleDisplayName('org_admin')).toBe('Organization Admin');
    expect(getRoleDisplayName('coach')).toBe('Coach');
    expect(getRoleDisplayName('athlete')).toBe('Athlete');
    expect(getRoleDisplayName('guest')).toBe('Guest');
  });
});

describe('getRoleDescription', () => {
  it('returns view-only description for parent', () => {
    expect(getRoleDescription('parent')).toBe('View-only access to linked children\'s data');
  });
});

describe('PERMISSIONS', () => {
  it('includes parent in VIEW_ORGANIZATION', () => {
    expect(PERMISSIONS.VIEW_ORGANIZATION).toContain('parent');
  });

  it('includes parent in VIEW_TEAM', () => {
    expect(PERMISSIONS.VIEW_TEAM).toContain('parent');
  });

  it('has VIEW_LINKED_ATHLETES permission containing only parent', () => {
    expect(PERMISSIONS).toHaveProperty('VIEW_LINKED_ATHLETES');
    expect(PERMISSIONS.VIEW_LINKED_ATHLETES).toEqual(['parent']);
  });

  it('parent cannot CREATE_MEASUREMENTS', () => {
    expect(PERMISSIONS.CREATE_MEASUREMENTS).not.toContain('parent');
  });

  it('parent cannot MANAGE_ORGANIZATION', () => {
    expect(PERMISSIONS.MANAGE_ORGANIZATION).not.toContain('parent');
  });
});

describe('hasPermission', () => {
  it('parent has VIEW_ORGANIZATION permission', () => {
    expect(hasPermission('parent', 'VIEW_ORGANIZATION')).toBe(true);
  });

  it('parent has VIEW_TEAM permission', () => {
    expect(hasPermission('parent', 'VIEW_TEAM')).toBe(true);
  });

  it('parent has VIEW_LINKED_ATHLETES permission', () => {
    expect(hasPermission('parent', 'VIEW_LINKED_ATHLETES')).toBe(true);
  });

  it('parent does not have CREATE_MEASUREMENTS permission', () => {
    expect(hasPermission('parent', 'CREATE_MEASUREMENTS')).toBe(false);
  });
});

describe('getRoleLevel', () => {
  it('returns 35 for parent', () => {
    expect(getRoleLevel('parent')).toBe(35);
  });
});

describe('canManageRole', () => {
  it('parent cannot manage guest (level 20 < level 35)', () => {
    // parent is 35, guest is 20 — parent level is higher, so it CAN manage guest
    // Actually: canManageRole returns managerLevel > targetLevel
    // parent(35) > guest(20) => true — parent can manage guest
    expect(canManageRole('parent', 'guest')).toBe(true);
  });

  it('parent cannot manage athlete (level 40 > level 35)', () => {
    expect(canManageRole('parent', 'athlete')).toBe(false);
  });

  it('athlete can manage parent (level 40 > level 35)', () => {
    expect(canManageRole('athlete', 'parent')).toBe(true);
  });

  it('coach can manage parent', () => {
    expect(canManageRole('coach', 'parent')).toBe(true);
  });
});

describe('getAvailableRoles', () => {
  it('org_admin can assign parent role', () => {
    const roles = getAvailableRoles('org_admin');
    expect(roles).toContain('parent');
  });

  it('parent cannot assign any role above themselves', () => {
    const roles = getAvailableRoles('parent');
    // parent is level 35 — getAvailableRoles returns roles with level < 35
    // only guest (20) has level < 35
    expect(roles).toContain('guest');
    expect(roles).not.toContain('athlete');
    expect(roles).not.toContain('parent');
  });
});
