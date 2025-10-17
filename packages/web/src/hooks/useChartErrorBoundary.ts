import { useCallback, useState } from 'react';

/**
 * Hook for managing chart error boundary state and retry functionality
 */
export function useChartErrorBoundary() {
  const [retryKey, setRetryKey] = useState(0);

  const retry = useCallback(() => {
    // Force component re-render by updating key
    setRetryKey(prev => prev + 1);
  }, []);

  return {
    retryKey,
    retry
  };
}

export default useChartErrorBoundary;