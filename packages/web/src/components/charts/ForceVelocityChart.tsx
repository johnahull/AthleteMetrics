import { useMemo } from 'react';
import { Scatter } from 'react-chartjs-2';
import type { ChartOptions, ChartData } from 'chart.js';
import type { SprintFvProfile } from '@/lib/sprint-fv-api';

interface Props {
  profile: SprintFvProfile;
}

export function ForceVelocityChart({ profile }: Props) {
  const f0 = profile.f0Rel ? parseFloat(profile.f0Rel) : 0;
  const v0 = profile.v0 ? parseFloat(profile.v0) : 0;
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

    // Dataset 2: P-V parabola
    const pvPoints: { x: number; y: number }[] = [];
    const numPoints = 50;
    for (let i = 0; i <= numPoints; i++) {
      const v = (i / numPoints) * v0;
      const p = f0 * v * (1 - v / v0);
      pvPoints.push({ x: v, y: p });
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
          { x: 0, y: analysis.optimalF0 },
          { x: analysis.optimalV0, y: 0 },
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
      } as any);
    }

    return { datasets };
  }, [f0, v0, analysis]);

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
              return `Power: ${val} W/kg at ${v} m/s`;
            }
            return `Force: ${val} N/kg at ${v} m/s`;
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
              content: `Pmax = ${pmax.toFixed(1)} W/kg`,
              display: true,
              position: 'start',
              backgroundColor: 'rgba(16, 185, 129, 0.8)',
              color: 'white',
              font: { size: 11 },
            },
          },
          f0Label: {
            type: 'label',
            xValue: 0.3,
            yValue: f0 - 0.3,
            content: [`F0 = ${f0.toFixed(1)} N/kg`],
            color: 'rgba(59, 130, 246, 1)',
            font: { size: 11, weight: 'bold' },
          },
          v0Label: {
            type: 'label',
            xValue: v0 - 0.5,
            yValue: 0.5,
            content: [`V0 = ${v0.toFixed(1)} m/s`],
            color: 'rgba(59, 130, 246, 1)',
            font: { size: 11, weight: 'bold' },
          },
        },
      },
    },
    scales: {
      x: {
        title: { display: true, text: 'Velocity (m/s)' },
        min: 0,
        max: Math.max(v0, analysis?.optimalV0 || 0) * 1.1,
      },
      y: {
        type: 'linear',
        position: 'left',
        title: { display: true, text: 'Force (N/kg)' },
        min: 0,
        max: Math.max(f0, analysis?.optimalF0 || 0) * 1.15,
      },
      y1: {
        type: 'linear',
        position: 'right',
        title: { display: true, text: 'Power (W/kg)' },
        min: 0,
        max: pmax > 0 ? pmax * 1.3 : undefined,
        grid: { drawOnChartArea: false },
      },
    },
  }), [f0, v0, pmax, analysis]);

  return (
    <div className="rounded-lg border bg-card shadow-sm p-6" style={{ height: 400 }}>
      <Scatter data={chartData} options={options} />
    </div>
  );
}
