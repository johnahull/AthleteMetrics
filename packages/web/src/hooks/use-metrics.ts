import { useAvailableMetrics, type AvailableMetric } from './use-available-metrics';

export interface Metric {
  code: string;
  name: string;
  unit?: string;
  lowerIsBetter?: boolean;
  category?: string;
  description?: string;
}

/**
 * Wrapper around useAvailableMetrics to provide a simplified interface
 * for components that need metrics for filtering/selection
 */
export function useMetrics() {
  const { metrics: availableMetrics, isLoading, error } = useAvailableMetrics();

  // Transform to match expected interface
  const metrics: Metric[] = availableMetrics.map((m) => ({
    code: m.code,
    name: m.label,
    unit: m.unit,
    lowerIsBetter: m.lowerIsBetter,
    category: m.category,
    description: m.description,
  }));

  return {
    data: metrics,
    isLoading,
    error,
  };
}
