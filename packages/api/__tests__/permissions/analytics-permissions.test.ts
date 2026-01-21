/**
 * Unit tests for analytics-specific permission helpers
 *
 * Tests authorization rules for analytics endpoints:
 * - Self-access patterns (athletes can only view own data)
 * - Coach-only features (leaderboards, rankings)
 * - Cross-organization query permissions
 *
 * @see packages/api/permissions/analytics-helpers.ts
 */

import { describe, it, expect } from 'vitest';

// Import analytics permission helpers (will fail initially - TDD red phase)
import {
  canViewUserStats,
  canAccessLeaderboard,
  canAccessMostImproved,
  canAccessAtRiskData,
  canAccessCoachAnalytics,
} from '../../permissions/analytics-helpers';

describe('Analytics Permission Helpers', () => {
  describe('canViewUserStats', () => {
    it('should allow site admin to view any user stats', () => {
      const user = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };
      const result = canViewUserStats(user as any, 'any-user-id');
      expect(result.allowed).toBe(true);
    });

    it('should allow athlete to view their own stats', () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = canViewUserStats(user as any, 'athlete-1');
      expect(result.allowed).toBe(true);
    });

    it('should deny athlete from viewing another users stats', () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = canViewUserStats(user as any, 'athlete-2');
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('own statistics');
    });

    it('should allow coach to view any user stats in their org', () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      const result = canViewUserStats(user as any, 'athlete-1');
      expect(result.allowed).toBe(true);
    });

    it('should allow org_admin to view any user stats', () => {
      const user = { id: 'admin-1', isSiteAdmin: false, role: 'org_admin' };
      const result = canViewUserStats(user as any, 'athlete-1');
      expect(result.allowed).toBe(true);
    });
  });

  describe('canAccessLeaderboard', () => {
    it('should allow site admin to access leaderboard', () => {
      const user = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };
      const result = canAccessLeaderboard(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should allow coach to access leaderboard', () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      const result = canAccessLeaderboard(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should allow org_admin to access leaderboard', () => {
      const user = { id: 'admin-1', isSiteAdmin: false, role: 'org_admin' };
      const result = canAccessLeaderboard(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should deny athlete from accessing leaderboard', () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = canAccessLeaderboard(user as any);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cannot view leaderboards');
    });

    it('should deny guest from accessing leaderboard', () => {
      const user = { id: 'guest-1', isSiteAdmin: false, role: 'guest' };
      const result = canAccessLeaderboard(user as any);
      expect(result.allowed).toBe(false);
    });
  });

  describe('canAccessMostImproved', () => {
    it('should allow site admin to access most-improved', () => {
      const user = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };
      const result = canAccessMostImproved(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should allow coach to access most-improved', () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      const result = canAccessMostImproved(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should deny athlete from accessing most-improved', () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = canAccessMostImproved(user as any);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cannot view improvement rankings');
    });
  });

  describe('canAccessAtRiskData', () => {
    it('should allow site admin to access at-risk data', () => {
      const user = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };
      const result = canAccessAtRiskData(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should allow coach to access at-risk data', () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      const result = canAccessAtRiskData(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should deny athlete from accessing at-risk data', () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = canAccessAtRiskData(user as any);
      expect(result.allowed).toBe(false);
      expect(result.reason).toContain('cannot view at-risk data');
    });
  });

  describe('canAccessCoachAnalytics', () => {
    it('should allow site admin to access coach analytics', () => {
      const user = { id: 'admin-1', isSiteAdmin: true, role: 'site_admin' };
      const result = canAccessCoachAnalytics(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should allow coach to access coach analytics', () => {
      const user = { id: 'coach-1', isSiteAdmin: false, role: 'coach' };
      const result = canAccessCoachAnalytics(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should allow org_admin to access coach analytics', () => {
      const user = { id: 'admin-1', isSiteAdmin: false, role: 'org_admin' };
      const result = canAccessCoachAnalytics(user as any);
      expect(result.allowed).toBe(true);
    });

    it('should deny athlete from accessing coach analytics', () => {
      const user = { id: 'athlete-1', isSiteAdmin: false, role: 'athlete' };
      const result = canAccessCoachAnalytics(user as any);
      expect(result.allowed).toBe(false);
    });

    it('should deny guest from accessing coach analytics', () => {
      const user = { id: 'guest-1', isSiteAdmin: false, role: 'guest' };
      const result = canAccessCoachAnalytics(user as any);
      expect(result.allowed).toBe(false);
    });
  });

  describe('Edge Cases: Null/Undefined Role', () => {
    it('should deny access to user stats with null role', () => {
      const user = { id: 'user-1', isSiteAdmin: false, role: null };
      const result = canViewUserStats(user as any, 'another-user');
      expect(result.allowed).toBe(false);
    });

    it('should deny access to user stats with undefined role', () => {
      const user = { id: 'user-1', isSiteAdmin: false };
      const result = canViewUserStats(user as any, 'another-user');
      expect(result.allowed).toBe(false);
    });

    it('should deny leaderboard access with null role', () => {
      const user = { id: 'user-1', isSiteAdmin: false, role: null };
      const result = canAccessLeaderboard(user as any);
      expect(result.allowed).toBe(false);
    });

    it('should deny leaderboard access with undefined role', () => {
      const user = { id: 'user-1', isSiteAdmin: false };
      const result = canAccessLeaderboard(user as any);
      expect(result.allowed).toBe(false);
    });

    it('should deny most-improved access with null role', () => {
      const user = { id: 'user-1', isSiteAdmin: false, role: null };
      const result = canAccessMostImproved(user as any);
      expect(result.allowed).toBe(false);
    });

    it('should deny at-risk data access with null role', () => {
      const user = { id: 'user-1', isSiteAdmin: false, role: null };
      const result = canAccessAtRiskData(user as any);
      expect(result.allowed).toBe(false);
    });

    it('should deny coach analytics access with null role', () => {
      const user = { id: 'user-1', isSiteAdmin: false, role: null };
      const result = canAccessCoachAnalytics(user as any);
      expect(result.allowed).toBe(false);
    });

    it('should deny self-access for user stats with null role (no valid role)', () => {
      const user = { id: 'user-1', isSiteAdmin: false, role: null };
      const result = canViewUserStats(user as any, 'user-1');
      // Users with no role cannot access anything (security-conscious default)
      expect(result.allowed).toBe(false);
    });
  });
});
