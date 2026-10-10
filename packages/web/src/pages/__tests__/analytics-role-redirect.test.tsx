/**
 * /analytics forwards to the coach or athlete dashboard by the user's role in the
 * organization the page is showing (organizationContext, else the first membership),
 * never by the session role (role in the alphabetically-first org).
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render } from '@testing-library/react';
import Analytics from '../analytics';
import type { EnhancedUser, UserOrganization } from '@/lib/types/user';

let mockUser: EnhancedUser | null = null;
let mockOrganizationContext: string | null = null;
let mockUserOrganizations: UserOrganization[] | null = null;
const mockSetLocation = vi.fn();

vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({
    user: mockUser,
    organizationContext: mockOrganizationContext,
    userOrganizations: mockUserOrganizations,
  })),
}));
vi.mock('wouter', () => ({ useLocation: vi.fn(() => ['/analytics', mockSetLocation]) }));
vi.mock('@tanstack/react-query', () => ({
  useQuery: vi.fn(() => ({ data: undefined })),
  useMutation: vi.fn(() => ({ mutate: vi.fn(), isPending: false })),
  useQueryClient: vi.fn(() => ({ invalidateQueries: vi.fn() })),
}));
vi.mock('@/hooks/use-toast', () => ({ useToast: vi.fn(() => ({ toast: vi.fn() })) }));
vi.mock('@/components/charts/distribution-chart', () => ({ default: () => null }));
vi.mock('@/components/charts/scatter-chart', () => ({ default: () => null }));
vi.mock('@/components/analytics/StatisticsSummaryCard', () => ({ StatisticsSummaryCard: () => null }));
vi.mock('@/hooks/useContextualLabels', () => ({
  useContextualLabels: vi.fn(() => ({ team: 'Team', teams: 'Teams' })),
}));
vi.mock('@/hooks/use-metric-labels', () => ({ useMetricLabels: vi.fn(() => ({ getLabel: (m: string) => m })) }));

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
// Coach in org A, athlete in org B.
const coachInAAthleteInB = [membership('coach', 'org-a'), membership('athlete', 'org-b')];

describe('Analytics role redirect', () => {
  beforeEach(() => {
    mockSetLocation.mockClear();
    mockUser = null;
    mockOrganizationContext = null;
    mockUserOrganizations = null;
  });

  it('sends a coach of the organization in context to coach analytics (session role athlete)', () => {
    mockUser = { ...baseUser, role: 'athlete' };
    mockUserOrganizations = coachInAAthleteInB;
    mockOrganizationContext = 'org-a';
    render(<Analytics />);
    expect(mockSetLocation).toHaveBeenCalledWith('/coach-analytics');
  });

  it('sends an athlete of the organization in context to athlete analytics (session role coach)', () => {
    mockUser = { ...baseUser, role: 'coach' };
    mockUserOrganizations = coachInAAthleteInB;
    mockOrganizationContext = 'org-b';
    render(<Analytics />);
    expect(mockSetLocation).toHaveBeenCalledWith('/athlete-analytics');
    expect(mockSetLocation).not.toHaveBeenCalledWith('/coach-analytics');
  });

  it('uses the first membership when no organization is in context', () => {
    mockUser = { ...baseUser, role: 'athlete' };
    mockUserOrganizations = coachInAAthleteInB;
    render(<Analytics />);
    expect(mockSetLocation).toHaveBeenCalledWith('/coach-analytics');
  });

  it('sends a site admin to coach analytics', () => {
    mockUser = { ...baseUser, isSiteAdmin: true, role: 'site_admin' };
    render(<Analytics />);
    expect(mockSetLocation).toHaveBeenCalledWith('/coach-analytics');
  });

  it('waits while memberships are loading, then redirects once they load (no loop)', () => {
    mockUser = { ...baseUser, role: 'athlete' };
    mockUserOrganizations = null;
    const { rerender } = render(<Analytics />);
    expect(mockSetLocation).not.toHaveBeenCalled();
    mockUserOrganizations = coachInAAthleteInB;
    rerender(<Analytics />);
    expect(mockSetLocation).toHaveBeenCalledTimes(1);
    expect(mockSetLocation).toHaveBeenCalledWith('/coach-analytics');
    rerender(<Analytics />);
    expect(mockSetLocation).toHaveBeenCalledTimes(1);
  });

  it('leaves a parent on /analytics (no redirect, as before: only exact athlete/coach/org_admin matched)', () => {
    mockUser = { ...baseUser, role: 'parent' as EnhancedUser['role'] };
    mockUserOrganizations = [membership('parent', 'org-a')];
    mockOrganizationContext = 'org-a';
    const { rerender } = render(<Analytics />);
    rerender(<Analytics />);
    expect(mockSetLocation).not.toHaveBeenCalled();
  });

  it('sends a loaded user with zero memberships to athlete analytics, once', () => {
    mockUser = { ...baseUser, role: 'coach' };
    mockUserOrganizations = [];
    const { rerender } = render(<Analytics />);
    expect(mockSetLocation).toHaveBeenCalledTimes(1);
    expect(mockSetLocation).toHaveBeenCalledWith('/athlete-analytics');
    rerender(<Analytics />);
    expect(mockSetLocation).toHaveBeenCalledTimes(1);
  });
});
