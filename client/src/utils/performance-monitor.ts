/**
 * Performance monitoring utility for tracking React component performance
 * and potential memory leaks in development environment
 */

import React from 'react';

interface PerformanceMetric {
  name: string;
  startTime: number;
  endTime?: number;
  duration?: number;
  memoryUsage?: {
    used: number;
    total: number;
  };
}

class PerformanceMonitor {
  private metrics: Map<string, PerformanceMetric> = new Map();
  private componentRenderCounts: Map<string, number> = new Map();
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = process.env.NODE_ENV === 'development';
  }

  /**
   * Start timing a performance metric
   */
  startTiming(name: string): void {
    if (!this.isEnabled) return;

    const metric: PerformanceMetric = {
      name,
      startTime: performance.now(),
      memoryUsage: this.getMemoryUsage(),
    };

    this.metrics.set(name, metric);
  }

  /**
   * End timing a performance metric
   */
  endTiming(name: string): void {
    if (!this.isEnabled) return;

    const metric = this.metrics.get(name);
    if (!metric) {
      console.warn(`Performance metric '${name}' was not started`);
      return;
    }

    metric.endTime = performance.now();
    metric.duration = metric.endTime - metric.startTime;

    // Log slow operations (> 100ms)
    if (metric.duration > 100) {
      console.warn(`Slow operation detected: ${name} took ${metric.duration.toFixed(2)}ms`);
    }

    // Optionally log all metrics in development
    if (process.env.NODE_ENV === 'development' && metric.duration > 10) {
      console.log(`📊 ${name}: ${metric.duration.toFixed(2)}ms`);
    }
  }

  /**
   * Track component renders for detecting unnecessary re-renders
   */
  trackComponentRender(componentName: string): void {
    if (!this.isEnabled) return;

    const currentCount = this.componentRenderCounts.get(componentName) || 0;
    const newCount = currentCount + 1;
    this.componentRenderCounts.set(componentName, newCount);

    // Warn about excessive re-renders
    if (newCount > 50) {
      console.warn(`⚠️ Component '${componentName}' has rendered ${newCount} times. Check for unnecessary re-renders.`);
    }
  }

  /**
   * Get current memory usage (if available)
   */
  private getMemoryUsage() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      return {
        used: memory.usedJSHeapSize,
        total: memory.totalJSHeapSize,
      };
    }
    return undefined;
  }

  /**
   * Check for potential memory leaks
   */
  checkMemoryUsage(): void {
    if (!this.isEnabled) return;

    const memoryUsage = this.getMemoryUsage();
    if (!memoryUsage) return;

    const memoryUsageInMB = memoryUsage.used / (1024 * 1024);

    if (memoryUsageInMB > 100) {
      console.warn(`🚨 High memory usage detected: ${memoryUsageInMB.toFixed(2)}MB`);
    }
  }

  /**
   * Get performance summary for debugging
   */
  getSummary(): {
    metrics: PerformanceMetric[];
    renderCounts: Record<string, number>;
    memoryUsage?: { used: number; total: number };
  } {
    return {
      metrics: Array.from(this.metrics.values()),
      renderCounts: Object.fromEntries(this.componentRenderCounts),
      memoryUsage: this.getMemoryUsage(),
    };
  }

  /**
   * Clear all metrics (useful for testing)
   */
  clear(): void {
    this.metrics.clear();
    this.componentRenderCounts.clear();
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

/**
 * React hook for monitoring component performance
 */
export function usePerformanceMonitor(componentName: string) {
  if (process.env.NODE_ENV === 'development') {
    performanceMonitor.trackComponentRender(componentName);
  }

  return {
    startTiming: (operation: string) => {
      performanceMonitor.startTiming(`${componentName}.${operation}`);
    },
    endTiming: (operation: string) => {
      performanceMonitor.endTiming(`${componentName}.${operation}`);
    },
  };
}

/**
 * Higher-order component for automatic performance monitoring
 */
export function withPerformanceMonitoring<P extends object>(
  WrappedComponent: React.ComponentType<P>,
  componentName?: string
) {
  const displayName = componentName || WrappedComponent.displayName || WrappedComponent.name || 'Component';

  const MonitoredComponent = (props: P) => {
    const monitor = usePerformanceMonitor(displayName);

    React.useEffect(() => {
      monitor.startTiming('mount');
      return () => {
        monitor.endTiming('mount');
      };
    }, []);

    return React.createElement(WrappedComponent, props);
  };

  MonitoredComponent.displayName = `withPerformanceMonitoring(${displayName})`;
  return MonitoredComponent;
}

/**
 * Decorator for timing async operations
 */
export function timedOperation<T extends any[], R>(
  operationName: string,
  fn: (...args: T) => Promise<R>
): (...args: T) => Promise<R> {
  return async (...args: T): Promise<R> => {
    performanceMonitor.startTiming(operationName);
    try {
      const result = await fn(...args);
      return result;
    } finally {
      performanceMonitor.endTiming(operationName);
    }
  };
}

// Set up periodic memory monitoring in development
if (process.env.NODE_ENV === 'development') {
  setInterval(() => {
    performanceMonitor.checkMemoryUsage();
  }, 30000); // Check every 30 seconds
}

export default performanceMonitor;