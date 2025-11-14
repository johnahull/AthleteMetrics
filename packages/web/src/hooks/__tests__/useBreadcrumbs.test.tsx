/**
 * Hook tests for useBreadcrumbs
 * Tests breadcrumb generation for different page types
 */

import { describe, it, expect } from 'vitest';
import { renderHook } from '@testing-library/react';
import { useBreadcrumbs } from '../useBreadcrumbs';
import { Home, Users, FileText, User } from 'lucide-react';

describe('useBreadcrumbs', () => {
  describe('Athlete Pages', () => {
    it('should generate breadcrumbs for athlete profile with full name', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('athlete', {
          firstName: 'John',
          lastName: 'Smith',
          fullName: 'John Smith'
        })
      );

      expect(result.current).toHaveLength(3);

      // Dashboard
      expect(result.current[0]).toEqual({
        label: 'Dashboard',
        href: '/',
        icon: Home,
      });

      // Athletes
      expect(result.current[1]).toEqual({
        label: 'Athletes',
        href: '/athletes',
        icon: Users,
      });

      // Current athlete (no href)
      expect(result.current[2]).toEqual({
        label: 'John Smith',
        icon: User,
      });
    });

    it('should generate breadcrumbs for athlete profile using fullName', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('athlete', {
          fullName: 'Jane Doe'
        })
      );

      expect(result.current).toHaveLength(3);
      expect(result.current[2]).toEqual({
        label: 'Jane Doe',
        icon: User,
      });
    });

    it('should generate breadcrumbs for athlete profile with firstName only', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('athlete', {
          firstName: 'Bob'
        })
      );

      expect(result.current).toHaveLength(3);
      expect(result.current[2]).toEqual({
        label: 'Bob',
        icon: User,
      });
    });

    it('should use "Athlete" as fallback when no name provided', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('athlete')
      );

      expect(result.current).toHaveLength(3);
      expect(result.current[2]).toEqual({
        label: 'Athlete',
        icon: User,
      });
    });
  });

  describe('Team Pages', () => {
    it('should generate breadcrumbs for team page with team name', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('team', { name: 'Varsity Soccer' })
      );

      expect(result.current).toHaveLength(3);

      // Dashboard
      expect(result.current[0]).toEqual({
        label: 'Dashboard',
        href: '/',
        icon: Home,
      });

      // Teams
      expect(result.current[1]).toEqual({
        label: 'Teams',
        href: '/teams',
        icon: Users,
      });

      // Current team (no href)
      expect(result.current[2]).toEqual({
        label: 'Varsity Soccer',
        icon: Users,
      });
    });

    it('should use "Team" as fallback when no name provided', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('team')
      );

      expect(result.current).toHaveLength(3);
      expect(result.current[2]).toEqual({
        label: 'Team',
        icon: Users,
      });
    });
  });

  describe('Report Pages', () => {
    it('should generate breadcrumbs for report page with report name', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('report', { name: 'Weekly Performance Report' })
      );

      expect(result.current).toHaveLength(3);

      // Dashboard
      expect(result.current[0]).toEqual({
        label: 'Dashboard',
        href: '/',
        icon: Home,
      });

      // Reports
      expect(result.current[1]).toEqual({
        label: 'Reports',
        href: '/reports',
        icon: FileText,
      });

      // Current report (no href)
      expect(result.current[2]).toEqual({
        label: 'Weekly Performance Report',
        icon: FileText,
      });
    });

    it('should use "Report" as fallback when no name provided', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('report')
      );

      expect(result.current).toHaveLength(3);
      expect(result.current[2]).toEqual({
        label: 'Report',
        icon: FileText,
      });
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty strings gracefully', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('athlete', {
          firstName: '',
          lastName: '',
          fullName: ''
        })
      );

      expect(result.current).toHaveLength(3);
      expect(result.current[2]).toEqual({
        label: 'Athlete',
        icon: User,
      });
    });

    it('should construct name from firstName and lastName when fullName is missing', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('athlete', {
          firstName: 'Alice',
          lastName: 'Johnson'
        })
      );

      expect(result.current).toHaveLength(3);
      expect(result.current[2]).toEqual({
        label: 'Alice Johnson',
        icon: User,
      });
    });

    it('should always include Dashboard as first item', () => {
      const athleteResult = renderHook(() => useBreadcrumbs('athlete')).result;
      const teamResult = renderHook(() => useBreadcrumbs('team')).result;
      const reportResult = renderHook(() => useBreadcrumbs('report')).result;

      expect(athleteResult.current[0].label).toBe('Dashboard');
      expect(athleteResult.current[0].href).toBe('/');

      expect(teamResult.current[0].label).toBe('Dashboard');
      expect(teamResult.current[0].href).toBe('/');

      expect(reportResult.current[0].label).toBe('Dashboard');
      expect(reportResult.current[0].href).toBe('/');
    });

    it('should not include href in the last item (current page)', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('athlete', { fullName: 'Test Athlete' })
      );

      const lastItem = result.current[result.current.length - 1];
      expect(lastItem.href).toBeUndefined();
    });

    it('should include href in all items except the last', () => {
      const { result } = renderHook(() =>
        useBreadcrumbs('athlete', { fullName: 'Test Athlete' })
      );

      for (let i = 0; i < result.current.length - 1; i++) {
        expect(result.current[i].href).toBeDefined();
      }
    });
  });
});
