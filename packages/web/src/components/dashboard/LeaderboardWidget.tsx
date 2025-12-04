/**
 * LeaderboardWidget - Display top performers with percentile rankings
 *
 * Features:
 * - Metric selector dropdown
 * - Display limit toggle (Top 5 / Top 10 / All)
 * - Rankings with gold/silver/bronze badges for top 3
 * - Personal best indicator
 * - Percentile bar visualization
 * - Click to navigate to athlete profile
 */

import { useState } from "react";
import { useLocation } from "wouter";
import { Card, CardContent, CardHeader } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Trophy, AlertCircle, RefreshCw, Award, TrendingUp } from "lucide-react";
import { useLeaderboard } from "@/hooks/useLeaderboard";
import { useAvailableMetrics } from "@/hooks/use-available-metrics";
import { formatMetricValue } from "@/lib/metrics";
import type { TimeframePreset } from "@shared/dashboard-timeframe";

interface LeaderboardWidgetProps {
  organizationId: string;
  teamId?: string;
  timeframe?: TimeframePreset | 'custom' | 'all';
  dateFrom?: string;
  dateTo?: string;
  scopeLabel?: string;
}

export function LeaderboardWidget({
  organizationId,
  teamId,
  timeframe = "30d",
  dateFrom,
  dateTo,
  scopeLabel,
}: LeaderboardWidgetProps) {
  const [, setLocation] = useLocation();

  // Get available metrics
  const { metrics, isLoading: metricsLoading } = useAvailableMetrics();

  // State for selected metric and limit
  const [selectedMetric, setSelectedMetric] = useState<string>("");
  const [limit, setLimit] = useState<5 | 10 | 100>(5);

  // Set default metric when metrics load
  const effectiveMetric = selectedMetric || metrics[0]?.code || "";

  // Fetch leaderboard data
  const {
    data: leaderboardData,
    isLoading: leaderboardLoading,
    error,
    refetch,
  } = useLeaderboard({
    organizationId,
    metric: effectiveMetric,
    teamId,
    timeframe,
    dateFrom,
    dateTo,
    limit,
  });

  const isLoading = metricsLoading || leaderboardLoading;
  const rankings = leaderboardData?.rankings || [];

  // Get rank badge styling
  const getRankBadgeClass = (rank: number): string => {
    switch (rank) {
      case 1:
        return "bg-yellow-100 text-yellow-700"; // Gold
      case 2:
        return "bg-gray-100 text-gray-700"; // Silver
      case 3:
        return "bg-orange-100 text-orange-700"; // Bronze
      default:
        return "bg-blue-100 text-blue-700"; // Default
    }
  };

  // Handle athlete click
  const handleAthleteClick = (athleteId: string) => {
    setLocation(`/users/${athleteId}`);
  };

  // Loading state
  if (isLoading) {
    return (
      <Card data-testid="leaderboard-loading">
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">Leaderboard</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Metric selector skeleton */}
            <div className="flex items-center justify-between mb-4">
              <div className="h-10 bg-gray-200 rounded w-48 animate-pulse"></div>
              <div className="h-8 bg-gray-200 rounded w-32 animate-pulse"></div>
            </div>

            {/* Rankings skeleton */}
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-3 animate-pulse">
                <div className="w-8 h-8 bg-gray-200 rounded-full"></div>
                <div className="flex-1">
                  <div className="h-4 bg-gray-200 rounded w-32 mb-2"></div>
                  <div className="h-3 bg-gray-200 rounded w-24"></div>
                </div>
                <div className="h-4 bg-gray-200 rounded w-16"></div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    );
  }

  // Error state
  if (error) {
    return (
      <Card data-testid="leaderboard-error">
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">Leaderboard</h3>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center flex-col py-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mb-3" />
            <p className="text-sm text-gray-600 mb-4">
              Failed to load leaderboard
            </p>
            <Button variant="outline" size="sm" onClick={() => refetch()}>
              <RefreshCw className="h-4 w-4 mr-2" />
              Retry
            </Button>
          </div>
        </CardContent>
      </Card>
    );
  }

  // Empty state
  if (rankings.length === 0) {
    return (
      <Card data-testid="leaderboard-empty">
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">Leaderboard</h3>
          {scopeLabel && (
            <p className="text-sm text-gray-500">{scopeLabel}</p>
          )}
        </CardHeader>
        <CardContent>
          {/* Metric selector and limit toggle */}
          <div className="flex items-center justify-between mb-4">
            <Select value={effectiveMetric} onValueChange={setSelectedMetric}>
              <SelectTrigger className="w-48">
                <SelectValue placeholder="Select metric" />
              </SelectTrigger>
              <SelectContent>
                {metrics.map((metric) => (
                  <SelectItem key={metric.code} value={metric.code}>
                    {metric.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>

            <div className="flex gap-1">
              <Button
                variant={limit === 5 ? "default" : "outline"}
                size="sm"
                className={limit === 5 ? "bg-blue-600" : ""}
                onClick={() => setLimit(5)}
              >
                Top 5
              </Button>
              <Button
                variant={limit === 10 ? "default" : "outline"}
                size="sm"
                className={limit === 10 ? "bg-blue-600" : ""}
                onClick={() => setLimit(10)}
              >
                Top 10
              </Button>
              <Button
                variant={limit === 100 ? "default" : "outline"}
                size="sm"
                className={limit === 100 ? "bg-blue-600" : ""}
                onClick={() => setLimit(100)}
              >
                All
              </Button>
            </div>
          </div>

          <div className="flex items-center justify-center flex-col py-8 text-center">
            <Trophy className="h-12 w-12 text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-900 mb-1">
              No rankings available
            </p>
            <p className="text-xs text-gray-500">
              Record measurements to see rankings
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <h3 className="text-lg font-semibold text-gray-900">Leaderboard</h3>
        {scopeLabel && (
          <p className="text-sm text-gray-500">{scopeLabel}</p>
        )}
      </CardHeader>
      <CardContent>
        {/* Metric selector and limit toggle */}
        <div className="flex items-center justify-between mb-4">
          <Select value={effectiveMetric} onValueChange={setSelectedMetric}>
            <SelectTrigger className="w-48">
              <SelectValue placeholder="Select metric" />
            </SelectTrigger>
            <SelectContent>
              {metrics.map((metric) => (
                <SelectItem key={metric.code} value={metric.code}>
                  {metric.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>

          <div className="flex gap-1">
            <Button
              variant={limit === 5 ? "default" : "outline"}
              size="sm"
              className={limit === 5 ? "bg-blue-600" : ""}
              onClick={() => setLimit(5)}
            >
              Top 5
            </Button>
            <Button
              variant={limit === 10 ? "default" : "outline"}
              size="sm"
              className={limit === 10 ? "bg-blue-600" : ""}
              onClick={() => setLimit(10)}
            >
              Top 10
            </Button>
            <Button
              variant={limit === 100 ? "default" : "outline"}
              size="sm"
              className={limit === 100 ? "bg-blue-600" : ""}
              onClick={() => setLimit(100)}
            >
              All
            </Button>
          </div>
        </div>

        {/* Rankings list */}
        <div className="space-y-2">
          {rankings.map((entry) => (
            <button
              key={entry.athleteId}
              type="button"
              className="w-full flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer text-left"
              onClick={() => handleAthleteClick(entry.athleteId)}
              aria-label={`View profile for ${entry.athleteName}, ranked ${entry.rank}${entry.isPersonalBest ? ', personal best' : ''}`}
            >
              {/* Rank badge */}
              <div
                className={`w-8 h-8 rounded-full flex items-center justify-center font-semibold text-sm ${getRankBadgeClass(
                  entry.rank
                )}`}
              >
                {entry.rank}
              </div>

              {/* Athlete info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {entry.athleteName}
                  </p>
                  {entry.isPersonalBest && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      <Award className="h-3 w-3 mr-1" />
                      PB
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {entry.teamName && <span>{entry.teamName}</span>}
                  <span>•</span>
                  <span className="font-medium">
                    {formatMetricValue(leaderboardData?.metric || effectiveMetric, entry.value)}
                  </span>
                </div>

                {/* Percentile bar */}
                <div className="mt-1 flex items-center gap-2">
                  <div className="flex-1 bg-gray-200 rounded-full h-1.5">
                    <div
                      className="bg-blue-600 h-1.5 rounded-full transition-all"
                      style={{ width: `${entry.percentile}%` }}
                    />
                  </div>
                  <span className="text-xs text-gray-500 w-12 text-right">
                    {entry.percentile.toFixed(1)}%
                  </span>
                </div>
              </div>
            </button>
          ))}
        </div>

        {/* Footer with total athletes */}
        {leaderboardData && leaderboardData.totalAthletes > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-center text-sm text-gray-500">
              <TrendingUp className="h-4 w-4 mr-2" />
              <span>
                {leaderboardData.totalAthletes} total athletes tracked
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
