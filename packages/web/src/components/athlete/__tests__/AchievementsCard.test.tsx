/**
 * AchievementsCard Component Tests
 *
 * Tests for the achievements gallery display on athlete dashboard
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { AchievementsCard } from '../AchievementsCard';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import * as useAchievementsModule from '@/hooks/useAchievements';

// Mock the entire module
vi.mock('@/hooks/useAchievements', () => ({
  useAchievements: vi.fn(),
  useAchievementDefinitions: vi.fn(),
  RARITY_CONFIG: {
    common: {
      label: 'Common',
      borderColor: 'border-gray-400',
      bgColor: 'bg-gray-100',
      textColor: 'text-gray-600',
      glowColor: '',
    },
    rare: {
      label: 'Rare',
      borderColor: 'border-blue-500',
      bgColor: 'bg-blue-50',
      textColor: 'text-blue-600',
      glowColor: 'shadow-blue-200',
    },
    epic: {
      label: 'Epic',
      borderColor: 'border-purple-500',
      bgColor: 'bg-purple-50',
      textColor: 'text-purple-600',
      glowColor: 'shadow-purple-200',
    },
    legendary: {
      label: 'Legendary',
      borderColor: 'border-yellow-500',
      bgColor: 'bg-yellow-50',
      textColor: 'text-yellow-600',
      glowColor: 'shadow-yellow-200',
    },
  },
  CATEGORY_CONFIG: {
    performance: {
      label: 'Performance',
      icon: 'Trophy',
      color: 'text-yellow-600',
    },
    consistency: {
      label: 'Consistency',
      icon: 'Flame',
      color: 'text-orange-600',
    },
    improvement: {
      label: 'Improvement',
      icon: 'TrendingUp',
      color: 'text-green-600',
    },
    goal: {
      label: 'Goals',
      icon: 'Target',
      color: 'text-blue-600',
    },
  },
}));

const mockedUseAchievements = vi.mocked(useAchievementsModule.useAchievements);
const mockedUseAchievementDefinitions = vi.mocked(useAchievementsModule.useAchievementDefinitions);

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('AchievementsCard', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('should display unlocked achievements', () => {
    const mockUnlockedAchievements = [
      {
        id: 'ua-1',
        userId: 'user-123',
        organizationId: 'org-456',
        achievementId: 'def-1',
        unlockedAt: new Date(),
        metadata: { metric: 'FLY10_TIME', value: 1.2 },
        achievement: {
          id: 'def-1',
          code: 'FIRST_PR',
          name: 'First PR',
          description: 'Set your first personal record',
          category: 'performance',
          icon: 'Trophy',
          color: 'yellow',
          rarity: 'common',
          isActive: true,
          createdAt: new Date(),
        },
      },
    ];

    const mockAllDefinitions = [
      {
        id: 'def-1',
        code: 'FIRST_PR',
        name: 'First PR',
        description: 'Set your first personal record',
        category: 'performance',
        icon: 'Trophy',
        color: 'yellow',
        rarity: 'common',
        isActive: true,
        createdAt: new Date(),
      },
      {
        id: 'def-2',
        code: 'SPEED_DEMON',
        name: 'Speed Demon',
        description: 'Run 10-yard fly time under 1.0s',
        category: 'performance',
        icon: 'Zap',
        color: 'blue',
        rarity: 'rare',
        isActive: true,
        createdAt: new Date(),
      },
    ];

    mockedUseAchievements.mockReturnValue({
      data: mockUnlockedAchievements,
      isLoading: false,
      error: null,
    } as any);

    mockedUseAchievementDefinitions.mockReturnValue({
      data: mockAllDefinitions,
      isLoading: false,
      error: null,
    } as any);

    render(<AchievementsCard userId="user-123" organizationId="org-456" />, {
      wrapper: createWrapper(),
    });

    // Should show achievement count
    expect(screen.getByText(/Achievements \(1\/2\)/i)).toBeInTheDocument();

    // Should show unlocked achievement
    expect(screen.getByText('First PR')).toBeInTheDocument();

    // Should show locked count
    expect(screen.getByText(/1 more to unlock/i)).toBeInTheDocument();
  });

  it('should display loading state', () => {
    mockedUseAchievements.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    mockedUseAchievementDefinitions.mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    } as any);

    render(<AchievementsCard userId="user-123" organizationId="org-456" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText(/Loading achievements/i)).toBeInTheDocument();
  });

  it('should display empty state when no achievements', () => {
    mockedUseAchievements.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    } as any);

    mockedUseAchievementDefinitions.mockReturnValue({
      data: [
        {
          id: 'def-1',
          code: 'FIRST_PR',
          name: 'First PR',
          description: 'Set your first personal record',
          category: 'performance',
          icon: 'Trophy',
          color: 'yellow',
          rarity: 'common',
          isActive: true,
          createdAt: new Date(),
        },
      ],
      isLoading: false,
      error: null,
    } as any);

    render(<AchievementsCard userId="user-123" organizationId="org-456" />, {
      wrapper: createWrapper(),
    });

    expect(screen.getByText(/Achievements \(0\/1\)/i)).toBeInTheDocument();
    expect(screen.getByText(/Start training to unlock achievements/i)).toBeInTheDocument();
  });

  it('should group achievements by category', () => {
    const mockUnlockedAchievements = [
      {
        id: 'ua-1',
        userId: 'user-123',
        organizationId: 'org-456',
        achievementId: 'def-1',
        unlockedAt: new Date(),
        metadata: {},
        achievement: {
          id: 'def-1',
          code: 'FIRST_PR',
          name: 'First PR',
          description: 'Set your first personal record',
          category: 'performance',
          icon: 'Trophy',
          color: 'yellow',
          rarity: 'common',
          isActive: true,
          createdAt: new Date(),
        },
      },
      {
        id: 'ua-2',
        userId: 'user-123',
        organizationId: 'org-456',
        achievementId: 'def-2',
        unlockedAt: new Date(),
        metadata: {},
        achievement: {
          id: 'def-2',
          code: 'STREAK_5',
          name: '5-Day Streak',
          description: '5 measurements in a month',
          category: 'consistency',
          icon: 'Flame',
          color: 'orange',
          rarity: 'common',
          isActive: true,
          createdAt: new Date(),
        },
      },
    ];

    mockedUseAchievements.mockReturnValue({
      data: mockUnlockedAchievements,
      isLoading: false,
      error: null,
    } as any);

    mockedUseAchievementDefinitions.mockReturnValue({
      data: mockUnlockedAchievements.map(ua => ua.achievement),
      isLoading: false,
      error: null,
    } as any);

    render(<AchievementsCard userId="user-123" organizationId="org-456" />, {
      wrapper: createWrapper(),
    });

    // Should show category headings
    expect(screen.getByText('Performance')).toBeInTheDocument();
    expect(screen.getByText('Consistency')).toBeInTheDocument();
  });
});
