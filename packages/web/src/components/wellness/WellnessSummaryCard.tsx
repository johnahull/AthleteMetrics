import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendingUp, TrendingDown, Minus } from 'lucide-react';

interface WellnessSummaryCardProps {
  summary: {
    averageWellness: number;
    trend: 'up' | 'down' | 'stable';
    totalResponses: number;
  } | null;
  'data-testid'?: string;
}

/**
 * Summary card displaying average wellness score and trend indicator
 */
export function WellnessSummaryCard({ summary, 'data-testid': testId }: WellnessSummaryCardProps) {
  const trend = summary?.trend || 'stable';
  const score = summary?.averageWellness || 0;

  const trendIcons = {
    up: <TrendingUp className="h-4 w-4 text-green-600" />,
    down: <TrendingDown className="h-4 w-4 text-red-600" />,
    stable: <Minus className="h-4 w-4 text-gray-600" />,
  };

  const trendColors = {
    up: 'text-green-600',
    down: 'text-red-600',
    stable: 'text-gray-600',
  };

  const trendText = {
    up: 'Improving',
    down: 'Declining',
    stable: 'Stable',
  };

  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600" data-testid="card-title">
          Average Wellness
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div data-testid="wellness-score" className="text-3xl font-bold text-gray-900">
            {score.toFixed(1)}
            <span className="text-sm font-normal text-gray-500 ml-1">/ 10</span>
          </div>
          <div
            data-testid="trend-indicator"
            className={`flex items-center space-x-1 ${trendColors[trend]}`}
          >
            {trendIcons[trend]}
            <span className="text-sm font-medium">{trendText[trend]}</span>
          </div>
        </div>

        {summary && (
          <p className="text-xs text-gray-500 mt-2">
            Based on {summary.totalResponses} response{summary.totalResponses !== 1 ? 's' : ''}
          </p>
        )}
      </CardContent>
    </Card>
  );
}
