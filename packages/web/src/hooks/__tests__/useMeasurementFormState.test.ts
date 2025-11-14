/**
 * Unit tests for useMeasurementFormState hook
 * Tests form state persistence with localStorage
 */

import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useMeasurementFormState } from '../useMeasurementFormState';

describe('useMeasurementFormState', () => {
  const userId = 'user-123';

  // Helper to get a recent date (not stale - within 30 days)
  const getRecentDate = () => {
    const date = new Date();
    date.setDate(date.getDate() - 5); // 5 days ago
    return date.toISOString().split('T')[0];
  };

  beforeEach(() => {
    localStorage.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    localStorage.clear();
  });

  describe('Initialization', () => {
    it('should initialize with null values when no stored state', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      expect(result.current.lastMetric).toBeNull();
      expect(result.current.lastDate).toBeNull();
      expect(result.current.lastTeamId).toBeNull();
    });

    it('should restore stored state on mount', () => {
      const recentDate = getRecentDate();

      // Pre-populate localStorage
      localStorage.setItem(
        `measurement-form-state-${userId}`,
        JSON.stringify({
          lastMetric: 'FLY10_TIME',
          lastDate: recentDate,
          lastTeamId: 'team-123'
        })
      );

      const { result } = renderHook(() => useMeasurementFormState(userId));

      expect(result.current.lastMetric).toBe('FLY10_TIME');
      expect(result.current.lastDate).toBe(recentDate);
      expect(result.current.lastTeamId).toBe('team-123');
    });

    it('should handle partial stored state', () => {
      localStorage.setItem(
        `measurement-form-state-${userId}`,
        JSON.stringify({
          lastMetric: 'FLY10_TIME'
          // lastDate and lastTeamId missing
        })
      );

      const { result } = renderHook(() => useMeasurementFormState(userId));

      expect(result.current.lastMetric).toBe('FLY10_TIME');
      expect(result.current.lastDate).toBeNull();
      expect(result.current.lastTeamId).toBeNull();
    });

    it('should handle corrupted stored data gracefully', () => {
      localStorage.setItem(
        `measurement-form-state-${userId}`,
        'invalid-json{{'
      );

      const { result } = renderHook(() => useMeasurementFormState(userId));

      expect(result.current.lastMetric).toBeNull();
      expect(result.current.lastDate).toBeNull();
      expect(result.current.lastTeamId).toBeNull();
    });
  });

  describe('Update metric', () => {
    it('should update metric and persist to localStorage', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateMetric('VERTICAL_JUMP');
      });

      expect(result.current.lastMetric).toBe('VERTICAL_JUMP');

      // Verify localStorage
      const stored = JSON.parse(
        localStorage.getItem(`measurement-form-state-${userId}`) || '{}'
      );
      expect(stored.lastMetric).toBe('VERTICAL_JUMP');
    });

    it('should preserve other fields when updating metric', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateDate(getRecentDate());
        result.current.updateTeam('team-123');
        result.current.updateMetric('FLY10_TIME');
      });

      expect(result.current.lastMetric).toBe('FLY10_TIME');
      expect(result.current.lastDate).toBe(getRecentDate());
      expect(result.current.lastTeamId).toBe('team-123');
    });

    it('should handle null metric update', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateMetric('FLY10_TIME');
      });

      expect(result.current.lastMetric).toBe('FLY10_TIME');

      act(() => {
        result.current.updateMetric(null);
      });

      expect(result.current.lastMetric).toBeNull();
    });
  });

  describe('Update date', () => {
    it('should update date and persist to localStorage', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateDate('2024-02-15');
      });

      expect(result.current.lastDate).toBe('2024-02-15');

      const stored = JSON.parse(
        localStorage.getItem(`measurement-form-state-${userId}`) || '{}'
      );
      expect(stored.lastDate).toBe('2024-02-15');
    });

    it('should preserve other fields when updating date', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateMetric('FLY10_TIME');
        result.current.updateTeam('team-123');
        result.current.updateDate(getRecentDate());
      });

      expect(result.current.lastDate).toBe(getRecentDate());
      expect(result.current.lastMetric).toBe('FLY10_TIME');
      expect(result.current.lastTeamId).toBe('team-123');
    });

    it('should handle null date update', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateDate(getRecentDate());
      });

      expect(result.current.lastDate).toBe(getRecentDate());

      act(() => {
        result.current.updateDate(null);
      });

      expect(result.current.lastDate).toBeNull();
    });

    it('should clear stale dates (>30 days old)', () => {
      const staleDate = new Date();
      staleDate.setDate(staleDate.getDate() - 31);
      const staleDateStr = staleDate.toISOString().split('T')[0];

      localStorage.setItem(
        `measurement-form-state-${userId}`,
        JSON.stringify({
          lastDate: staleDateStr,
          lastMetric: 'FLY10_TIME'
        })
      );

      const { result } = renderHook(() => useMeasurementFormState(userId));

      // Stale date should be cleared
      expect(result.current.lastDate).toBeNull();
      // Other fields should remain
      expect(result.current.lastMetric).toBe('FLY10_TIME');
    });

    it('should preserve recent dates (<30 days old)', () => {
      const recentDate = new Date();
      recentDate.setDate(recentDate.getDate() - 15);
      const recentDateStr = recentDate.toISOString().split('T')[0];

      localStorage.setItem(
        `measurement-form-state-${userId}`,
        JSON.stringify({
          lastDate: recentDateStr,
          lastMetric: 'FLY10_TIME'
        })
      );

      const { result } = renderHook(() => useMeasurementFormState(userId));

      expect(result.current.lastDate).toBe(recentDateStr);
    });
  });

  describe('Update team', () => {
    it('should update team and persist to localStorage', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateTeam('team-456');
      });

      expect(result.current.lastTeamId).toBe('team-456');

      const stored = JSON.parse(
        localStorage.getItem(`measurement-form-state-${userId}`) || '{}'
      );
      expect(stored.lastTeamId).toBe('team-456');
    });

    it('should preserve other fields when updating team', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateMetric('FLY10_TIME');
        result.current.updateDate(getRecentDate());
        result.current.updateTeam('team-123');
      });

      expect(result.current.lastTeamId).toBe('team-123');
      expect(result.current.lastMetric).toBe('FLY10_TIME');
      expect(result.current.lastDate).toBe(getRecentDate());
    });

    it('should handle null team update', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateTeam('team-123');
      });

      expect(result.current.lastTeamId).toBe('team-123');

      act(() => {
        result.current.updateTeam(null);
      });

      expect(result.current.lastTeamId).toBeNull();
    });
  });

  describe('Clear state', () => {
    it('should clear all persisted state', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateMetric('FLY10_TIME');
        result.current.updateDate(getRecentDate());
        result.current.updateTeam('team-123');
      });

      expect(result.current.lastMetric).toBe('FLY10_TIME');
      expect(result.current.lastDate).toBe(getRecentDate());
      expect(result.current.lastTeamId).toBe('team-123');

      act(() => {
        result.current.clear();
      });

      expect(result.current.lastMetric).toBeNull();
      expect(result.current.lastDate).toBeNull();
      expect(result.current.lastTeamId).toBeNull();

      // Verify localStorage is cleared
      const stored = localStorage.getItem(`measurement-form-state-${userId}`);
      expect(stored).toBeNull();
    });

    it('should handle clearing already empty state', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      expect(() => {
        act(() => {
          result.current.clear();
        });
      }).not.toThrow();

      expect(result.current.lastMetric).toBeNull();
      expect(result.current.lastDate).toBeNull();
      expect(result.current.lastTeamId).toBeNull();
    });
  });

  describe('User scoping', () => {
    it('should isolate state between different users', () => {
      const { result: user1Result } = renderHook(() =>
        useMeasurementFormState('user-1')
      );
      const { result: user2Result } = renderHook(() =>
        useMeasurementFormState('user-2')
      );

      act(() => {
        user1Result.current.updateMetric('FLY10_TIME');
        user1Result.current.updateDate(getRecentDate());
      });

      act(() => {
        user2Result.current.updateMetric('VERTICAL_JUMP');
        user2Result.current.updateDate('2024-02-01');
      });

      expect(user1Result.current.lastMetric).toBe('FLY10_TIME');
      expect(user1Result.current.lastDate).toBe(getRecentDate());

      expect(user2Result.current.lastMetric).toBe('VERTICAL_JUMP');
      expect(user2Result.current.lastDate).toBe('2024-02-01');
    });

    it('should not allow cross-user data access', () => {
      const { result: user1Result } = renderHook(() =>
        useMeasurementFormState('user-1')
      );

      act(() => {
        user1Result.current.updateMetric('FLY10_TIME');
      });

      // Create new hook for user-2
      const { result: user2Result } = renderHook(() =>
        useMeasurementFormState('user-2')
      );

      // User 2 should not see user 1's data
      expect(user2Result.current.lastMetric).toBeNull();
    });
  });

  describe('Component remount persistence', () => {
    it('should restore state after component remount', () => {
      const { result, unmount } = renderHook(() =>
        useMeasurementFormState(userId)
      );

      // Use a recent date that won't be considered stale
      const recentDate = new Date().toISOString().split('T')[0];

      act(() => {
        result.current.updateMetric('FLY10_TIME');
        result.current.updateDate(recentDate);
        result.current.updateTeam('team-123');
      });

      unmount();

      // Remount hook
      const { result: remountedResult } = renderHook(() =>
        useMeasurementFormState(userId)
      );

      expect(remountedResult.current.lastMetric).toBe('FLY10_TIME');
      expect(remountedResult.current.lastDate).toBe(recentDate);
      expect(remountedResult.current.lastTeamId).toBe('team-123');
    });
  });

  describe('Error handling', () => {
    it('should handle localStorage unavailable gracefully', () => {
      // Mock localStorage to throw
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new Error('localStorage disabled');
      });

      const { result } = renderHook(() => useMeasurementFormState(userId));

      // Should not throw
      expect(() => {
        act(() => {
          result.current.updateMetric('FLY10_TIME');
        });
      }).not.toThrow();

      // State should still update in memory
      expect(result.current.lastMetric).toBe('FLY10_TIME');

      localStorage.setItem = originalSetItem;
    });

    it('should handle localStorage quota exceeded', () => {
      const originalSetItem = localStorage.setItem;
      localStorage.setItem = vi.fn(() => {
        throw new DOMException('QuotaExceededError', 'QuotaExceededError');
      });

      const { result } = renderHook(() => useMeasurementFormState(userId));

      expect(() => {
        act(() => {
          result.current.updateMetric('FLY10_TIME');
        });
      }).not.toThrow();

      // Should still work in memory
      expect(result.current.lastMetric).toBe('FLY10_TIME');

      localStorage.setItem = originalSetItem;
    });
  });

  describe('Metric validation', () => {
    it('should accept valid metric codes', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      const validMetrics = [
        'FLY10_TIME',
        'VERTICAL_JUMP',
        'AGILITY_505',
        'AGILITY_5105',
        'T_TEST',
        'DASH_40YD',
        'RSI'
      ];

      validMetrics.forEach((metric) => {
        act(() => {
          result.current.updateMetric(metric);
        });
        expect(result.current.lastMetric).toBe(metric);
      });
    });

    it('should handle custom metric codes', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateMetric('CUSTOM_METRIC_123');
      });

      expect(result.current.lastMetric).toBe('CUSTOM_METRIC_123');
    });
  });

  describe('Date validation', () => {
    it('should accept valid ISO date strings', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      const validDates = [
        getRecentDate(),
        '2024-12-31',
        '2023-06-15'
      ];

      validDates.forEach((date) => {
        act(() => {
          result.current.updateDate(date);
        });
        expect(result.current.lastDate).toBe(date);
      });
    });

    it('should handle invalid date formats gracefully', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      act(() => {
        result.current.updateDate('invalid-date');
      });

      // Should still store (validation happens in form)
      expect(result.current.lastDate).toBe('invalid-date');
    });
  });

  describe('Team validation', () => {
    it('should accept valid team IDs', () => {
      const { result } = renderHook(() => useMeasurementFormState(userId));

      const validTeamIds = [
        'team-123',
        'uuid-abc-def-ghi',
        '00000000-0000-0000-0000-000000000000'
      ];

      validTeamIds.forEach((teamId) => {
        act(() => {
          result.current.updateTeam(teamId);
        });
        expect(result.current.lastTeamId).toBe(teamId);
      });
    });
  });
});
