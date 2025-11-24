import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableHeader, TableRow, TableHead, TableBody, TableCell } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { ArrowUp, ArrowDown, Minus, TrendingUp, TrendingDown } from 'lucide-react';
import type { WellnessResponse, WellnessTemplate } from '@shared/wellness-types';
import { calculateAthleteStatus } from '@shared/wellness-status-utils';

interface TeamComparisonData {
  teamId: string;
  teamName: string;
  avgWellness: number;
  statusBreakdown: { red: number; yellow: number; green: number };
  alertCount: number;
  completionRate: number;
  totalAthletes: number;
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
  onTeamClick?: (teamId: string) => void;
}

type SortField = 'teamName' | 'avgWellness' | 'alertCount' | 'completionRate';
type SortDirection = 'asc' | 'desc';

export function TeamComparisonCard({
  responses,
  responsesByTemplate,
  filters,
  onTeamClick,
}: TeamComparisonCardProps) {
  const [sortField, setSortField] = useState<SortField>('teamName');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

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

      // Calculate average wellness score
      let totalScore = 0;
      let scoreCount = 0;
      teamResponses.forEach(response => {
        Object.values(response.responses).forEach((data: any) => {
          if (typeof data.value === 'number') {
            totalScore += data.value;
            scoreCount++;
          }
        });
      });
      const avgWellness = scoreCount > 0 ? totalScore / scoreCount : 0;

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

      // Calculate completion rate
      const uniqueAthletes = new Set(teamResponses.map(r => r.userId)).size;
      const totalAthletes = uniqueAthletes; // Simplified - would need request data for accurate count
      const completionRate = totalAthletes > 0 ? (uniqueAthletes / totalAthletes) * 100 : 0;

      // Alert count (athletes in red status)
      const alertCount = statusBreakdown.red;

      // Calculate trend (simplified - comparing first half vs second half)
      const sortedResponses = [...teamResponses].sort(
        (a, b) => new Date(a.date).getTime() - new Date(b.date).getTime()
      );
      const midpoint = Math.floor(sortedResponses.length / 2);
      const firstHalf = sortedResponses.slice(0, midpoint);
      const secondHalf = sortedResponses.slice(midpoint);

      const calcAvg = (resps: WellnessResponse[]) => {
        let sum = 0;
        let count = 0;
        resps.forEach(r => {
          Object.values(r.responses).forEach((data: any) => {
            if (typeof data.value === 'number') {
              sum += data.value;
              count++;
            }
          });
        });
        return count > 0 ? sum / count : 0;
      };

      const firstAvg = calcAvg(firstHalf);
      const secondAvg = calcAvg(secondHalf);
      const trendDiff = secondAvg - firstAvg;
      const trend = trendDiff > 0.5 ? 'up' : trendDiff < -0.5 ? 'down' : 'stable';

      data.push({
        teamId,
        teamName,
        avgWellness,
        statusBreakdown,
        alertCount,
        completionRate,
        totalAthletes,
        trend,
      });
    });

    return data;
  }, [responses, responsesByTemplate]);

  // Sort team data
  const sortedTeamData = useMemo(() => {
    const sorted = [...teamData].sort((a, b) => {
      let comparison = 0;
      switch (sortField) {
        case 'teamName':
          comparison = a.teamName.localeCompare(b.teamName);
          break;
        case 'avgWellness':
          comparison = a.avgWellness - b.avgWellness;
          break;
        case 'alertCount':
          comparison = a.alertCount - b.alertCount;
          break;
        case 'completionRate':
          comparison = a.completionRate - b.completionRate;
          break;
      }
      return sortDirection === 'asc' ? comparison : -comparison;
    });
    return sorted;
  }, [teamData, sortField, sortDirection]);

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const SortIcon = ({ field }: { field: SortField }) => {
    if (sortField !== field) return null;
    return sortDirection === 'asc' ? (
      <ArrowUp className="inline w-4 h-4 ml-1" />
    ) : (
      <ArrowDown className="inline w-4 h-4 ml-1" />
    );
  };

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
                  onClick={() => handleSort('completionRate')}
                >
                  Completion <SortIcon field="completionRate" />
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
                    <span className="font-semibold">{team.avgWellness.toFixed(1)}</span>
                    <span className="text-xs text-muted-foreground">/10</span>
                  </TableCell>
                  <TableCell>
                    <div className="flex gap-2">
                      {team.statusBreakdown.red > 0 && (
                        <Badge variant="destructive" className="text-xs">
                          {team.statusBreakdown.red} Red
                        </Badge>
                      )}
                      {team.statusBreakdown.yellow > 0 && (
                        <Badge variant="outline" className="text-xs bg-yellow-50 text-yellow-700 border-yellow-200">
                          {team.statusBreakdown.yellow} Yellow
                        </Badge>
                      )}
                      {team.statusBreakdown.green > 0 && (
                        <Badge variant="outline" className="text-xs bg-green-50 text-green-700 border-green-200">
                          {team.statusBreakdown.green} Green
                        </Badge>
                      )}
                    </div>
                  </TableCell>
                  <TableCell>
                    {team.alertCount > 0 ? (
                      <Badge variant="destructive">{team.alertCount}</Badge>
                    ) : (
                      <span className="text-muted-foreground">0</span>
                    )}
                  </TableCell>
                  <TableCell>
                    <span className="font-medium">{team.completionRate.toFixed(0)}%</span>
                    <span className="text-xs text-muted-foreground ml-1">
                      ({team.totalAthletes})
                    </span>
                  </TableCell>
                  <TableCell>
                    {team.trend === 'up' && (
                      <div className="flex items-center text-green-600">
                        <TrendingUp className="w-4 h-4 mr-1" />
                        <span className="text-xs">Up</span>
                      </div>
                    )}
                    {team.trend === 'down' && (
                      <div className="flex items-center text-red-600">
                        <TrendingDown className="w-4 h-4 mr-1" />
                        <span className="text-xs">Down</span>
                      </div>
                    )}
                    {team.trend === 'stable' && (
                      <div className="flex items-center text-gray-600">
                        <Minus className="w-4 h-4 mr-1" />
                        <span className="text-xs">Stable</span>
                      </div>
                    )}
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
