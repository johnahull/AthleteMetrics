/**
 * Unit tests for CoachAnalytics component
 * Tests loading states, organization context handling, and error states
 */

import React from 'react';
import { render, screen } from '@testing-library/react';
import { describe, it, expect, beforeEach, vi } from 'vitest';
import { CoachAnalytics } from '../CoachAnalytics';

// Mock dependencies
vi.mock('@/lib/auth');
vi.mock('@/components/analytics/BaseAnalyticsView', () => ({
  BaseAnalyticsView: ({ title }: { title: string }) => <div data-testid="base-analytics-view">{title}</div>
}));
vi.mock('@/utils/dev-logger', () => ({
  devLog: {
    log: vi.fn(),
    warn: vi.fn(),
    error: vi.fn()
  }
}));

import { useAuth } from '@/lib/auth';

describe('CoachAnalytics', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  describe('Loading States', () => {
    it('should show loading state while auth is being established', () => {
      (useAuth as any).mockReturnValue({
        user: null,
        isLoading: true,
        organizationContext: null,
        userOrganizations: null
      });

      render(<CoachAnalytics />);

      expect(screen.getByText('Loading organization...')).toBeInTheDocument();
      expect(screen.getByText('Setting up your team analytics dashboard')).toBeInTheDocument();
    });

    it('should show loading state even with user when isLoading is true', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach' },
        isLoading: true,
        organizationContext: 'org-123',
        userOrganizations: [{ organizationId: 'org-123' }]
      });

      render(<CoachAnalytics />);

      expect(screen.getByText('Loading organization...')).toBeInTheDocument();
    });
  });

  describe('Authentication States', () => {
    it('should show login message when user is not authenticated', () => {
      (useAuth as any).mockReturnValue({
        user: null,
        isLoading: false,
        organizationContext: null,
        userOrganizations: null
      });

      render(<CoachAnalytics />);

      expect(screen.getByText('Please log in to access analytics.')).toBeInTheDocument();
    });
  });

  describe('Organization Context Handling', () => {
    it('should render analytics when organizationContext is available', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        isLoading: false,
        organizationContext: 'org-123',
        userOrganizations: [{ organizationId: 'org-123' }]
      });

      render(<CoachAnalytics />);

      expect(screen.getByTestId('base-analytics-view')).toBeInTheDocument();
      expect(screen.getByText('Team Analytics Dashboard')).toBeInTheDocument();
    });

    it('should render analytics when userOrganizations is available but organizationContext is null', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        isLoading: false,
        organizationContext: null,
        userOrganizations: [{ organizationId: 'org-456' }]
      });

      render(<CoachAnalytics />);

      expect(screen.getByTestId('base-analytics-view')).toBeInTheDocument();
    });

    it('should show error when no organization is found', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        isLoading: false,
        organizationContext: null,
        userOrganizations: []
      });

      render(<CoachAnalytics />);

      expect(screen.getByText('No Organization Found')).toBeInTheDocument();
      expect(screen.getByText(/You are not associated with any organization/i)).toBeInTheDocument();
      expect(screen.getByText(/Please contact your administrator/i)).toBeInTheDocument();
    });

    it('should show error when userOrganizations is null', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        isLoading: false,
        organizationContext: null,
        userOrganizations: null
      });

      render(<CoachAnalytics />);

      expect(screen.getByText('No Organization Found')).toBeInTheDocument();
    });
  });

  describe('Organization ID Priority', () => {
    it('should prioritize organizationContext over userOrganizations', () => {
      const mockUseAuth = vi.fn().mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        isLoading: false,
        organizationContext: 'org-from-context',
        userOrganizations: [{ organizationId: 'org-from-user-orgs' }]
      });
      (useAuth as any).mockImplementation(mockUseAuth);

      render(<CoachAnalytics />);

      // Component should render successfully with organizationContext
      expect(screen.getByTestId('base-analytics-view')).toBeInTheDocument();
    });

    it('should use first userOrganization when organizationContext is missing', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        isLoading: false,
        organizationContext: null,
        userOrganizations: [
          { organizationId: 'first-org' },
          { organizationId: 'second-org' }
        ]
      });

      render(<CoachAnalytics />);

      // Should render successfully using first organization
      expect(screen.getByTestId('base-analytics-view')).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty userOrganizations array gracefully', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'coach', isSiteAdmin: false },
        isLoading: false,
        organizationContext: null,
        userOrganizations: []
      });

      render(<CoachAnalytics />);

      expect(screen.getByText('No Organization Found')).toBeInTheDocument();
    });

    it('should handle site admin with no organization', () => {
      (useAuth as any).mockReturnValue({
        user: { id: 'user-1', role: 'site_admin', isSiteAdmin: true },
        isLoading: false,
        organizationContext: null,
        userOrganizations: []
      });

      render(<CoachAnalytics />);

      expect(screen.getByText('No Organization Found')).toBeInTheDocument();
    });
  });
});
