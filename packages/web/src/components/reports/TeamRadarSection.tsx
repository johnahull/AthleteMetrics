// packages/web/src/components/reports/TeamRadarSection.tsx
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { RadarChart } from '@/components/charts/RadarChart';
import { teamRadarDataFromRankings, TEAM_AVERAGE_ATHLETE_ID } from '@/components/charts/trend-utils';
import type { AthleteRanking } from '@/types/report-types';

interface Props {
  rankings: AthleteRanking[];
  metrics: string[];
}

export function TeamRadarSection({ rankings, metrics }: Props) {
  if (metrics.length < 3 || rankings.length === 0) return null;
  const data = teamRadarDataFromRankings(rankings, metrics);

  return (
    <Card data-report-chart="radar" data-report-chart-title="Team all-around profile">
      <CardHeader><CardTitle>Team All-Around Profile (percentiles)</CardTitle></CardHeader>
      <CardContent>
        <p className="text-sm text-muted-foreground mb-3">
          The bold shape is the team average across every metric; the faint shapes
          behind it are individual athletes (up to 8) shown for context. Each spoke
          is a performance test — the farther from center, the higher the percentile.
        </p>
        <div className="h-[340px] overflow-hidden max-w-md mx-auto">
          <RadarChart
            data={data}
            config={{
              type: 'radar_chart',
              title: '',
              showLegend: false,
              showTooltips: true,
              responsive: true,
            }}
            highlightAthlete={TEAM_AVERAGE_ATHLETE_ID}
            dimUnhighlighted
            compact
          />
        </div>
      </CardContent>
    </Card>
  );
}
export default TeamRadarSection;
