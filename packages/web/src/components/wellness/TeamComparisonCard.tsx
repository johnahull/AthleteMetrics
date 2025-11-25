import { useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';
import { calculateAthleteStatus } from '@shared/wellness-status-utils';
import { calculateAverageWellness, calculateTrend } from '@/utils/wellness-analytics';
import { useSortableTable } from '@/hooks/use-sortable-table.tsx';
import { TrendIndicator, StatusBreakdownBadges, ScoreDisplay } from './ui/WellnessUIComponents';

interface TeamComparisonData {
  teamId: string;
  teamName: string;
  avgWellness: number;
  statusBreakdown: { red: number; yellow: number; green: number };
  alertCount: number;
  respondentCount: number;
  trend: 'up' | 'down' | 'stable';
}

interface TeamComparisonCardProps {
  responses: WellnessResponse[];
  responsesByTemplate: Record<string, { template: WellnessTemplate; responses: WellnessResponse[] }>;
  filters: {
    dateFrom: string;
    dateTo: string;
    teamIds?: string[];
  };
  scaleMax: number;
  scaleOrientation?: 'higher_is_better' | 'lower_is_better';
  onTeamClick?: (teamId: string) => void;
}

export function TeamComparisonCard({
  responses,
  responsesByTemplate,
  filters,
  scaleMax,
  scaleOrientation = 'higher_is_better',
  onTeamClick,
}: TeamComparisonCardProps) {

  // Calculate team comparison data
  const teamData = useMemo(() => {
    if (!responses || responses.length === 0) return [];

    // Group responses by team
    const teamMap = new Map<string, WellnessResponse[]>();
    responses.forEach(response => {
      if (response.teamId && response.teamNameSnapshot) {
        if (!teamMap.has(response.teamId)) {
          teamMap.set(response.teamId, []);
        }
        teamMap.get(response.teamId)!.push(response);
      }
    });

    // Calculate metrics for each team
    const data: TeamComparisonData[] = [];
    teamMap.forEach((teamResponses, teamId) => {
      const teamName = teamResponses[0].teamNameSnapshot || 'Unknown Team';

      // Calculate average wellness score using shared utility
      const avgWellness = calculateAverageWellness(teamResponses);

      // Calculate status breakdown using template configuration
      const statusBreakdown = { red: 0, yellow: 0, green: 0 };
      const athleteStatuses = new Map<string, 'red' | 'yellow' | 'green'>();

      teamResponses.forEach(response => {
        const template = Object.values(responsesByTemplate).find(
          rt => rt.template.id === response.templateId
        )?.template;

        if (template) {
          const status = calculateAthleteStatus(response, template);
          athleteStatuses.set(response.userId, status.status);
        }
      });

      athleteStatuses.forEach(status => {
        statusBreakdown[status]++;
      });

      // Count unique respondents (athletes who submitted responses)
      const respondentCount = new Set(teamResponses.map(r => r.userId)).size;

      // Alert count (athletes in red status)
      const alertCount = statusBreakdown.red;

      // Calculate trend using shared utility
      const trend = calculateTrend(teamResponses, scaleOrientation, scaleMax);

      data.push({
        teamId,
        teamName,
        avgWellness,
        statusBreakdown,
        alertCount,
        respondentCount,
        trend,
      });
    });

    return data;
  }, [responses, responsesByTemplate, scaleOrientation]);

  // Use sortable table hook
  const { sortedData: sortedTeamData, handleSort, SortIcon } = useSortableTable(teamData, {
    defaultSortField: 'teamName',
    defaultSortDirection: 'asc',
  });

  if (teamData.length === 0) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>Team Comparison</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500 text-center py-8">No team data available</p>
        </CardContent>
      </Card>
    );
  }

  return (
    <Card>
      <CardHeader>
        <CardTitle>Team Comparison</CardTitle>
        <p className="text-sm text-muted-foreground">
          Compare wellness metrics across teams ({teamData.length} teams)
        </p>
      </CardHeader>
      <CardContent>
        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('teamName')}
                >
                  Team Name <SortIcon field="teamName" />
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('avgWellness')}
                >
                  Avg Wellness <SortIcon field="avgWellness" />
                </TableHead>
                <TableHead>Status Breakdown</TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('alertCount')}
                >
                  Alerts <SortIcon field="alertCount" />
                </TableHead>
                <TableHead
                  className="cursor-pointer hover:bg-muted/50"
                  onClick={() => handleSort('respondentCount')}
                >
                  Respondents <SortIcon field="respondentCount" />
                </TableHead>
                <TableHead>Trend</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {sortedTeamData.map(team => (
                <TableRow
                  key={team.teamId}
                  className={onTeamClick ? 'cursor-pointer hover:bg-muted/50' : ''}
                  onClick={() => onTeamClick?.(team.teamId)}
                >
                  <TableCell className="font-medium">{team.teamName}</TableCell>
                  <TableCell>
                    <ScoreDisplay score={team.avgWellness} max={scaleMax} className="font-semibold" />
                  </TableCell>
                  <TableCell>
                    <StatusBreakdownBadges
                      red={team.statusBreakdown.red}
                      yellow={team.statusBreakdown.yellow}
                      green={team.statusBreakdown.green}
                    />
                  </TableCell>
                  <TableCell>
                    {team.alertCount > 0 ? (
                      <Badge variant="destructive">{team.alertCount}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{team.respondentCount}</span>
                    <span className="text-xs text-muted-foreground ml-1">athletes</span>
                  </TableCell>
                  <TableCell>
                    <TrendIndicator trend={team.trend} />
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
