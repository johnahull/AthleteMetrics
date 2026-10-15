/**
 * The Quick add measurement shortcut is listed for anyone who is an org_admin or coach in
 * at least one of their organizations (or a site admin) - never from the session role.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { KeyboardShortcutsDialog } from '../keyboard-shortcuts-dialog';
import type { EnhancedUser, UserOrganization } from '@/lib/types/user';

let mockUser: EnhancedUser | null = null;
let mockUserOrganizations: UserOrganization[] | null = null;

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser, userOrganizations: mockUserOrganizations })),
}));

const baseUser: EnhancedUser = {
  id: 'u1',
  username: 'u1',
  email: 'u1@test.com',
  firstName: 'U',
  lastName: 'One',
  isSiteAdmin: false,
};
const membership = (role: UserOrganization['role'], organizationId: string): UserOrganization => ({
  organizationId,
  organizationName: organizationId,
  role,
  createdAt: '',
});

const renderDialog = () => render(<KeyboardShortcutsDialog open onOpenChange={() => {}} />);

describe('KeyboardShortcutsDialog', () => {
  beforeEach(() => {
    mockUser = null;
    mockUserOrganizations = null;
  });

  it('lists Quick add measurement for a coach in org A who is an athlete in org B', () => {
    mockUser = baseUser;
    mockUserOrganizations = [membership('athlete', 'org-b'), membership('coach', 'org-a')];
    renderDialog();
    expect(screen.getByText('Quick add measurement')).toBeInTheDocument();
  });

  it('hides Quick add measurement for an athlete-only member, even with a coach session role', () => {
    mockUser = { ...baseUser, role: 'coach' };
    mockUserOrganizations = [membership('athlete', 'org-b')];
    renderDialog();
    expect(screen.queryByText('Quick add measurement')).not.toBeInTheDocument();
    expect(screen.getByText('Show keyboard shortcuts help')).toBeInTheDocument();
  });

  it('lists Quick add measurement for a site admin without memberships', () => {
    mockUser = { ...baseUser, isSiteAdmin: true };
    renderDialog();
    expect(screen.getByText('Quick add measurement')).toBeInTheDocument();
  });
});
