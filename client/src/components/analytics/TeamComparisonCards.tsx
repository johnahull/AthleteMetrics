/**
 * Team Comparison Summary Cards
 * Displays team-by-team comparison statistics and insights
 */

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import {
  Trophy,
  TrendingUp,
  TrendingDown,
  Users,
  Target,
  Award,
  ChevronRight
} from 'lucide-react';
import type { GroupingResult } from '@/hooks/useDataGrouping';
import { METRIC_CONFIG } from '@shared/analytics-types';

interface TeamComparisonCardsProps {
  groupingResult: GroupingResult;
  primaryMetric: string;
  onTeamClick?: (teamId: string) => void;
  className?: string;
}

export function TeamComparisonCards({
  groupingResult,
  primaryMetric,
  onTeamClick,
  className
}: TeamComparisonCardsProps) {
  if (!groupingResult.isGrouped || groupingResult.groupedData.length === 0) {
    return null;
  }

  const { groupedData, groupingSummary } = groupingResult;
  const metricConfig = METRIC_CONFIG[primaryMetric as keyof typeof METRIC_CONFIG];
  const isLowerBetter = metricConfig?.lowerIsBetter || false;

  // Find the best and worst performing teams
  const bestTeam = groupedData[0]; // Already sorted by performance
  const worstTeam = groupedData[groupedData.length - 1];

  // Calculate improvement potential for each team
  const globalBest = isLowerBetter ? bestTeam.statistics.mean : bestTeam.statistics.mean;

  return (
    <div className={`space-y-4 ${className}`}>
      {/* Summary Header */}
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Trophy className="h-5 w-5 text-yellow-500" />
            Team Comparison Summary
            <Badge variant="secondary">{groupingSummary.totalGroups} teams</Badge>
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-sm">
            <div className="text-center">
              <div className="font-medium text-green-600">Best Performing</div>
              <div className="text-lg font-bold">{bestTeam.groupLabel}</div>
              <div className="text-muted-foreground">
                {bestTeam.statistics.mean.toFixed(2)} {metricConfig?.unit}
              </div>
            </div>
            <div className="text-center">
              <div className="font-medium">Total Athletes</div>
              <div className="text-lg font-bold">{groupingSummary.totalAthletes}</div>
              <div className="text-muted-foreground">
                Across {groupingSummary.totalGroups} teams
              </div>
            </div>
            <div className="text-center">
              <div className="font-medium">Performance Gap</div>
              <div className="text-lg font-bold">
                {Math.abs(bestTeam.statistics.mean - worstTeam.statistics.mean).toFixed(2)} {metricConfig?.unit}
              </div>
              <div className="text-muted-foreground">
                Between best and worst
              </div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* Individual Team Cards */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {groupedData.map((team, index) => {
          const isTopPerformer = index === 0;
          const isBottomPerformer = index === groupedData.length - 1;
          const improvementPotential = isLowerBetter
            ? ((team.statistics.mean - globalBest) / globalBest) * 100
            : ((globalBest - team.statistics.mean) / globalBest) * 100;

          return (
            <Card
              key={team.groupKey}
              className={`transition-all hover:shadow-lg ${isTopPerformer ? 'ring-2 ring-green-200' : ''}`}
            >
              <CardHeader className="pb-3">
                <div className="flex items-center justify-between">
                  <CardTitle className="text-lg flex items-center gap-2">
                    {isTopPerformer && <Trophy className="h-4 w-4 text-yellow-500" />}
                    {team.groupLabel}
                  </CardTitle>
                  <div className="flex items-center gap-1">
                    <Badge
                      variant={isTopPerformer ? "default" : isBottomPerformer ? "destructive" : "secondary"}
                      className="text-xs"
                    >
                      #{index + 1}
                    </Badge>
                    {onTeamClick && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => onTeamClick(team.groupKey)}
                        className="p-1 h-6 w-6"
                      >
                        <ChevronRight className="h-3 w-3" />
                      </Button>
                    )}
                  </div>
                </div>
              </CardHeader>
              <CardContent className="space-y-3">
                {/* Key Statistics */}
                <div className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <div className="text-muted-foreground">Average</div>
                    <div className="font-bold text-lg">
                      {team.statistics.mean.toFixed(2)} {metricConfig?.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Athletes</div>
                    <div className="font-bold text-lg flex items-center gap-1">
                      <Users className="h-4 w-4" />
                      {team.athleteCount}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Best</div>
                    <div className="font-medium">
                      {isLowerBetter ? team.statistics.min.toFixed(2) : team.statistics.max.toFixed(2)} {metricConfig?.unit}
                    </div>
                  </div>
                  <div>
                    <div className="text-muted-foreground">Consistency</div>
                    <div className="font-medium">
                      ±{team.statistics.std.toFixed(2)} {metricConfig?.unit}
                    </div>
                  </div>
                </div>

                {/* Performance Indicator */}
                <div className="space-y-1">
                  <div className="flex justify-between text-xs">
                    <span>Performance vs Leader</span>
                    <span className={improvementPotential > 0 ? "text-red-600" : "text-green-600"}>
                      {improvementPotential > 0 ? '+' : ''}{improvementPotential.toFixed(1)}%
                    </span>
                  </div>
                  <Progress
                    value={Math.max(0, 100 - Math.abs(improvementPotential))}
                    className="h-2"
                  />
                </div>

                {/* Best Athlete */}
                {team.bestAthlete && (
                  <div className="pt-2 border-t text-xs">
                    <div className="flex items-center gap-1 text-muted-foreground mb-1">
                      <Award className="h-3 w-3" />
                      Top Performer
                    </div>
                    <div className="font-medium">{team.bestAthlete.name}</div>
                    <div className="text-muted-foreground">
                      {team.bestAthlete.value.toFixed(2)} {metricConfig?.unit}
                    </div>
                  </div>
                )}

                {/* Performance Trend Indicator */}
                <div className="flex items-center gap-2 text-xs">
                  {improvementPotential > 10 ? (
                    <>
                      <TrendingDown className="h-3 w-3 text-red-500" />
                      <span className="text-red-600">Improvement needed</span>
                    </>
                  ) : improvementPotential > 0 ? (
                    <>
                      <Target className="h-3 w-3 text-orange-500" />
                      <span className="text-orange-600">Room for improvement</span>
                    </>
                  ) : (
                    <>
                      <TrendingUp className="h-3 w-3 text-green-500" />
                      <span className="text-green-600">Strong performance</span>
                    </>
                  )}
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>
    </div>
  );
}