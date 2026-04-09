import { useMemo, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Loader2 } from 'lucide-react';
import { Line } from 'react-chartjs-2';
import type { ChartOptions } from 'chart.js';
import { useSprintFvProfiles, type SprintFvProfile } from '@/lib/sprint-fv-api';

interface Props {
  userId: string;
}

const METRIC_OPTIONS = [
  { key: 'f0Rel', label: 'F0 (N/kg)', color: 'rgba(59, 130, 246, 1)' },
  { key: 'v0', label: 'V0 (m/s)', color: 'rgba(16, 185, 129, 1)' },
  { key: 'pmaxRel', label: 'Pmax (W/kg)', color: 'rgba(245, 158, 11, 1)' },
] as const;

export function SprintFvLongitudinal({ userId }: Props) {
  const { data, isLoading } = useSprintFvProfiles(userId);
  const [visibleMetrics, setVisibleMetrics] = useState<Set<string>>(
    new Set(METRIC_OPTIONS.map(m => m.key))
  );

  const profiles = useMemo(() => {
    if (!data?.profiles) return [];
    return [...data.profiles].sort((a, b) => a.date.localeCompare(b.date));
  }, [data?.profiles]);

  const toggleMetric = (key: string) => {
    setVisibleMetrics(prev => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  };

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-12">
        <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      </div>
    );
  }

  if (profiles.length < 2) {
    return (
      <div className="text-center py-12 text-muted-foreground">
        At least 2 profiles are needed for trend analysis.
      </div>
    );
  }

  const labels = profiles.map(p => p.date);
  const datasets = METRIC_OPTIONS
    .filter(m => visibleMetrics.has(m.key))
    .map(m => ({
      label: m.label,
      data: profiles.map(p => {
        const val = p[m.key as 'f0Rel' | 'v0' | 'pmaxRel'];
        return val != null ? parseFloat(val) : null;
      }),
      borderColor: m.color,
      backgroundColor: m.color.replace(', 1)', ', 0.1)'),
      tension: 0.3,
      pointRadius: 5,
      pointHoverRadius: 8,
    }));

  const chartData = { labels, datasets };

  const options: ChartOptions<'line'> = {
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
    },
    scales: {
      x: { title: { display: true, text: 'Date' } },
      y: { title: { display: true, text: 'Value' } },
    },
  };

  return (
    <div className="space-y-4">
      {/* Metric toggles */}
      <div className="flex gap-2">
        {METRIC_OPTIONS.map(m => (
          <Badge
            key={m.key}
            variant={visibleMetrics.has(m.key) ? 'default' : 'outline'}
            className="cursor-pointer"
            onClick={() => toggleMetric(m.key)}
          >
            {m.label}
          </Badge>
        ))}
      </div>

      {/* Trend chart */}
      <Card>
        <CardContent className="p-4">
          <div style={{ height: 400 }}>
            <Line data={chartData} options={options} />
          </div>
        </CardContent>
      </Card>

      {/* Data table */}
      <Card>
        <CardHeader>
          <CardTitle className="text-sm">Session History</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b text-left">
                  <th className="py-2 pr-4">Date</th>
                  <th className="py-2 pr-4">Classification</th>
                  <th className="py-2 pr-4 text-right">F0</th>
                  <th className="py-2 pr-4 text-right">V0</th>
                  <th className="py-2 text-right">Pmax</th>
                </tr>
              </thead>
              <tbody>
                {profiles.map(p => {
                  const cls = p.analysisJson?.classification.classification;
                  return (
                    <tr key={p.id} className="border-b">
                      <td className="py-2 pr-4">{p.date}</td>
                      <td className="py-2 pr-4">
                        {cls && (
                          <Badge variant="outline" className="text-xs">
                            {cls === 'force-deficit' ? 'Force Def.'
                              : cls === 'velocity-deficit' ? 'Vel. Def.'
                              : 'Balanced'}
                          </Badge>
                        )}
                      </td>
                      <td className="py-2 pr-4 text-right">{p.f0Rel ? parseFloat(p.f0Rel).toFixed(2) : '—'}</td>
                      <td className="py-2 pr-4 text-right">{p.v0 ? parseFloat(p.v0).toFixed(2) : '—'}</td>
                      <td className="py-2 text-right">{p.pmaxRel ? parseFloat(p.pmaxRel).toFixed(2) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
