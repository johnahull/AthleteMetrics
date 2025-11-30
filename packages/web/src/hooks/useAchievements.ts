/**
 * useAchievements Hook
 *
 * Fetches and manages achievement data for athletes.
 * Provides access to achievement definitions and user's unlocked achievements.
 *
 * Uses the /api/achievements endpoints.
 */

import { useQuery, UseQueryResult } from '@tanstack/react-query';

/**
 * Achievement definition (master catalog)
 */
export interface AchievementDefinition {
  id: string;
  code: string;
  name: string;
  description: string | null;
  category: string;
  icon: string | null;
  color: string | null;
  rarity: string;
  isActive: boolean;
  createdAt: Date;
}

/**
 * User achievement (unlocked badge)
 */
export interface UserAchievement {
  id: string;
  organizationId: string;
  userId: string;
  achievementId: string;
  unlockedAt: Date;
  metadata: Record<string, unknown> | null;
  achievement: AchievementDefinition;
}

interface UseAchievementsOptions {
  /** Whether to fetch the data */
  enabled?: boolean;
  /** Override stale time (default 60 seconds) */
  staleTime?: number;
}

/**
 * Fetch all achievement definitions
 */
export function useAchievementDefinitions(
  options: UseAchievementsOptions = {}
): UseQueryResult<AchievementDefinition[]> {
  const { enabled = true, staleTime = 5 * 60 * 1000 } = options; // 5 min cache

  return useQuery({
    queryKey: ['/api/achievements'],
    queryFn: async () => {
      const response = await fetch('/api/achievements', {
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch achievements' }));
        throw new Error(error.message || 'Failed to fetch achievements');
      }
      const data = await response.json();
      return data.achievements;
    },
    enabled,
    staleTime,
    gcTime: 30 * 60 * 1000, // Keep in cache for 30 minutes
  });
}

/**
 * Fetch user's unlocked achievements
 */
export function useAchievements(
  userId: string | undefined,
  organizationId: string | undefined,
  options: UseAchievementsOptions = {}
): UseQueryResult<UserAchievement[]> {
  const { enabled = true, staleTime = 60 * 1000 } = options;

  return useQuery({
    queryKey: ['/api/achievements/user', userId, organizationId],
    queryFn: async () => {
      const params = new URLSearchParams();
      if (userId) params.set('userId', userId);

      const response = await fetch(`/api/achievements/user?${params.toString()}`, {
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch user achievements' }));
        throw new Error(error.message || 'Failed to fetch user achievements');
      }
      const data = await response.json();
      return data.achievements;
    },
    enabled: !!userId && !!organizationId && enabled,
    staleTime,
    gcTime: 10 * 60 * 1000,
  });
}

/**
 * Fetch recently unlocked achievements (last 7 days)
 */
export function useRecentAchievements(
  options: UseAchievementsOptions = {}
): UseQueryResult<UserAchievement[]> {
  const { enabled = true, staleTime = 30 * 1000 } = options; // 30 sec for recent

  return useQuery({
    queryKey: ['/api/achievements/recent'],
    queryFn: async () => {
      const response = await fetch('/api/achievements/recent', {
        credentials: 'include',
      });
      if (!response.ok) {
        const error = await response.json().catch(() => ({ message: 'Failed to fetch recent achievements' }));
        throw new Error(error.message || 'Failed to fetch recent achievements');
      }
      const data = await response.json();
      return data.achievements;
    },
    enabled,
    staleTime,
    gcTime: 5 * 60 * 1000,
  });
}

/**
 * Get achievements grouped by category
 */
export function useAchievementsGrouped(
  userId: string | undefined,
  organizationId: string | undefined,
  options: UseAchievementsOptions = {}
): {
  achievementsByCategory: Record<string, { unlocked: UserAchievement[]; locked: AchievementDefinition[] }>;
  unlockedCount: number;
  totalCount: number;
  isLoading: boolean;
  isError: boolean;
  error: Error | null;
} {
  const definitionsQuery = useAchievementDefinitions(options);
  const userQuery = useAchievements(userId, organizationId, options);

  const achievementsByCategory: Record<string, { unlocked: UserAchievement[]; locked: AchievementDefinition[] }> = {};

  const definitions = definitionsQuery.data ?? [];
  const userAchievements = userQuery.data ?? [];
  const unlockedCodes = new Set(userAchievements.map(ua => ua.achievement.code));

  // Group by category
  for (const def of definitions) {
    if (!achievementsByCategory[def.category]) {
      achievementsByCategory[def.category] = { unlocked: [], locked: [] };
    }

    const userAchievement = userAchievements.find(ua => ua.achievement.code === def.code);
    if (userAchievement) {
      achievementsByCategory[def.category].unlocked.push(userAchievement);
    } else {
      achievementsByCategory[def.category].locked.push(def);
    }
  }

  return {
    achievementsByCategory,
    unlockedCount: userAchievements.length,
    totalCount: definitions.length,
    isLoading: definitionsQuery.isLoading || userQuery.isLoading,
    isError: definitionsQuery.isError || userQuery.isError,
    error: definitionsQuery.error || userQuery.error,
  };
}

/**
 * Rarity configuration for styling
 */
export const RARITY_CONFIG = {
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
} as const;

/**
 * Category configuration for styling
 */
export const CATEGORY_CONFIG = {
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
} as const;
