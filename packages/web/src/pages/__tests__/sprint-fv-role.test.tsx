/**
 * The Sprint F-V athlete picker is for org admins and coaches of the organization the
 * page is showing (organizationContext, else the first membership) and site admins.
 * The session role (role in the alphabetically-first org) must not decide it.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import SprintFvPage from '../sprint-fv';
import type { EnhancedUser, UserOrganization } from '@/lib/types/user';

let mockUser: EnhancedUser | null = null;
let mockOrganizationContext: string | null = null;
let mockUserOrganizations: UserOrganization[] | null = null;

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    organizationContext: mockOrganizationContext,
    userOrganizations: mockUserOrganizations,
  })),
}));

vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(({ queryKey }: { queryKey: unknown[] }) => {
    const key = String(queryKey[0]);
    if (key.startsWith('/api/site-settings')) return { data: { sprintFvEnabled: true }, isLoading: false };
    if (key.startsWith('/api/organizations/')) return { data: { sprintFvEnabled: true }, isLoading: false };
    return { data: [], isLoading: false };
  }),
}));

vi.mock('@/lib/sprint-fv-api', () => ({ useEligibleSummary: vi.fn(() => ({ data: [] })) }));
vi.mock('@/components/sprint-fv/SprintFvSessionSelector', () => ({ SprintFvSessionSelector: () => null }));
vi.mock('@/components/sprint-fv/SprintFvProfileList', () => ({ SprintFvProfileList: () => null }));
vi.mock('@/components/sprint-fv/SprintFvLongitudinal', () => ({ SprintFvLongitudinal: () => null }));
vi.mock('@/components/sprint-fv/UnitSystemToggle', () => ({ UnitSystemToggle: () => null }));
vi.mock('@/contexts/UnitSystemContext', () => ({
  UnitSystemProvider: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const baseUser: EnhancedUser = {
  id: 'u1',
  username: 'u1',
  email: 'u1@test.com',
  firstName: 'U',
  lastName: 'One',
  isSiteAdmin: false,
  primaryOrganizationId: 'org-a',
};
const membership = (role: UserOrganization['role'], organizationId: string): UserOrganization => ({
  organizationId,
  organizationName: organizationId,
  role,
  createdAt: '',
});
// Coach in org A, athlete in org B.
const coachInAAthleteInB = [membership('coach', 'org-a'), membership('athlete', 'org-b')];

const athletePicker = () => screen.queryByText('Select an athlete...');

describe('SprintFvPage role gating', () => {
  beforeEach(() => {
    mockUser = null;
    mockOrganizationContext = null;
    mockUserOrganizations = null;
  });

  it('shows the athlete picker to a coach of the organization in context (session role athlete)', () => {
    mockUser = { ...baseUser, role: 'athlete' };
    mockUserOrganizations = coachInAAthleteInB;
    mockOrganizationContext = 'org-a';
    render(<SprintFvPage />);
    expect(athletePicker()).toBeInTheDocument();
  });

  it('hides the athlete picker where the user is only an athlete (session role coach)', () => {
    mockUser = { ...baseUser, role: 'coach' };
    mockUserOrganizations = coachInAAthleteInB;
    mockOrganizationContext = 'org-b';
    render(<SprintFvPage />);
    expect(athletePicker()).not.toBeInTheDocument();
  });

  it('uses the first membership when no organization is in context', () => {
    mockUser = { ...baseUser, role: 'athlete' };
    mockUserOrganizations = coachInAAthleteInB;
    render(<SprintFvPage />);
    expect(athletePicker()).toBeInTheDocument();
  });

  it('shows the athlete picker to a site admin', () => {
    mockUser = { ...baseUser, isSiteAdmin: true, role: 'site_admin' };
    mockOrganizationContext = 'org-b';
    render(<SprintFvPage />);
    expect(athletePicker()).toBeInTheDocument();
  });
});
