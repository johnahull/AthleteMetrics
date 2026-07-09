import { useMemo } from 'react';
import { Scatter } from 'react-chartjs-2';
import type { ChartOptions, ChartData } from 'chart.js';
import type { SprintFvProfile } from '@/lib/sprint-fv-api';
import { useUnitSystem } from '@/contexts/UnitSystemContext';

interface Props {
  /** Only the fitted params + analysis are read, so slimmer report payloads are accepted too. */
  profile: Pick<SprintFvProfile, 'f0Rel' | 'v0' | 'pmaxRel' | 'analysisJson'>;
}

export function ForceVelocityChart({ profile }: Props) {
  const units = useUnitSystem();
  const f0Raw = profile.f0Rel ? parseFloat(profile.f0Rel) : 0;
  const f0 = units.forceRel(f0Raw);
  const v0Raw = profile.v0 ? parseFloat(profile.v0) : 0;
  const v0 = units.vel(v0Raw);
  const pmax = profile.pmaxRel ? parseFloat(profile.pmaxRel) : 0;
  const analysis = profile.analysisJson?.optimalGap;

  const chartData = useMemo<ChartData<'scatter'>>(() => {
    const datasets: ChartData<'scatter'>['datasets'] = [];

    // Dataset 1: F-V line (linear)
    datasets.push({
      type: 'scatter' as const,
      label: 'F-V Profile',
      data: [
        { x: 0, y: f0 },
        { x: v0, y: 0 },
      ],
      showLine: true,
      borderColor: 'rgba(59, 130, 246, 1)',
      backgroundColor: 'rgba(59, 130, 246, 0.1)',
      borderWidth: 3,
      pointRadius: 6,
      pointBackgroundColor: 'rgba(59, 130, 246, 1)',
      fill: false,
      yAxisID: 'y',
    });

    // Dataset 2: P-V parabola (computed in metric so Y1 axis stays in W/kg)
    const pvPoints: { x: number; y: number }[] = [];
    const numPoints = 50;
    for (let i = 0; i <= numPoints; i++) {
      const vMetric = (i / numPoints) * v0Raw;
      const p = f0Raw * vMetric * (1 - vMetric / v0Raw);
      pvPoints.push({ x: units.vel(vMetric), y: p });
    }
    datasets.push({
      type: 'scatter' as const,
      label: 'Power-Velocity',
      data: pvPoints,
      showLine: true,
      borderColor: 'rgba(16, 185, 129, 1)',
      backgroundColor: 'rgba(16, 185, 129, 0.1)',
      borderWidth: 2,
      pointRadius: 0,
      fill: true,
      yAxisID: 'y1',
    });

    // Dataset 3: Optimal F-V line (if analysis data exists)
    if (analysis) {
      datasets.push({
        type: 'scatter' as const,
        label: 'Optimal Profile',
        data: [
          { x: 0, y: units.forceRel(analysis.optimalF0) },
          { x: units.vel(analysis.optimalV0), y: 0 },
        ],
        showLine: true,
        borderColor: 'rgba(156, 163, 175, 0.8)',
        backgroundColor: 'transparent',
        borderWidth: 2,
        pointRadius: 4,
        pointBackgroundColor: 'rgba(156, 163, 175, 0.8)',
        fill: false,
        yAxisID: 'y',
        segment: { borderDash: [8, 4] },
      });
    }

    return { datasets };
  }, [f0, v0, analysis, units]);

  const options = useMemo<ChartOptions<'scatter'>>(() => ({
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: 'nearest',
      intersect: false,
    },
    plugins: {
      legend: {
        display: true,
        position: 'top',
      },
      tooltip: {
        callbacks: {
          label: (ctx) => {
            const v = (ctx.parsed.x ?? 0).toFixed(2);
            const val = (ctx.parsed.y ?? 0).toFixed(2);
            if (ctx.dataset.yAxisID === 'y1') {
              return `Power: ${val} ${units.powerRelUnit} at ${v} ${units.velUnit}`;
            }
            return `Force: ${val} ${units.forceRelUnit} at ${v} ${units.velUnit}`;
          },
        },
      },
      annotation: {
        annotations: {
          pmaxLine: {
            type: 'line',
            xMin: v0 / 2,
            xMax: v0 / 2,
            borderColor: 'rgba(16, 185, 129, 0.5)',
            borderWidth: 1,
            borderDash: [4, 4],
            label: {
              content: `Pmax = ${pmax.toFixed(1)} ${units.powerRelUnit}`,
              display: true,
              position: 'start',
              backgroundColor: 'rgba(16, 185, 129, 0.8)',
              color: 'white',
              font: { size: 11 },
            },
          },
          f0Label: {
            type: 'label',
            xValue: v0 * 0.02,
            yValue: f0 * 0.95,
            content: [`F0 = ${f0.toFixed(1)} ${units.forceRelUnit}`],
            color: 'rgba(59, 130, 246, 1)',
            font: { size: 11, weight: 'bold' },
          },
          v0Label: {
            type: 'label',
            xValue: v0 - 0.5,
            yValue: 0.5,
            content: [`V0 = ${v0.toFixed(1)} ${units.velUnit}`],
            color: 'rgba(59, 130, 246, 1)',
            font: { size: 11, weight: 'bold' },
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: `Velocity (${units.velUnit})` },
        min: 0,
        max: Math.max(v0, analysis ? units.vel(analysis.optimalV0) : 0) * 1.1,
      },
      y: {
        type: 'linear',
        position: 'left',
        title: { display: true, text: `Force (${units.forceRelUnit})` },
        min: 0,
        max: Math.max(f0, analysis ? units.forceRel(analysis.optimalF0) : 0) * 1.15,
      },
      y1: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: `Power (${units.powerRelUnit})` },
        min: 0,
        max: pmax > 0 ? pmax * 1.3 : undefined,
        grid: { drawOnChartArea: false },
      },
    },
  }), [f0, v0, pmax, analysis, units]);

  return (
    <div className="rounded-lg border bg-card shadow-sm p-6" style={{ height: 400 }}>
      <Scatter key={units.system} data={chartData} options={options} />
    </div>
  );
}
