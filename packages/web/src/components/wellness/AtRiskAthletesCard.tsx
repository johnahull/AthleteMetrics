import { useMemo, memo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { AlertTriangle, UserCheck } from 'lucide-react';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';
import { calculateAthleteStatus } from '@shared/wellness-status-utils';

interface AtRiskAthletesCardProps {
  responses: WellnessResponse[];
  responsesByTemplate: Record<string, { template: WellnessTemplate; responses: WellnessResponse[] }>;
  onAthleteClick?: (athleteId: string) => void;
  'data-testid'?: string;
}

interface AtRiskAthlete {
  id: string;
  name: string;
  status: 'red' | 'yellow';
  score: number | null;
  hasInjury: boolean;
  date: string;
}

/**
 * Summary card showing athletes in red or yellow status who may need attention
 */
export const AtRiskAthletesCard = memo(function AtRiskAthletesCard({
  responses,
  responsesByTemplate,
  onAthleteClick,
  'data-testid': testId,
}: AtRiskAthletesCardProps) {
  // Calculate at-risk athletes from most recent responses
  const atRiskAthletes = useMemo(() => {
    if (!responses || responses.length === 0 || !responsesByTemplate) {
      return [];
    }

    // Get most recent response per athlete
    const latestByAthlete: Record<string, { response: WellnessResponse; template: WellnessTemplate }> = {};

    Object.values(responsesByTemplate).forEach(({ template, responses: templateResponses }) => {
      templateResponses.forEach((response) => {
        const existing = latestByAthlete[response.userId];
        if (!existing || new Date(response.date) > new Date(existing.response.date)) {
          latestByAthlete[response.userId] = { response, template };
        }
      });
    });

    // Calculate status for each athlete's latest response
    const atRisk: AtRiskAthlete[] = [];

    Object.values(latestByAthlete).forEach(({ response, template }) => {
      const { status, score, injuries } = calculateAthleteStatus(response, template);

      if (status === 'red' || status === 'yellow') {
        atRisk.push({
          id: response.userId,
          name: response.userFullName,
          status,
          score,
          hasInjury: injuries.length > 0,
          date: response.date,
        });
      }
    });

    // Sort: red first, then yellow, then by score (lowest first)
    atRisk.sort((a, b) => {
      if (a.status !== b.status) {
        return a.status === 'red' ? -1 : 1;
      }
      return (a.score ?? 0) - (b.score ?? 0);
    });

    return atRisk;
  }, [responses, responsesByTemplate]);

  const redCount = atRiskAthletes.filter((a) => a.status === 'red').length;
  const yellowCount = atRiskAthletes.filter((a) => a.status === 'yellow').length;

  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
          <AlertTriangle className="h-4 w-4" />
          At-Risk Athletes
        </CardTitle>
      </CardHeader>
      <CardContent>
        {atRiskAthletes.length === 0 ? (
          <div className="flex items-center gap-2 text-green-600">
            <UserCheck className="h-5 w-5" />
            <span className="text-sm font-medium">All athletes healthy</span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold text-gray-900">{atRiskAthletes.length}</span>
              <span className="text-sm text-gray-500">
                athlete{atRiskAthletes.length !== 1 ? 's' : ''} need attention
              </span>
            </div>

            {/* Status breakdown */}
            <div className="flex gap-4 mb-3 text-sm">
              {redCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-red-600"></span>
                  <span className="text-gray-600">{redCount} critical</span>
                </span>
              )}
              {yellowCount > 0 && (
                <span className="flex items-center gap-1">
                  <span className="w-2 h-2 rounded-full bg-yellow-500"></span>
                  <span className="text-gray-600">{yellowCount} moderate</span>
                </span>
              )}
            </div>

            {/* Top 3 athletes list */}
            <div className="space-y-2">
              {atRiskAthletes.slice(0, 3).map((athlete) => (
                <button
                  key={athlete.id}
                  onClick={() => onAthleteClick?.(athlete.id)}
                  className="w-full text-left p-2 rounded-md hover:bg-gray-50 transition-colors flex items-center justify-between"
                >
                  <div className="flex items-center gap-2">
                    <span
                      className={`w-2 h-2 rounded-full ${
                        athlete.status === 'red' ? 'bg-red-600' : 'bg-yellow-500'
                      }`}
                    ></span>
                    <span className="text-sm font-medium text-gray-900 truncate max-w-[120px]">
                      {athlete.name}
                    </span>
                  </div>
                  <span className="text-xs text-gray-500">
                    {athlete.hasInjury ? 'Injury' : athlete.score?.toFixed(1) ?? '-'}
                  </span>
                </button>
              ))}
              {atRiskAthletes.length > 3 && (
                <p className="text-xs text-gray-500 text-center pt-1">
                  +{atRiskAthletes.length - 3} more
                </p>
              )}
            </div>
          </>
        )}
      </CardContent>
    </Card>
  );
});
