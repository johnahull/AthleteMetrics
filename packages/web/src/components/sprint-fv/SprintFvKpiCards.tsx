import { KPICardWithTrend, type TrendData } from '@/components/kpi-card-with-trend';
import { Zap, Gauge, BatteryCharging, TrendingDown, Activity, ArrowDownRight } from 'lucide-react';
import type { SprintFvProfile } from '@/lib/sprint-fv-api';
import { useUnitSystem } from '@/contexts/UnitSystemContext';

interface Props {
  profile: SprintFvProfile;
}

function deltaToTrend(delta?: { absolute: number; percent: number; direction: string }): TrendData | undefined {
  if (!delta) return undefined;
  return {
    value: Math.round(delta.absolute * 100) / 100,
    percent: Math.round(delta.percent * 10) / 10,
    direction: delta.direction === 'improved' ? 'up'
      : delta.direction === 'declined' ? 'down'
      : 'flat',
  };
}

export function SprintFvKpiCards({ profile }: Props) {
  const deltas = profile.analysisJson?.deltas;
  const units = useUnitSystem();

  const cards = [
    {
      title: `F0 (${units.forceRelUnit})`,
      value: profile.f0Rel ? parseFloat(profile.f0Rel).toFixed(2) : '—',
      icon: Zap,
      trend: deltaToTrend(deltas?.f0Delta),
    },
    {
      title: `V0 (${units.velUnit})`,
      value: profile.v0 ? units.vel(parseFloat(profile.v0)).toFixed(2) : '—',
      icon: Gauge,
      trend: deltaToTrend(deltas?.v0Delta),
    },
    {
      title: `Pmax (${units.powerRelUnit})`,
      value: profile.pmaxRel ? parseFloat(profile.pmaxRel).toFixed(2) : '—',
      icon: BatteryCharging,
      trend: deltaToTrend(deltas?.pmaxDelta),
    },
    {
      title: 'F-V Slope',
      value: profile.fvSlope ? parseFloat(profile.fvSlope).toFixed(3) : '—',
      icon: TrendingDown,
      trend: deltaToTrend(deltas?.slopeDelta),
    },
    {
      title: 'RF Peak',
      value: profile.rfPeak ? parseFloat(profile.rfPeak).toFixed(3) : '—',
      icon: Activity,
      trend: deltaToTrend(deltas?.rfPeakDelta),
    },
    {
      title: 'DRF',
      value: profile.drf ? parseFloat(profile.drf).toFixed(4) : '—',
      icon: ArrowDownRight,
      trend: deltaToTrend(deltas?.drfDelta),
    },
    {
      title: 'Fit R\u00b2',
      value: profile.fitR2 ? parseFloat(profile.fitR2).toFixed(4) : '—',
      icon: Activity,
    },
  ];

  return (
    <div className="grid grid-cols-2 md:grid-cols-4 lg:grid-cols-7 gap-4">
      {cards.map((card) => (
        <KPICardWithTrend
          key={card.title}
          title={card.title}
          value={card.value}
          icon={card.icon}
          trend={card.trend}
        />
      ))}
    </div>
  );
}
