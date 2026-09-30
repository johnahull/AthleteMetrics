// packages/web/src/components/reports/TierDistributionChartSection.tsx
import { useMemo } from 'react';
import { Bar } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import type { TierDistribution } from '@shared/benchmark-utils';

interface Props {
  tierDistributions: TierDistribution[];
  metricLabels?: Record<string, string>;
}

export function TierDistributionChartSection({ tierDistributions, metricLabels = {} }: Props) {
  const chartData = useMemo(() => {
    if (tierDistributions.length === 0) return null;

    const labels = tierDistributions.map(
      ({ metricCode, tierGroupName }) => `${metricLabels[metricCode] || metricCode} (${tierGroupName})`
    );

    // Collect every distinct tier name across all rows, ordered by tierOrder
    // (ascending — 1 = best) so segments stack in a consistent worst-to-best order.
    const tierMeta = new Map<string, { tierColor: string; tierOrder: number }>();
    tierDistributions.forEach(({ tiers }) => {
      tiers.forEach(({ tierName, tierColor, tierOrder }) => {
        if (!tierMeta.has(tierName)) tierMeta.set(tierName, { tierColor, tierOrder });
      });
    });
    const tierNames = Array.from(tierMeta.keys()).sort(
      (a, b) => tierMeta.get(b)!.tierOrder - tierMeta.get(a)!.tierOrder
    );

    const datasets = tierNames.map((tierName) => ({
      label: tierName,
      backgroundColor: tierMeta.get(tierName)!.tierColor,
      data: tierDistributions.map(({ tiers }) => tiers.find((t) => t.tierName === tierName)?.count ?? 0),
      stack: 'tier',
    }));

    return { labels, datasets };
  }, [tierDistributions, metricLabels]);

  if (!chartData) return null;

  const options: ChartOptions<'bar'> = {
    responsive: true,
    maintainAspectRatio: false,
    animation: false,
    plugins: {
      legend: { display: true, position: 'top' as const },
    },
    scales: {
      x: { stacked: true },
      y: { stacked: true, title: { display: true, text: 'Athletes' }, ticks: { precision: 0 } },
    },
  };

  return (
    <Card data-report-chart="tierDistribution" data-report-chart-title="Team tier distribution">
      <CardHeader>
        <CardTitle>Tier Distribution</CardTitle>
        <CardDescription>How the team is distributed across benchmark tiers, per metric</CardDescription>
      </CardHeader>
      <CardContent>
        <div className="h-[360px]">
          <Bar data={chartData} options={options} />
        </div>
      </CardContent>
    </Card>
  );
}

export default TierDistributionChartSection;
