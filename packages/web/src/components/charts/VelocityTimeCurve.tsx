import { useMemo } from 'react';
import { Scatter } from 'react-chartjs-2';
import type { ChartOptions, ChartData } from 'chart.js';
import type { SprintFvProfile } from '@/lib/sprint-fv-api';
import { useUnitSystem } from '@/contexts/UnitSystemContext';

interface Props {
  profile: SprintFvProfile;
}

export function VelocityTimeCurve({ profile }: Props) {
  const units = useUnitSystem();
  const vmaxRaw = profile.vmax ? parseFloat(profile.vmax) : 0;
  const vmax = units.vel(vmaxRaw);
  const tau = profile.tau ? parseFloat(profile.tau) : 0;
  const splitTimes = profile.splitTimesJson;
  const distanceUnit = profile.distanceUnit;
  const hasData = vmaxRaw > 0 && tau > 0 && Object.keys(splitTimes).length > 0;

  const chartData = useMemo<ChartData<'scatter'>>(() => {
    if (!hasData) return { datasets: [] };

    const YARDS_TO_METERS = 0.9144;
    const timeValues = Object.values(splitTimes);
    const maxTime = Math.max(...timeValues) * 1.1;

    const curvePoints: { x: number; y: number }[] = [];
    const numPoints = 100;
    for (let i = 0; i <= numPoints; i++) {
      const t = (i / numPoints) * maxTime;
      const v = vmax * (1 - Math.exp(-t / tau));
      curvePoints.push({ x: t, y: v });
    }

    const entries = Object.entries(splitTimes)
      .map(([dist, time]) => ({
        distance: parseFloat(dist),
        distanceM: distanceUnit === 'yards' ? parseFloat(dist) * YARDS_TO_METERS : parseFloat(dist),
        time,
      }))
      .sort((a, b) => a.distance - b.distance);

    const scatterPoints: { x: number; y: number }[] = [];
    for (let i = 0; i < entries.length; i++) {
      if (i === 0) {
        scatterPoints.push({
          x: entries[0].time / 2,
          y: units.vel(entries[0].distanceM / entries[0].time),
        });
      } else {
        const dt = entries[i].time - entries[i - 1].time;
        const dd = entries[i].distanceM - entries[i - 1].distanceM;
        scatterPoints.push({
          x: (entries[i].time + entries[i - 1].time) / 2,
          y: units.vel(dd / dt),
        });
      }
    }

    return {
      datasets: [
        {
          label: 'Fitted v(t)',
          data: curvePoints,
          showLine: true,
          borderColor: 'rgba(59, 130, 246, 1)',
          backgroundColor: 'rgba(59, 130, 246, 0.05)',
          borderWidth: 2,
          pointRadius: 0,
          fill: true,
        },
        {
          label: 'Observed (split velocities)',
          data: scatterPoints,
          showLine: false,
          borderColor: 'rgba(239, 68, 68, 1)',
          backgroundColor: 'rgba(239, 68, 68, 0.8)',
          pointRadius: 6,
          pointHoverRadius: 8,
        },
      ],
    };
  }, [vmax, tau, splitTimes, distanceUnit, hasData, units]);

  const options = useMemo<ChartOptions<'scatter'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    plugins: {
      legend: { display: true, position: 'top' },
      annotation: {
        annotations: vmax > 0 ? {
          vmaxLine: {
            type: 'line' as const,
            yMin: vmax,
            yMax: vmax,
            borderColor: 'rgba(156, 163, 175, 0.6)',
            borderWidth: 1,
            borderDash: [6, 4],
            label: {
              content: `Vmax = ${vmax.toFixed(2)} ${units.velUnit}`,
              display: true,
              position: 'end',
              backgroundColor: 'rgba(107, 114, 128, 0.8)',
              color: 'white',
              font: { size: 11 },
            },
          },
        } : {},
      },
    },
    scales: {
      x: { title: { display: true, text: 'Time (s)' }, min: 0 },
      y: { title: { display: true, text: `Velocity (${units.velUnit})` }, min: 0, max: vmax > 0 ? vmax * 1.15 : undefined },
    },
  }), [vmax, units]);

  if (!hasData) {
    return (
      <div className="rounded-lg border bg-card shadow-sm p-6 flex items-center justify-center text-muted-foreground" style={{ height: 300 }}>
        Insufficient data for velocity-time curve
      </div>
    );
  }

  return (
    <div className="rounded-lg border bg-card shadow-sm p-6" style={{ height: 300 }}>
      <Scatter key={units.system} data={chartData} options={options} />
    </div>
  );
}
