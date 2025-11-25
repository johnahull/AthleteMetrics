import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { TrendIndicator, ScoreDisplay } from './ui/WellnessUIComponents';

interface WellnessSummaryCardProps {
  summary: {
    averageWellness: number;
    trend: 'up' | 'down' | 'stable';
    totalResponses: number;
  } | null;
  scaleMax: number;
  'data-testid'?: string;
}

/**
 * Summary card displaying average wellness score and trend indicator
 */
export function WellnessSummaryCard({ summary, scaleMax, 'data-testid': testId }: WellnessSummaryCardProps) {
  const trend = summary?.trend || 'stable';
  const score = summary?.averageWellness || 0;

  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600" data-testid="card-title">
          Average Wellness
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div className="flex items-baseline justify-between">
          <div data-testid="wellness-score" className="text-3xl text-gray-900">
            <ScoreDisplay score={score} max={scaleMax} />
          </div>
          <div data-testid="trend-indicator">
            <TrendIndicator trend={trend} />
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
