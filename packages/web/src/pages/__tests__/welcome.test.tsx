/**
 * Tests for Welcome landing page
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent } from '@testing-library/react';
import '@testing-library/jest-dom';
import Welcome from '../welcome';
import type { EnhancedUser } from '@/lib/types/user';

// Mock state that can be changed per test
let mockUser: EnhancedUser | null = null;
const mockSetLocation = vi.fn();

// Mock modules
vi.mock('@/lib/auth', () => ({
  useAuth: vi.fn(() => ({ user: mockUser })),
}));

vi.mock('wouter', () => ({
  useLocation: () => ['/', mockSetLocation],
}));

describe('Welcome Page', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockUser = null; // Reset to unauthenticated state
  });

  describe('Rendering for Unauthenticated Users', () => {
    it('should render the welcome page correctly', () => {
      render(<Welcome />);

      // Check branding
      expect(screen.getByText('AthleteMetrics')).toBeInTheDocument();
      expect(screen.getByText('Track, analyze, and improve athletic performance')).toBeInTheDocument();

      // Check buttons
      expect(screen.getByRole('button', { name: /sign in/i })).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /accept invitation/i })).toBeInTheDocument();

      // Check feature highlights
      expect(screen.getByText('Team Management')).toBeInTheDocument();
      expect(screen.getByText('Performance Analytics')).toBeInTheDocument();
      expect(screen.getByText('Data-Driven Insights')).toBeInTheDocument();

      // Check footer
      expect(screen.getByText('For coaches, admins, and athletes')).toBeInTheDocument();
    });

    it('should have AthleteMetrics logo icon', () => {
      const { container } = render(<Welcome />);

      // The BarChart3 icon should be rendered
      const iconContainer = container.querySelector('.bg-primary');
      expect(iconContainer).toBeInTheDocument();
    });
  });

  describe('Navigation', () => {
    it('should navigate to /login when Sign In button is clicked', () => {
      render(<Welcome />);

      const signInButton = screen.getByRole('button', { name: /sign in/i });
      fireEvent.click(signInButton);

      expect(mockSetLocation).toHaveBeenCalledWith('/login');
    });

    it('should navigate to /accept-invitation when Accept Invitation button is clicked', () => {
      render(<Welcome />);

      const acceptInvitationButton = screen.getByRole('button', { name: /accept invitation/i });
      fireEvent.click(acceptInvitationButton);

      expect(mockSetLocation).toHaveBeenCalledWith('/accept-invitation');
    });
  });

  describe('Authenticated User Behavior', () => {
    it('should not render content when user is authenticated', () => {
      // Set authenticated user state
      mockUser = {
        id: '1',
        username: 'testuser',
        firstName: 'Test',
        lastName: 'User',
        email: 'test@example.com',
        role: 'coach',
        isSiteAdmin: false,
        organizations: [],
      };

      render(<Welcome />);

      // The component should return null for authenticated users (early return)
      expect(screen.queryByText('AthleteMetrics')).not.toBeInTheDocument();
      expect(screen.queryByRole('button', { name: /sign in/i })).not.toBeInTheDocument();
    });

    it('should call setLocation with /dashboard when authenticated user is detected', () => {
      // Set authenticated user state
      mockUser = {
        id: '2',
        username: 'admin',
        firstName: 'Admin',
        lastName: 'User',
        email: 'admin@example.com',
        role: 'org_admin',
        isSiteAdmin: false,
        organizations: [],
      };

      render(<Welcome />);

      // Should attempt to redirect to dashboard
      expect(mockSetLocation).toHaveBeenCalledWith('/dashboard');
    });
  });

  describe('UI Elements', () => {
    it('should display the "or" divider', () => {
      render(<Welcome />);
      expect(screen.getByText('or')).toBeInTheDocument();
    });

    it('should display invitation prompt text', () => {
      render(<Welcome />);
      expect(screen.getByText('Have an invitation code?')).toBeInTheDocument();
    });

    it('should have responsive design classes', () => {
      const { container } = render(<Welcome />);

      const mainContainer = container.querySelector('.min-h-screen');
      expect(mainContainer).toHaveClass('bg-gradient-to-br', 'from-slate-50', 'to-slate-100');
    });
  });

  describe('Accessibility', () => {
    it('should have proper button roles', () => {
      render(<Welcome />);

      const buttons = screen.getAllByRole('button');
      expect(buttons).toHaveLength(2); // Sign In and Accept Invitation buttons
    });

    it('should have descriptive text for all features', () => {
      render(<Welcome />);

      // All feature pills should have descriptive text
      expect(screen.getByText('Team Management')).toBeInTheDocument();
      expect(screen.getByText('Performance Analytics')).toBeInTheDocument();
      expect(screen.getByText('Data-Driven Insights')).toBeInTheDocument();
    });
  });
});
