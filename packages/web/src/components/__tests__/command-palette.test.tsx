/**
 * Command palette quick actions are listed when the user is a site admin or ANY of their
 * memberships grants the action's permission - never from the session role (user.role).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { CommandPalette } from '../command-palette/command-palette';
import type { EnhancedUser, UserOrganization } from '@/lib/types/user';

let mockUser: EnhancedUser | null = null;
let mockUserOrganizations: UserOrganization[] | null = null;

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser, userOrganizations: mockUserOrganizations })),
}));
vi.mock('wouter', () => ({ useLocation: vi.fn(() => ['/', vi.fn()]) }));
vi.mock('../command-palette/command-palette-provider', () => ({
  useCommandPalette: vi.fn(() => ({ isOpen: true, close: vi.fn() })),
}));
vi.mock('@/hooks/use-global-search', () => ({
  useGlobalSearch: vi.fn(() => ({ data: undefined, isLoading: false })),
}));
vi.mock('@/hooks/use-metric-labels', () => ({ useMetricLabels: vi.fn(() => ({ getLabel: (m: string) => m })) }));
vi.mock('@/lib/recent-items', () => ({ getRecentItems: () => [], addRecentItem: vi.fn() }));
vi.mock('@/components/ui/command', () => {
  const Pass = ({ children }: { children?: React.ReactNode }) => <div>{children}</div>;
  return {
    CommandDialog: Pass,
    CommandEmpty: Pass,
    CommandGroup: Pass,
    CommandInput: () => null,
    CommandItem: Pass,
    CommandList: Pass,
    CommandSeparator: () => null,
  };
});

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

// 'Add Measurement' is gated by CREATE_MEASUREMENTS (as are View Analytics, Import CSV, Settings).
const hasQuickActions = () => screen.queryByText(/Add Measurement/i) !== null;

describe('CommandPalette permission gating', () => {
  beforeEach(() => {
    mockUser = null;
    mockUserOrganizations = null;
  });

  it('lists measurement actions for a coach in A + athlete in B, in either order', () => {
    mockUser = { ...baseUser, role: 'athlete' };
    mockUserOrganizations = [membership('coach', 'a'), membership('athlete', 'b')];
    const { unmount } = render(<CommandPalette />);
    expect(hasQuickActions()).toBe(true);
    unmount();
    mockUserOrganizations = [membership('athlete', 'a'), membership('coach', 'b')];
    render(<CommandPalette />);
    expect(hasQuickActions()).toBe(true);
  });

  it('denies a session-role-only coach whose memberships are all athlete', () => {
    mockUser = { ...baseUser, role: 'coach' };
    mockUserOrganizations = [membership('athlete', 'a')];
    render(<CommandPalette />);
    expect(hasQuickActions()).toBe(false);
  });

  it('fails closed while memberships have not loaded', () => {
    mockUser = { ...baseUser, role: 'coach' };
    mockUserOrganizations = null;
    render(<CommandPalette />);
    expect(hasQuickActions()).toBe(false);
  });

  it('allows a site admin', () => {
    mockUser = { ...baseUser, isSiteAdmin: true };
    render(<CommandPalette />);
    expect(hasQuickActions()).toBe(true);
  });
});
