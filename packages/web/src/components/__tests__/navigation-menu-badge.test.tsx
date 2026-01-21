/**
 * Tests for badge support in NavigationMenu component
 */

import { describe, it, expect, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import { NavigationMenu } from '../navigation-menu';
import { Calendar } from 'lucide-react';

// Mock wouter
vi.mock('wouter', () => ({
  Link: ({ children, href }: { children: React.ReactNode; href: string }) => (
    <a href={href}>{children}</a>
  ),
}));

describe('NavigationMenu - Badge Support', () => {
  it('should render navigation item without badge when badge is 0', () => {
    const navigation = [
      {
        name: 'My Events',
        href: '/my-events',
        icon: Calendar,
        badge: 0,
      },
    ];

    render(<NavigationMenu navigation={navigation} currentLocation="/" />);

    expect(screen.getByText('My Events')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('should render navigation item without badge when badge is undefined', () => {
    const navigation = [
      {
        name: 'My Events',
        href: '/my-events',
        icon: Calendar,
        // badge is undefined
      },
    ];

    render(<NavigationMenu navigation={navigation} currentLocation="/" />);

    expect(screen.getByText('My Events')).toBeInTheDocument();
    // No badge element should be present
    const navItem = screen.getByText('My Events').closest('div');
    expect(navItem?.querySelector('span[class*="badge"]')).not.toBeInTheDocument();
  });

  it('should render badge with correct count when badge > 0', () => {
    const navigation = [
      {
        name: 'My Events',
        href: '/my-events',
        icon: Calendar,
        badge: 3,
      },
    ];

    render(<NavigationMenu navigation={navigation} currentLocation="/" />);

    expect(screen.getByText('My Events')).toBeInTheDocument();
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('should apply amber styling to badge', () => {
    const navigation = [
      {
        name: 'My Events',
        href: '/my-events',
        icon: Calendar,
        badge: 5,
      },
    ];

    render(<NavigationMenu navigation={navigation} currentLocation="/" />);

    const badge = screen.getByText('5');
    expect(badge).toHaveClass('bg-amber-500');
    expect(badge).toHaveClass('text-white');
  });

  it('should render multiple nav items, some with badges and some without', () => {
    const navigation = [
      {
        name: 'Dashboard',
        href: '/dashboard',
        icon: Calendar,
        // no badge
      },
      {
        name: 'My Events',
        href: '/my-events',
        icon: Calendar,
        badge: 2,
      },
      {
        name: 'Settings',
        href: '/settings',
        icon: Calendar,
        badge: 0,
      },
    ];

    render(<NavigationMenu navigation={navigation} currentLocation="/" />);

    expect(screen.getByText('Dashboard')).toBeInTheDocument();
    expect(screen.getByText('My Events')).toBeInTheDocument();
    expect(screen.getByText('Settings')).toBeInTheDocument();

    // Only "My Events" should have a badge
    expect(screen.getByText('2')).toBeInTheDocument();
    expect(screen.queryByText('0')).not.toBeInTheDocument();
  });

  it('should position badge with ml-auto', () => {
    const navigation = [
      {
        name: 'My Events',
        href: '/my-events',
        icon: Calendar,
        badge: 7,
      },
    ];

    render(<NavigationMenu navigation={navigation} currentLocation="/" />);

    const badge = screen.getByText('7');
    expect(badge).toHaveClass('ml-auto');
  });
});
