import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { HeartPulse, CheckCircle } from 'lucide-react';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';
import { calculateAthleteStatus, getCommonInjuries } from '@shared/wellness-status-utils';

interface InjurySummaryCardProps {
  responses: WellnessResponse[];
  responsesByTemplate: Record<string, { template: WellnessTemplate; responses: WellnessResponse[] }>;
  'data-testid'?: string;
}

interface InjuryLocation {
  label: string;
  count: number;
}

/**
 * Summary card showing athletes with injuries and common injury locations
 */
export function InjurySummaryCard({
  responses,
  responsesByTemplate,
  'data-testid': testId,
}: InjurySummaryCardProps) {
  // Calculate injury summary from most recent responses
  const injurySummary = useMemo(() => {
    if (!responses || responses.length === 0 || !responsesByTemplate) {
      return { athletesWithInjuries: 0, totalInjuries: 0, commonLocations: [] as InjuryLocation[] };
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

    // Calculate injuries for each athlete's latest response
    const athleteStatuses = Object.values(latestByAthlete).map(({ response, template }) =>
      calculateAthleteStatus(response, template)
    );

    const athletesWithInjuries = athleteStatuses.filter((s) => s.injuries.length > 0).length;
    const totalInjuries = athleteStatuses.reduce((sum, s) => sum + s.injuries.length, 0);
    const commonLocations = getCommonInjuries(athleteStatuses).slice(0, 3);

    return { athletesWithInjuries, totalInjuries, commonLocations };
  }, [responses, responsesByTemplate]);

  const { athletesWithInjuries, totalInjuries, commonLocations } = injurySummary;

  return (
    <Card data-testid={testId}>
      <CardHeader className="pb-2">
        <CardTitle className="text-sm font-medium text-gray-600 flex items-center gap-2">
          <HeartPulse className="h-4 w-4" />
          Injury Report
        </CardTitle>
      </CardHeader>
      <CardContent>
        {athletesWithInjuries === 0 ? (
          <div className="flex items-center gap-2 text-green-600">
            <CheckCircle className="h-5 w-5" />
            <span className="text-sm font-medium">No injuries reported</span>
          </div>
        ) : (
          <>
            <div className="flex items-baseline gap-2 mb-3">
              <span className="text-3xl font-bold text-gray-900">{athletesWithInjuries}</span>
              <span className="text-sm text-gray-500">
                athlete{athletesWithInjuries !== 1 ? 's' : ''} reporting
                {totalInjuries > athletesWithInjuries && (
                  <span> ({totalInjuries} total)</span>
                )}
              </span>
            </div>

            {/* Common injury locations */}
            {commonLocations.length > 0 && (
              <div className="space-y-2">
                <p className="text-xs text-gray-500 font-medium uppercase tracking-wide">
                  Common Areas
                </p>
                {commonLocations.map((location) => (
                  <div
                    key={location.label}
                    className="flex items-center justify-between text-sm"
                  >
                    <span className="text-gray-700">{location.label}</span>
                    <span className="text-gray-500">
                      {location.count} athlete{location.count !== 1 ? 's' : ''}
                    </span>
                  </div>
                ))}
              </div>
            )}

            {commonLocations.length === 0 && totalInjuries > 0 && (
              <p className="text-xs text-gray-500">
                Injury locations not specified
              </p>
            )}
          </>
        )}
      </CardContent>
    </Card>
  );
}
