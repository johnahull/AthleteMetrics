import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Progress } from '@/components/ui/progress';

interface CompletionRateCardProps {
  completionRate: {
    percentage: number;
    completed: number;
    total: number;
  };
  'data-testid'?: string;
}

/**
 * Card displaying wellness questionnaire completion rate
 */
export function CompletionRateCard({ completionRate, 'data-testid': testId }: CompletionRateCardProps) {
  const { percentage, completed, total } = completionRate;

  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600" data-testid="card-title">
          Completion Rate
        </CardTitle>
      </CardHeader>
      <CardContent>
        <div data-testid="completion-percentage" className="text-3xl font-bold text-gray-900 mb-2">
          {percentage.toFixed(0)}%
        </div>

        <Progress
          value={percentage}
          className="h-2 mb-2"
          data-testid="completion-progress-bar"
        />

        <p data-testid="completion-count" className="text-xs text-gray-500">
          {completed} of {total} athlete{total !== 1 ? 's' : ''} responded
        </p>
      </CardContent>
    </Card>
  );
}
