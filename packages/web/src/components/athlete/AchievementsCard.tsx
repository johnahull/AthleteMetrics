/**
 * AchievementsCard Component
 *
 * Displays an athlete's achievement gallery on their dashboard.
 * Shows unlocked badges with celebration styling and locked badges
 * with progress hints.
 *
 * Features:
 * - Grid display of achievement badges
 * - Category grouping
 * - Rarity-based styling
 * - Locked/unlocked states
 * - Progress toward total achievements
 */

import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import {
  Trophy,
  Zap,
  Flame,
  TrendingUp,
  Target,
  Medal,
  Star,
  Lock,
  Award,
} from 'lucide-react';
import {
  useAchievements,
  useAchievementDefinitions,
  RARITY_CONFIG,
  CATEGORY_CONFIG,
  type AchievementDefinition,
  type UserAchievement,
} from '@/hooks/useAchievements';
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from '@/components/ui/tooltip';

interface AchievementsCardProps {
  userId: string;
  organizationId: string;
  compact?: boolean;
}

/**
 * Map icon name to Lucide component
 */
function getIconComponent(iconName: string | null) {
  switch (iconName) {
    case 'Trophy':
      return Trophy;
    case 'Zap':
      return Zap;
    case 'Flame':
      return Flame;
    case 'TrendingUp':
      return TrendingUp;
    case 'Target':
      return Target;
    case 'Medal':
      return Medal;
    case 'Star':
      return Star;
    case 'Award':
      return Award;
    default:
      return Trophy;
  }
}

/**
 * Single achievement badge display
 */
function AchievementBadgeDisplay({
  achievement,
  isUnlocked,
  unlockedAt,
}: {
  achievement: AchievementDefinition;
  isUnlocked: boolean;
  unlockedAt?: Date;
}) {
  const Icon = getIconComponent(achievement.icon);
  const rarity = (achievement.rarity || 'common') as keyof typeof RARITY_CONFIG;
  const rarityConfig = RARITY_CONFIG[rarity] || RARITY_CONFIG.common;

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>
          <div
            className={`
              relative flex flex-col items-center justify-center p-3 rounded-lg border-2 transition-all
              ${isUnlocked
                ? `${rarityConfig.borderColor} ${rarityConfig.bgColor} ${rarityConfig.glowColor} shadow-md`
                : 'border-gray-200 bg-gray-50 opacity-60'
              }
              ${isUnlocked ? 'hover:scale-105' : ''}
              cursor-pointer min-w-[80px]
            `}
            aria-label={isUnlocked ? `${achievement.name} achievement unlocked` : `${achievement.name} achievement locked`}
          >
            {!isUnlocked && (
              <div className="absolute top-1 right-1" aria-hidden="true">
                <Lock className="h-3 w-3 text-gray-400" />
              </div>
            )}
            <div
              className={`
                p-2 rounded-full mb-1
                ${isUnlocked ? rarityConfig.bgColor : 'bg-gray-100'}
              `}
            >
              <Icon
                className={`h-5 w-5 ${isUnlocked ? rarityConfig.textColor : 'text-gray-400'}`}
              />
            </div>
            <span
              className={`
                text-xs font-medium text-center leading-tight
                ${isUnlocked ? 'text-gray-900' : 'text-gray-400'}
              `}
            >
              {achievement.name}
            </span>
            <Badge
              variant="outline"
              className={`
                mt-1 text-[10px] px-1.5 py-0
                ${isUnlocked ? rarityConfig.textColor : 'text-gray-400'}
              `}
            >
              {rarityConfig.label}
            </Badge>
          </div>
        </TooltipTrigger>
        <TooltipContent side="top" className="max-w-[200px]">
          <div className="space-y-1">
            <p className="font-semibold">{achievement.name}</p>
            <p className="text-xs text-muted-foreground">{achievement.description}</p>
            {isUnlocked && unlockedAt && (
              <p className="text-xs text-green-600">
                Earned {new Date(unlockedAt).toLocaleDateString()}
              </p>
            )}
          </div>
        </TooltipContent>
      </Tooltip>
    </TooltipProvider>
  );
}

/**
 * Loading skeleton for achievements
 */
