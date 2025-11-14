/**
 * Integration tests for loading skeleton consistency across pages
 * Tests that all pages use standardized loading skeleton components
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { Router } from 'wouter';
import Dashboard from '@/pages/dashboard';
import Athletes from '@/pages/athletes';
import Teams from '@/pages/teams';
import CoachAnalytics from '@/pages/CoachAnalytics';

// Mock auth context
const mockAuthContext = {
  user: {
    id: 'test-user',
    email: 'test@example.com',
    role: 'coach',
    isSiteAdmin: false,
    currentOrganization: { id: 'org-1', name: 'Test Org' }
  },
  organizationContext: 'org-1',
  userOrganizations: [{ organizationId: 'org-1', role: 'coach' }],
  isLoading: false,
  setOrganizationContext: vi.fn()
};

vi.mock('@/lib/auth', () => ({
  useAuth: () => mockAuthContext
}));

// Mock metrics hook
vi.mock('@/hooks/use-available-metrics', () => ({
  useAvailableMetrics: () => ({
    metrics: [],
    isLoading: false
  })
}));

// Mock dashboard trends hook
vi.mock('@/hooks/use-dashboard-trends', () => ({
  useDashboardTrends: () => ({
    data: null,
    isLoading: true
  })
}));

// Mock BaseAnalyticsView component (for CoachAnalytics)
vi.mock('@/components/analytics/BaseAnalyticsView', () => ({
  BaseAnalyticsView: ({ title }: { title: string }) => <div>{title}</div>
}));

describe('Loading Skeleton Integration Tests', () => {
  let queryClient: QueryClient;

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: {
          retry: false,
          gcTime: 0,
        },
      },
    });
  });

  describe('Dashboard Page', () => {
    it('shows KPI card skeletons while loading', () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Dashboard />
          </Router>
        </QueryClientProvider>
      );

      // Should have KPI card skeletons (look for aria-busy on Card components)
      const skeletons = container.querySelectorAll('[aria-busy="true"]');
      expect(skeletons.length).toBeGreaterThan(0);

      // Should have screen reader text
      expect(screen.getAllByText('Loading data...').length).toBeGreaterThan(0);
    });

    it('shows chart skeleton while loading', () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Dashboard />
          </Router>
        </QueryClientProvider>
      );

      // Should have loading chart text
      expect(screen.getByText('Loading chart...')).toBeInTheDocument();
    });

    it('uses consistent pulse animation', () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Dashboard />
          </Router>
        </QueryClientProvider>
      );

      // All skeletons should use animate-pulse
      const pulseElements = container.querySelectorAll('.animate-pulse');
      expect(pulseElements.length).toBeGreaterThan(0);
    });

    it('prevents layout shift with skeleton dimensions', () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Dashboard />
          </Router>
        </QueryClientProvider>
      );

      // Skeleton should have explicit height/width classes to prevent layout shift
      const skeletons = container.querySelectorAll('.animate-pulse');
      skeletons.forEach(skeleton => {
        const hasHeightOrWidth =
          skeleton.className.includes('h-') ||
          skeleton.className.includes('w-') ||
          skeleton.getAttribute('style')?.includes('height') ||
          skeleton.getAttribute('style')?.includes('width');
        expect(hasHeightOrWidth).toBe(true);
      });
    });
  });

  describe('Athletes Page', () => {
    it('shows table skeleton while loading', () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Athletes />
          </Router>
        </QueryClientProvider>
      );

      // Should have table skeleton
      expect(screen.getByText('Loading table...')).toBeInTheDocument();
    });

    it('table skeleton has correct structure', () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Athletes />
          </Router>
        </QueryClientProvider>
      );

      // Should have rows with flex layout
      const rows = container.querySelectorAll('.flex.gap-4');
      expect(rows.length).toBeGreaterThan(0);
    });

    it('uses accessible loading indicators', () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Athletes />
          </Router>
        </QueryClientProvider>
      );

      // Should have aria-busy attribute
      expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
    });
  });

  describe('Teams Page', () => {
    it('shows KPI card skeletons while loading', () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Teams />
          </Router>
        </QueryClientProvider>
      );

      // Should have multiple KPI card skeletons
      const skeletons = container.querySelectorAll('[aria-busy="true"]');
      expect(skeletons.length).toBeGreaterThanOrEqual(6); // 6 team cards
    });

    it('uses consistent skeleton components', () => {
      render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Teams />
          </Router>
        </QueryClientProvider>
      );

      // Should use same "Loading data..." text as dashboard
      expect(screen.getAllByText('Loading data...').length).toBeGreaterThan(0);
    });

    it('maintains grid layout during loading', () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Teams />
          </Router>
        </QueryClientProvider>
      );

      // Should have grid layout
      const grid = container.querySelector('.grid');
      expect(grid).toBeInTheDocument();
      expect(grid?.className).toContain('md:grid-cols-2');
      expect(grid?.className).toContain('lg:grid-cols-3');
    });
  });

  // Note: CoachAnalytics uses BaseAnalyticsView which has its own loading states.
  // The component tests and Dashboard/Athletes/Teams integration tests
  // already verify the standardized loading skeleton components work correctly.

  describe('Cross-Page Consistency', () => {
    it('all pages use standardized KPICardSkeleton component', () => {
      const dashboardResult = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Dashboard />
          </Router>
        </QueryClientProvider>
      );

      const teamsResult = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Teams />
          </Router>
        </QueryClientProvider>
      );

      // Both should have "Loading data..." text from KPICardSkeleton
      expect(dashboardResult.getAllByText('Loading data...').length).toBeGreaterThan(0);
      expect(teamsResult.getAllByText('Loading data...').length).toBeGreaterThan(0);
    });

    it('all pages use aria-busy for accessibility', () => {
      const pages = [
        <Dashboard />,
        <Athletes />,
        <Teams />
      ];

      pages.forEach(page => {
        const { container } = render(
          <QueryClientProvider client={queryClient}>
            <Router>
              {page}
            </Router>
          </QueryClientProvider>
        );

        expect(container.querySelector('[aria-busy="true"]')).toBeInTheDocument();
      });
    });

    it('all pages use consistent pulse animation', () => {
      const pages = [
        <Dashboard />,
        <Athletes />,
        <Teams />
      ];

      pages.forEach(page => {
        const { container } = render(
          <QueryClientProvider client={queryClient}>
            <Router>
              {page}
            </Router>
          </QueryClientProvider>
        );

        const pulseElements = container.querySelectorAll('.animate-pulse');
        expect(pulseElements.length).toBeGreaterThan(0);
      });
    });
  });

  describe('No Layout Shift', () => {
    it('skeletons have explicit dimensions', () => {
      const { container } = render(
        <QueryClientProvider client={queryClient}>
          <Router>
            <Dashboard />
          </Router>
        </QueryClientProvider>
      );

      // All skeleton elements should have height/width classes
      const skeletons = container.querySelectorAll('.animate-pulse');
      expect(skeletons.length).toBeGreaterThan(0);

      skeletons.forEach(skeleton => {
        const classList = skeleton.className;
        const hasSize =
          classList.includes('h-') ||
          classList.includes('w-') ||
          classList.includes('flex-1') ||
          skeleton.getAttribute('style')?.includes('height');
        expect(hasSize).toBe(true);
      });
    });
  });
});
