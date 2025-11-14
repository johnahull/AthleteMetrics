/**
 * Component tests for BreadcrumbNavigation
 * Tests rendering, links, accessibility, and user interactions
 */

import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import '@testing-library/jest-dom';
import { BreadcrumbNavigation } from '../breadcrumb-navigation';
import { Home, Users } from 'lucide-react';

// Mock wouter's Link component
vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('BreadcrumbNavigation', () => {
  describe('Rendering', () => {
    it('should render breadcrumb navigation with all items', () => {
      const items = [
        { label: 'Dashboard', href: '/', icon: Home },
        { label: 'Athletes', href: '/athletes', icon: Users },
        { label: 'John Smith' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Athletes')).toBeInTheDocument();
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    it('should render with custom className', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Current Page' },
      ];

      const { container } = render(
        <BreadcrumbNavigation items={items} className="custom-breadcrumb" />
      );

      const nav = container.querySelector('nav');
      expect(nav).toHaveClass('custom-breadcrumb');
    });

    it('should render empty when items array is empty', () => {
      render(<BreadcrumbNavigation items={[]} />);

      const nav = screen.getByRole('navigation');
      expect(nav).toBeInTheDocument();
      // Should still have aria-label (shadcn/ui uses lowercase "breadcrumb")
      expect(nav).toHaveAttribute('aria-label', 'breadcrumb');
    });
  });

  describe('Links', () => {
    it('should render clickable links for items with href', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Athletes', href: '/athletes' },
        { label: 'Current Page' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      const dashboardLink = screen.getByRole('link', { name: /dashboard/i });
      const athletesLink = screen.getByRole('link', { name: /athletes/i });

      expect(dashboardLink).toHaveAttribute('href', '/');
      expect(athletesLink).toHaveAttribute('href', '/athletes');
    });

    it('should not render link for current page (last item without href)', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Current Page' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      // Current page should not be an actual <a> link element
      // shadcn/ui BreadcrumbPage uses role="link" but it's not an <a> element
      const links = screen.getAllByRole('link');
      const actualLinks = links.filter(link => link.tagName === 'A');

      expect(actualLinks).toHaveLength(1); // Only Dashboard should be an actual link
      expect(screen.getByText('Current Page')).toBeInTheDocument();
    });

    it('should have correct href attributes', () => {
      const items = [
        { label: 'Home', href: '/' },
        { label: 'Teams', href: '/teams' },
        { label: 'Reports', href: '/reports' },
        { label: 'Current' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      expect(screen.getByRole('link', { name: /home/i })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: /teams/i })).toHaveAttribute('href', '/teams');
      expect(screen.getByRole('link', { name: /reports/i })).toHaveAttribute('href', '/reports');
    });
  });

  describe('Icons', () => {
    it('should render icons when provided', () => {
      const items = [
        { label: 'Dashboard', href: '/', icon: Home },
        { label: 'Current Page' },
      ];

      const { container } = render(<BreadcrumbNavigation items={items} />);

      // Check that SVG elements are rendered (lucide-react renders as svg)
      const svgs = container.querySelectorAll('svg');
      expect(svgs.length).toBeGreaterThan(0);
    });

    it('should work without icons', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Athletes', href: '/athletes' },
        { label: 'Current Page' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Athletes')).toBeInTheDocument();
      expect(screen.getByText('Current Page')).toBeInTheDocument();
    });
  });

  describe('Separators', () => {
    it('should render separators between items', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Athletes', href: '/athletes' },
        { label: 'Current Page' },
      ];

      const { container } = render(<BreadcrumbNavigation items={items} />);

      // ChevronRight separators should be rendered
      const separators = container.querySelectorAll('[role="presentation"]');
      // Should have 2 separators for 3 items
      expect(separators.length).toBe(2);
    });

    it('should not render separator after last item', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Current Page' },
      ];

      const { container } = render(<BreadcrumbNavigation items={items} />);

      // Should only have 1 separator for 2 items
      const separators = container.querySelectorAll('[role="presentation"]');
      expect(separators.length).toBe(1);
    });

    it('should have aria-hidden on separators', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Current Page' },
      ];

      const { container } = render(<BreadcrumbNavigation items={items} />);

      const separators = container.querySelectorAll('[role="presentation"]');
      separators.forEach(separator => {
        expect(separator).toHaveAttribute('aria-hidden', 'true');
      });
    });
  });

  describe('Accessibility', () => {
    it('should have nav element with aria-label', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Current Page' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      const nav = screen.getByRole('navigation');
      // shadcn/ui uses lowercase "breadcrumb" for aria-label
      expect(nav).toHaveAttribute('aria-label', 'breadcrumb');
    });

    it('should use ordered list for semantic structure', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Athletes', href: '/athletes' },
        { label: 'Current Page' },
      ];

      const { container } = render(<BreadcrumbNavigation items={items} />);

      const ol = container.querySelector('ol');
      expect(ol).toBeInTheDocument();
    });

    it('should mark current page with aria-current', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Current Page' },
      ];

      const { container } = render(<BreadcrumbNavigation items={items} />);

      // The last item should have aria-current="page"
      const currentPage = container.querySelector('[aria-current="page"]');
      expect(currentPage).toBeInTheDocument();
      expect(currentPage).toHaveTextContent('Current Page');
    });

    it('should have aria-disabled on current page', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Current Page' },
      ];

      const { container } = render(<BreadcrumbNavigation items={items} />);

      const currentPage = container.querySelector('[aria-disabled="true"]');
      expect(currentPage).toBeInTheDocument();
      expect(currentPage).toHaveTextContent('Current Page');
    });

    it('should be keyboard navigable', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Athletes', href: '/athletes' },
        { label: 'Current Page' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      const links = screen.getAllByRole('link');
      links.forEach(link => {
        // Links should be focusable (no tabindex=-1)
        expect(link).not.toHaveAttribute('tabindex', '-1');
      });
    });
  });

  describe('Label Truncation', () => {
    it('should handle long labels', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        {
          label: 'This is a very long breadcrumb label that might need to be truncated',
          href: '/long-page',
        },
        { label: 'Current Page' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      const longLabel = screen.getByText(
        'This is a very long breadcrumb label that might need to be truncated'
      );
      expect(longLabel).toBeInTheDocument();
    });
  });

  describe('Edge Cases', () => {
    it('should handle single item', () => {
      const items = [{ label: 'Only Page' }];

      render(<BreadcrumbNavigation items={items} />);

      expect(screen.getByText('Only Page')).toBeInTheDocument();

      // No separators should be rendered for single item
      const { container } = render(<BreadcrumbNavigation items={items} />);
      const separators = container.querySelectorAll('[role="presentation"]');
      expect(separators.length).toBe(0);
    });

    it('should handle items with special characters in labels', () => {
      const items = [
        { label: 'Dashboard & Home', href: '/' },
        { label: 'Teams > Varsity', href: '/teams' },
        { label: "John's Profile" },
      ];

      render(<BreadcrumbNavigation items={items} />);

      expect(screen.getByText('Dashboard & Home')).toBeInTheDocument();
      expect(screen.getByText('Teams > Varsity')).toBeInTheDocument();
      expect(screen.getByText("John's Profile")).toBeInTheDocument();
    });

    it('should render with all items having href (no current page)', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Athletes', href: '/athletes' },
        { label: 'Profile', href: '/profile' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      const links = screen.getAllByRole('link');
      expect(links).toHaveLength(3);
    });

    it('should handle undefined entityData', () => {
      const items = [
        { label: 'Dashboard', href: '/' },
        { label: 'Page' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      expect(screen.getByText('Dashboard')).toBeInTheDocument();
      expect(screen.getByText('Page')).toBeInTheDocument();
    });
  });

  describe('Integration', () => {
    it('should work with typical athlete profile breadcrumbs', () => {
      const items = [
        { label: 'Dashboard', href: '/', icon: Home },
        { label: 'Athletes', href: '/athletes', icon: Users },
        { label: 'John Smith' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      expect(screen.getByRole('navigation')).toBeInTheDocument();
      expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: /athletes/i })).toHaveAttribute('href', '/athletes');
      expect(screen.getByText('John Smith')).toBeInTheDocument();
    });

    it('should work with typical team page breadcrumbs', () => {
      const items = [
        { label: 'Dashboard', href: '/', icon: Home },
        { label: 'Teams', href: '/teams', icon: Users },
        { label: 'Varsity Soccer' },
      ];

      render(<BreadcrumbNavigation items={items} />);

      expect(screen.getByRole('link', { name: /dashboard/i })).toHaveAttribute('href', '/');
      expect(screen.getByRole('link', { name: /teams/i })).toHaveAttribute('href', '/teams');
      expect(screen.getByText('Varsity Soccer')).toBeInTheDocument();
    });
  });
});
