/**
 * KPI Card with Trend Indicator
 * Displays a key performance indicator with trend data (change from previous period)
 */

import React from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { ArrowUp, ArrowDown, Minus } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';

export interface TrendData {
  value: number;
  percent: number;
  direction: 'up' | 'down' | 'flat';
}

export interface KPICardWithTrendProps {
  title: string;
  value: number | string;
  icon: LucideIcon;
  trend?: TrendData;
  inverted?: boolean; // For metrics where lower is better (e.g., time)
  format?: 'number' | 'time' | 'percentage';
}

/**
 * Get color class based on trend direction and inverted flag
 */
function getTrendColor(direction: 'up' | 'down' | 'flat', inverted: boolean = false): string {
  if (direction === 'flat') return 'text-gray-600';

  if (inverted) {
    // For inverted metrics (time), down is good (green), up is bad (red)
    return direction === 'down' ? 'text-green-600' : 'text-red-600';
  } else {
    // For normal metrics, up is good (green), down is bad (red)
    return direction === 'up' ? 'text-green-600' : 'text-red-600';
  }
}

/**
 * Get background color for icon based on trend
 */
function getIconBgColor(direction: 'up' | 'down' | 'flat', inverted: boolean = false): string {
  if (direction === 'flat') return 'bg-gray-100';

  if (inverted) {
    return direction === 'down' ? 'bg-green-100' : 'bg-red-100';
  } else {
    return direction === 'up' ? 'bg-blue-100' : 'bg-gray-100';
  }
}

/**
 * Get icon color based on trend
 */
function getIconColor(direction: 'up' | 'down' | 'flat', inverted: boolean = false): string {
  if (direction === 'flat') return 'text-gray-600';

  if (inverted) {
    return direction === 'down' ? 'text-green-600' : 'text-red-600';
  } else {
    return direction === 'up' ? 'text-primary' : 'text-gray-600';
  }
}

/**
 * Get trend arrow icon
 */
function getTrendIcon(direction: 'up' | 'down' | 'flat'): LucideIcon {
  switch (direction) {
    case 'up':
      return ArrowUp;
    case 'down':
      return ArrowDown;
    case 'flat':
      return Minus;
  }
}

/**
 * Format trend value with sign
 */
function formatTrendValue(value: number): string {
  if (value === 0) return '0';
  return value > 0 ? `+${value}` : `${value}`;
}

/**
 * Get accessible label for trend
 */
function getTrendLabel(trend: TrendData): string {
  const { value, percent, direction } = trend;

  if (direction === 'flat' || (value === 0 && percent === 0)) {
    return 'No change from last month';
  }

  const directionText = direction === 'up' ? 'Up' : 'Down';
  const absValue = Math.abs(value);
  const absPercent = Math.abs(percent);

  return `${directionText} ${absValue}, ${absPercent}% from last month`;
}

export function KPICardWithTrend({
  title,
  value,
  icon: Icon,
  trend,
  inverted = false,
  format = 'number'
}: KPICardWithTrendProps) {
  const trendColor = trend ? getTrendColor(trend.direction, inverted) : undefined;
  const iconBgColor = trend ? getIconBgColor(trend.direction, inverted) : 'bg-blue-100';
  const iconColor = trend ? getIconColor(trend.direction, inverted) : 'text-primary';
  const TrendIcon = trend ? getTrendIcon(trend.direction) : null;

  return (
    <Card className="bg-white">
      <CardContent className="p-6">
        <div className="flex items-center justify-between">
          <div className="flex-1">
            <p className="text-sm font-medium text-gray-600">{title}</p>
            <p className="text-3xl font-bold text-gray-900">{value}</p>

            {trend && (
              <div
                className={`flex items-center space-x-1 mt-1 text-sm font-medium ${trendColor}`}
                aria-label={getTrendLabel(trend)}
              >
                {TrendIcon && <TrendIcon className="h-4 w-4" />}
                <span>
                  {formatTrendValue(trend.value)}
                </span>
                <span className="text-gray-500">•</span>
                <span>
                  {Math.abs(trend.percent).toFixed(1)}%
                </span>
              </div>
            )}
          </div>
          <div className={`w-12 h-12 ${iconBgColor} rounded-lg flex items-center justify-center`}>
            <Icon className={`h-6 w-6 ${iconColor}`} />
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