function AchievementsSkeleton() {
  return (
    <Card>
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-lg">
          <Trophy className="h-5 w-5 text-yellow-500" />
          <span>Loading achievements...</span>
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-3">
          {[...Array(6)].map((_, i) => (
            <Skeleton key={i} className="h-24 w-full rounded-lg" />
          ))}
        </div>
      </CardContent>
    </Card>
  );
}

/**
 * Main AchievementsCard component
 */
export function AchievementsCard({ userId, organizationId, compact = false }: AchievementsCardProps) {
  const [showFullView, setShowFullView] = useState(false);

  // Fetch data
  const {
    data: userAchievements,
    isLoading: achievementsLoading,
    error: achievementsError,
  } = useAchievements(userId, organizationId);

  const {
    data: definitions,
    isLoading: definitionsLoading,
    error: definitionsError,
  } = useAchievementDefinitions();

  // Category order for display
  const categoryOrder = ['performance', 'consistency', 'improvement', 'goal'];

  // Process achievements by category
  const { byCategory, unlockedCount, totalCount } = useMemo(() => {
    if (!definitions) {
      return { byCategory: {}, unlockedCount: 0, totalCount: 0 };
    }

    const unlockedCodes = new Set(
      (userAchievements ?? []).map((ua) => ua.achievement.code)
    );
    const unlockedMap = new Map(
      (userAchievements ?? []).map((ua) => [ua.achievement.code, ua])
    );

    const grouped: Record<
      string,
      { unlocked: UserAchievement[]; locked: AchievementDefinition[] }
    > = {};

    for (const def of definitions) {
      if (!grouped[def.category]) {
        grouped[def.category] = { unlocked: [], locked: [] };
      }

      if (unlockedCodes.has(def.code)) {
        const ua = unlockedMap.get(def.code);
        if (ua) grouped[def.category].unlocked.push(ua);
      } else {
        grouped[def.category].locked.push(def);
      }
    }

    return {
      byCategory: grouped,
      unlockedCount: unlockedCodes.size,
      totalCount: definitions.length,
    };
  }, [definitions, userAchievements]);

  // In compact mode: flatten and limit badges (must be called before early returns)
  const compactBadges = useMemo(() => {
    if (!compact) return null;

    const allUnlocked: UserAchievement[] = [];
    const allLocked: AchievementDefinition[] = [];

    for (const category of categoryOrder) {
      const data = byCategory[category];
      if (data) {
        allUnlocked.push(...data.unlocked);
        allLocked.push(...data.locked);
      }
    }

    // In compact: show up to 6 unlocked, then fill to 8 with locked
    const displayUnlocked = allUnlocked.slice(0, 6);
    const remainingSlots = Math.max(0, 8 - displayUnlocked.length);
    const displayLocked = allLocked.slice(0, remainingSlots);

    return { unlocked: displayUnlocked, locked: displayLocked };
  }, [compact, byCategory]);

  // Loading state
  if (achievementsLoading || definitionsLoading) {
    return <AchievementsSkeleton />;
  }

  // Error state
  if (achievementsError || definitionsError) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg text-red-600">
            <Trophy className="h-5 w-5" />
            <span>Failed to load achievements</span>
          </CardTitle>
        </CardHeader>
      </Card>
    );
  }

  // Empty state
  if (totalCount === 0) {
    return (
      <Card>
        <CardHeader className="pb-3">
          <CardTitle className="flex items-center gap-2 text-lg">
            <Trophy className="h-5 w-5 text-yellow-500" />
            <span>Achievements</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground text-center py-4">
            No achievements available yet.
          </p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className={compact ? 'pb-2' : 'pb-3'}>
        <div className="flex items-center justify-between">
          <CardTitle className={`flex items-center gap-2 ${compact ? 'text-base' : 'text-lg'}`}>
            <Trophy className={`${compact ? 'h-4 w-4' : 'h-5 w-5'} text-yellow-500`} />
            <span>Achievements ({unlockedCount}/{totalCount})</span>
          </CardTitle>
          {unlockedCount > 0 && !compact && (
            <Badge variant="secondary" className="text-xs">
              {Math.round((unlockedCount / totalCount) * 100)}% complete
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent className={compact ? 'pt-0' : 'space-y-4'}>
        {unlockedCount === 0 && (
          <p className="text-muted-foreground text-sm text-center pb-2">
            Start training to unlock achievements!
          </p>
        )}

        {compact ? (
          /* Compact mode: flat grid without category headers */
          <>
            <div className="grid grid-cols-4 gap-2">
              {compactBadges?.unlocked.map((ua) => (
                <AchievementBadgeDisplay
                  key={ua.id}
                  achievement={ua.achievement}
                  isUnlocked={true}
                  unlockedAt={ua.unlockedAt}
                />
              ))}
              {compactBadges?.locked.map((def) => (
                <AchievementBadgeDisplay
                  key={def.id}
                  achievement={def}
                  isUnlocked={false}
                />
              ))}
            </div>
            {totalCount > 8 && (
              <div className="text-center pt-2 border-t border-gray-100 mt-2">
                <button
                  onClick={() => setShowFullView(true)}
                  className="text-xs text-blue-600 cursor-pointer hover:underline"
                >
                  View all {totalCount} achievements
                </button>
              </div>
            )}
          </>
        ) : (
          /* Full mode: grouped by category */
          <>
            {categoryOrder.map((category) => {
              const categoryData = byCategory[category];
              if (!categoryData) return null;

              const { unlocked, locked } = categoryData;
              if (unlocked.length === 0 && locked.length === 0) return null;

              const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
              const CategoryIcon = getIconComponent(config?.icon ?? null);

              return (
                <div key={category}>
                  <h3 className={`text-sm font-medium mb-2 flex items-center gap-1.5 ${config?.color ?? 'text-gray-600'}`}>
                    <CategoryIcon className="h-4 w-4" />
                    {config?.label ?? category}
                  </h3>
                  <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                    {/* Unlocked first */}
                    {unlocked.map((ua) => (
                      <AchievementBadgeDisplay
                        key={ua.id}
                        achievement={ua.achievement}
                        isUnlocked={true}
                        unlockedAt={ua.unlockedAt}
                      />
                    ))}
                    {/* Then locked */}
                    {locked.map((def) => (
                      <AchievementBadgeDisplay
                        key={def.id}
                        achievement={def}
                        isUnlocked={false}
                      />
                    ))}
                  </div>
                </div>
              );
            })}

            {totalCount - unlockedCount > 0 && (
              <p className="text-xs text-muted-foreground text-center pt-2">
                {totalCount - unlockedCount} more to unlock
              </p>
            )}
          </>
        )}
      </CardContent>

      {/* Full view dialog for compact mode */}
      {compact && (
        <Dialog open={showFullView} onOpenChange={setShowFullView}>
          <DialogContent className="max-w-3xl max-h-[80vh] overflow-y-auto">
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <Trophy className="h-5 w-5 text-yellow-500" />
                All Achievements ({unlockedCount}/{totalCount})
              </DialogTitle>
            </DialogHeader>
            <div className="space-y-4 mt-4">
              {categoryOrder.map((category) => {
                const categoryData = byCategory[category];
                if (!categoryData) return null;

                const { unlocked, locked } = categoryData;
                if (unlocked.length === 0 && locked.length === 0) return null;

                const config = CATEGORY_CONFIG[category as keyof typeof CATEGORY_CONFIG];
                const CategoryIcon = getIconComponent(config?.icon ?? null);

                return (
                  <div key={category}>
                    <h3 className={`text-sm font-medium mb-2 flex items-center gap-1.5 ${config?.color ?? 'text-gray-600'}`}>
                      <CategoryIcon className="h-4 w-4" />
                      {config?.label ?? category}
                    </h3>
                    <div className="grid grid-cols-4 sm:grid-cols-5 md:grid-cols-6 gap-2">
                      {unlocked.map((ua) => (
                        <AchievementBadgeDisplay
                          key={ua.id}
                          achievement={ua.achievement}
                          isUnlocked={true}
                          unlockedAt={ua.unlockedAt}
                        />
                      ))}
                      {locked.map((def) => (
                        <AchievementBadgeDisplay
                          key={def.id}
                          achievement={def}
                          isUnlocked={false}
                        />
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </DialogContent>
        </Dialog>
      )}
    </Card>
  );
}
