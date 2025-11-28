import type { ChartOptions } from 'chart.js';

/**
 * Get responsive chart options based on viewport size
 */
export function getResponsiveChartOptions(isMobile: boolean): Partial<ChartOptions<any>> {
  return {
    responsive: true,
    maintainAspectRatio: false,
    interaction: {
      mode: isMobile ? 'nearest' : 'index',
      intersect: isMobile, // Touch-friendly on mobile
    },
    plugins: {
      legend: {
        display: true,
        position: isMobile ? 'bottom' : 'top',
        labels: {
          usePointStyle: true,
          padding: isMobile ? 8 : 12,
          font: {
            size: isMobile ? 11 : 12,
          },
          boxWidth: isMobile ? 30 : 40,
          boxHeight: isMobile ? 10 : 12,
        },
      },
      title: {
        display: true,
        font: {
          size: isMobile ? 14 : 16,
          weight: 'bold' as const,
        },
        padding: {
          top: isMobile ? 8 : 10,
          bottom: isMobile ? 8 : 10,
        },
      },
      tooltip: {
        enabled: true,
        mode: isMobile ? 'nearest' : 'index',
        intersect: isMobile,
        titleFont: {
          size: isMobile ? 12 : 13,
        },
        bodyFont: {
          size: isMobile ? 11 : 12,
        },
        padding: isMobile ? 8 : 12,
        boxPadding: isMobile ? 4 : 6,
      },
    },
    scales: {
      x: {
        ticks: {
          font: {
            size: isMobile ? 10 : 11,
          },
          maxRotation: isMobile ? 45 : 0,
          minRotation: isMobile ? 45 : 0,
          autoSkip: true,
          autoSkipPadding: isMobile ? 10 : 20,
        },
        grid: {
          display: !isMobile, // Hide grid lines on mobile for cleaner look
        },
      },
      y: {
        ticks: {
          font: {
            size: isMobile ? 10 : 11,
          },
        },
        grid: {
          display: true, // Always show y-axis grid for reference
        },
      },
    },
    elements: {
      point: {
        radius: isMobile ? 2 : 3,
        hoverRadius: isMobile ? 4 : 5,
        hitRadius: isMobile ? 10 : 5, // Larger hit area on mobile for touch
      },
      line: {
        borderWidth: isMobile ? 2 : 2,
        tension: 0.1,
      },
    },
  };
}

/**
 * Merge responsive options with custom chart options
 */
export function mergeChartOptions(
  customOptions: Partial<ChartOptions<any>>,
  isMobile: boolean
): ChartOptions<any> {
  const responsiveOptions = getResponsiveChartOptions(isMobile);

  return {
    ...responsiveOptions,
    ...customOptions,
    plugins: {
      ...responsiveOptions.plugins,
      ...(customOptions.plugins || {}),
      legend: {
        ...responsiveOptions.plugins?.legend,
        ...(customOptions.plugins?.legend || {}),
      },
      title: {
        ...responsiveOptions.plugins?.title,
        ...(customOptions.plugins?.title || {}),
      },
      tooltip: {
        ...responsiveOptions.plugins?.tooltip,
        ...(customOptions.plugins?.tooltip || {}),
      },
    },
    scales: {
      ...responsiveOptions.scales,
      ...(customOptions.scales || {}),
      x: {
        ...responsiveOptions.scales?.x,
        ...(customOptions.scales?.x || {}),
      },
      y: {
        ...responsiveOptions.scales?.y,
        ...(customOptions.scales?.y || {}),
      },
    },
  };
}
