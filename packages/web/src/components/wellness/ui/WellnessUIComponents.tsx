import { TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { STATUS_COLORS } from '@shared/wellness-constants';

/**
 * Reusable UI components for wellness analytics
 */

// ============================================================================
// TrendIndicator Component
// ============================================================================

interface TrendIndicatorProps {
  trend: 'up' | 'down' | 'stable';
}

/**
 * Displays a trend indicator with icon and text
 * - 'up': Green with TrendingUp icon, "Improving"
 * - 'down': Red with TrendingDown icon, "Declining"
 * - 'stable': Gray with Minus icon, "Stable"
 */
export function TrendIndicator({ trend }: TrendIndicatorProps) {
  const config = {
    up: {
      Icon: TrendingUp,
      text: 'Improving',
      color: STATUS_COLORS.green.text,
    },
    down: {
      Icon: TrendingDown,
      text: 'Declining',
      color: STATUS_COLORS.red.text,
    },
    stable: {
      Icon: Minus,
      text: 'Stable',
      color: 'text-gray-600',
    },
  };

  const { Icon, text, color } = config[trend];

  return (
    <div className="flex items-center space-x-1">
      <Icon className={`h-4 w-4 ${color}`} />
      <span className={`text-sm font-medium ${color}`}>{text}</span>
    </div>
  );
}

// ============================================================================
// StatusBreakdownBadges Component
// ============================================================================

interface StatusBreakdownBadgesProps {
  red?: number;
  yellow?: number;
  green?: number;
}

/**
 * Displays status breakdown as colored badges
 * Only shows badges for non-zero counts
 * - Red: destructive variant
 * - Yellow: outline variant with yellow styling
 * - Green: outline variant with green styling
 */
export function StatusBreakdownBadges({ red, yellow, green }: StatusBreakdownBadgesProps) {
  const hasAnyStatus = (red && red > 0) || (yellow && yellow > 0) || (green && green > 0);

  if (!hasAnyStatus) {
    return <div />;
  }

  return (
    <div className="flex gap-2">
      {red && red > 0 && (
        <Badge variant="destructive" className="text-xs">
          {red} Red
        </Badge>
      )}
      {yellow && yellow > 0 && (
        <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
          {yellow} Yellow
        </Badge>
      )}
      {green && green > 0 && (
        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
          {green} Green
        </Badge>
      )}
    </div>
  );
}

// ============================================================================
// StatusDot Component
// ============================================================================

interface StatusDotProps {
  status: 'red' | 'yellow' | 'green';
}

/**
 * Displays a colored status dot
 * - 12px circular dot with appropriate background color
 * - Includes aria-label for accessibility
 */
export function StatusDot({ status }: StatusDotProps) {
  const colorClass = {
    red: STATUS_COLORS.red.bg,
    yellow: STATUS_COLORS.yellow.bg,
    green: STATUS_COLORS.green.bg,
  };

  return (
    <div
      className={`w-3 h-3 rounded-full ${colorClass[status]}`}
      aria-label={`Status: ${status}`}
      role="img"
    />
  );
}

// ============================================================================
// ScoreDisplay Component
// ============================================================================

interface ScoreDisplayProps {
  score: number | null;
  max: number;
  className?: string;
}

/**
 * Displays a wellness score in "X.X / Max" format
 * - Shows score in bold with 1 decimal place
 * - Shows "N/A" for null scores
 * - Supports optional className for custom styling
 */
export function ScoreDisplay({ score, max, className = '' }: ScoreDisplayProps) {
  if (score === null) {
    return <span className={className}>N/A</span>;
  }

  return (
    <span className={className}>
      <span className="font-bold">{score.toFixed(1)}</span>
      <span className="text-sm font-normal text-gray-500 ml-1">/ {max}</span>
    </span>
  );
}
