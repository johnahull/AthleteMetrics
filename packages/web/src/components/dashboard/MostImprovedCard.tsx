/**
 * MostImprovedCard - Display athletes with highest improvement percentages
 *
 * Features:
 * - Metric selector dropdown
 * - Display top 3-5 most improved athletes
 * - Improvement percentage with trend arrow (↑)
 * - Previous → Current value display
 * - Personal best indicator
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
import { TrendingUp, AlertCircle, RefreshCw, Award, ArrowUp } from "lucide-react";
import { useMostImproved } from "@/hooks/useMostImproved";
import { useAvailableMetrics } from "@/hooks/use-available-metrics";
import { formatMetricValue } from "@/lib/metrics";
import type { TimeframePreset } from "@shared/dashboard-timeframe";

interface MostImprovedCardProps {
  organizationId: string;
  teamId?: string;
  timeframe?: TimeframePreset | 'custom' | 'all';
  dateFrom?: string;
  dateTo?: string;
}

export function MostImprovedCard({
  organizationId,
  teamId,
  timeframe = "30d",
  dateFrom,
  dateTo,
}: MostImprovedCardProps) {
  const [, setLocation] = useLocation();

  // Get available metrics
  const { metrics, isLoading: metricsLoading } = useAvailableMetrics();

  // State for selected metric
  const [selectedMetric, setSelectedMetric] = useState<string>("");

  // Set default metric when metrics load
  const effectiveMetric = selectedMetric || metrics[0]?.code || "";

  // Fetch most improved data
  const {
    data: mostImprovedData,
    isLoading: mostImprovedLoading,
    error,
    refetch,
  } = useMostImproved({
    organizationId,
    metric: effectiveMetric,
    teamId,
    timeframe,
    dateFrom,
    dateTo,
    limit: 5,
  });

  const isLoading = metricsLoading || mostImprovedLoading;
  const improvements = mostImprovedData?.improvements || [];

  // Handle athlete click
  const handleAthleteClick = (athleteId: string) => {
    setLocation(`/users/${athleteId}`);
  };

  // Loading state
  if (isLoading) {
    return (
      <Card data-testid="most-improved-loading">
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">Most Improved</h3>
        </CardHeader>
        <CardContent>
          <div className="space-y-3">
            {/* Metric selector skeleton */}
            <div className="h-10 bg-gray-200 rounded w-48 animate-pulse mb-4"></div>

            {/* Improvements skeleton */}
            {[...Array(5)].map((_, i) => (
              <div key={i} className="flex items-center space-x-3 animate-pulse">
                <div className="w-10 h-10 bg-gray-200 rounded"></div>
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
      <Card data-testid="most-improved-error">
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">Most Improved</h3>
        </CardHeader>
        <CardContent>
          <div className="flex items-center justify-center flex-col py-8 text-center">
            <AlertCircle className="h-12 w-12 text-red-500 mb-3" />
            <p className="text-sm text-gray-600 mb-4">
              Failed to load improvements
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
  if (improvements.length === 0) {
    return (
      <Card data-testid="most-improved-empty">
        <CardHeader className="pb-3">
          <h3 className="text-lg font-semibold text-gray-900">Most Improved</h3>
        </CardHeader>
        <CardContent>
          {/* Metric selector */}
          <div className="mb-4">
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
          </div>

          <div className="flex items-center justify-center flex-col py-8 text-center">
            <TrendingUp className="h-12 w-12 text-gray-400 mb-3" />
            <p className="text-sm font-medium text-gray-900 mb-1">
              No improvements found
            </p>
            <p className="text-xs text-gray-500">
              Athletes need at least 2 measurements to track improvement
            </p>
          </div>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader className="pb-3">
        <h3 className="text-lg font-semibold text-gray-900">Most Improved</h3>
      </CardHeader>
      <CardContent>
        {/* Metric selector */}
        <div className="mb-4">
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
        </div>

        {/* Improvements list */}
        <div className="space-y-2">
          {improvements.map((entry) => (
            <div
              key={entry.athleteId}
              className="flex items-center space-x-3 p-3 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
              onClick={() => handleAthleteClick(entry.athleteId)}
            >
              {/* Improvement indicator */}
              <div className="w-10 h-10 rounded-full flex items-center justify-center bg-green-100">
                <ArrowUp className="h-5 w-5 text-green-700" />
              </div>

              {/* Athlete info */}
              <div className="flex-1 min-w-0">
                <div className="flex items-center gap-2">
                  <p className="text-sm font-medium text-gray-900 truncate">
                    {entry.athleteName}
                  </p>
                  {entry.hasPersonalBest && (
                    <span className="inline-flex items-center px-2 py-0.5 rounded text-xs font-medium bg-green-100 text-green-800">
                      <Award className="h-3 w-3 mr-1" />
                      PB
                    </span>
                  )}
                </div>

                <div className="flex items-center gap-2 text-xs text-gray-500">
                  {entry.teamName && <span>{entry.teamName}</span>}
                  {entry.teamName && <span>•</span>}
                  <span>
                    {formatMetricValue(mostImprovedData?.metric || "", entry.previousValue)} → {formatMetricValue(mostImprovedData?.metric || "", entry.currentValue)}
                  </span>
                </div>
              </div>

              {/* Improvement percentage */}
              <div className="flex items-center gap-1">
                <span className="text-sm font-semibold text-green-700">
                  {entry.improvementPercent.toFixed(2)}%
                </span>
              </div>
            </div>
          ))}
        </div>

        {/* Footer with total athletes */}
        {mostImprovedData && mostImprovedData.totalAthletes > 0 && (
          <div className="mt-4 pt-4 border-t border-gray-200">
            <div className="flex items-center justify-center text-sm text-gray-500">
              <TrendingUp className="h-4 w-4 mr-2" />
              <span>
                {mostImprovedData.totalAthletes} athletes with improvement tracked
              </span>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}
