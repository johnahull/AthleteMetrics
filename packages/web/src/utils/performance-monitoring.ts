/**
 * Client-side performance monitoring utility
 * Tracks page load times, bundle sizes, and user interactions
 */

import React from 'react';

interface PerformanceMetrics {
  pageLoadTime: number;
  domContentLoaded: number;
  firstContentfulPaint?: number;
  largestContentfulPaint?: number;
  cumulativeLayoutShift?: number;
  firstInputDelay?: number;
  bundleSize?: number;
  memoryUsage?: number;
}

interface UserInteraction {
  type: string;
  timestamp: number;
  element?: string;
  duration?: number;
}

class PerformanceMonitor {
  private metrics: PerformanceMetrics;
  private interactions: UserInteraction[] = [];
  private isEnabled: boolean;

  constructor() {
    this.isEnabled = process.env.NODE_ENV === 'development';
    this.metrics = {
      pageLoadTime: 0,
      domContentLoaded: 0,
    };

    if (this.isEnabled) {
      this.initializeMonitoring();
    }
  }

  private initializeMonitoring() {
    // Monitor page load performance
    window.addEventListener('load', () => {
      this.collectPageLoadMetrics();
    });

    // Monitor DOM content loaded
    if (document.readyState === 'loading') {
      document.addEventListener('DOMContentLoaded', () => {
        this.metrics.domContentLoaded = performance.now();
      });
    } else {
      this.metrics.domContentLoaded = performance.now();
    }

    // Monitor Web Vitals
    this.observeWebVitals();

    // Monitor user interactions
    this.observeUserInteractions();

    // Monitor memory usage periodically
    setInterval(() => {
      this.collectMemoryMetrics();
    }, 30000); // Every 30 seconds

    // Log performance summary after initial load
    setTimeout(() => {
      this.logPerformanceSummary();
    }, 5000);
  }

  private collectPageLoadMetrics() {
    const navigation = performance.getEntriesByType('navigation')[0] as PerformanceNavigationTiming;

    this.metrics.pageLoadTime = navigation.loadEventEnd - navigation.fetchStart;
    this.metrics.domContentLoaded = navigation.domContentLoadedEventEnd - navigation.fetchStart;

    // Log slow page loads
    if (this.metrics.pageLoadTime > 3000) {
      console.warn(`🐌 Slow page load detected: ${this.metrics.pageLoadTime.toFixed(0)}ms`);
    }
  }

  private observeWebVitals() {
    // First Contentful Paint
    const paintObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name === 'first-contentful-paint') {
          this.metrics.firstContentfulPaint = entry.startTime;
        }
      }
    });
    paintObserver.observe({ entryTypes: ['paint'] });

    // Largest Contentful Paint
    const lcpObserver = new PerformanceObserver((list) => {
      const entries = list.getEntries();
      const lastEntry = entries[entries.length - 1];
      this.metrics.largestContentfulPaint = lastEntry.startTime;
    });
    lcpObserver.observe({ entryTypes: ['largest-contentful-paint'] });

    // Cumulative Layout Shift
    let clsValue = 0;
    const clsObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (!(entry as any).hadRecentInput) {
          clsValue += (entry as any).value;
        }
      }
      this.metrics.cumulativeLayoutShift = clsValue;
    });
    clsObserver.observe({ entryTypes: ['layout-shift'] });

    // First Input Delay
    const fidObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        this.metrics.firstInputDelay = (entry as any).processingStart - entry.startTime;
      }
    });
    fidObserver.observe({ entryTypes: ['first-input'] });
  }

  private observeUserInteractions() {
    // Track button clicks
    document.addEventListener('click', (event) => {
      const target = event.target as HTMLElement;
      if (target.tagName === 'BUTTON' || target.closest('button')) {
        this.trackInteraction('click', target.textContent || target.className);
      }
    });

    // Track route changes (for SPAs)
    let currentPath = window.location.pathname;
    const originalPushState = history.pushState;
    history.pushState = (...args) => {
      const newPath = args[2] as string;
      if (newPath !== currentPath) {
        this.trackInteraction('navigation', `${currentPath} -> ${newPath}`);
        currentPath = newPath;
      }
      originalPushState.apply(history, args);
    };
  }

  private collectMemoryMetrics() {
    if ('memory' in performance) {
      const memory = (performance as any).memory;
      this.metrics.memoryUsage = memory.usedJSHeapSize;

      // Warn about high memory usage
      const memoryInMB = memory.usedJSHeapSize / (1024 * 1024);
      if (memoryInMB > 150) {
        console.warn(`🚨 High memory usage: ${memoryInMB.toFixed(1)}MB`);
      }
    }
  }

  private trackInteraction(type: string, element?: string) {
    this.interactions.push({
      type,
      timestamp: performance.now(),
      element,
    });

    // Keep only recent interactions
    if (this.interactions.length > 100) {
      this.interactions = this.interactions.slice(-50);
    }
  }

  private logPerformanceSummary() {
    if (!this.isEnabled) return;

    console.group('📊 Performance Summary');
    console.log(`Page Load: ${this.metrics.pageLoadTime.toFixed(0)}ms`);
    console.log(`DOM Content Loaded: ${this.metrics.domContentLoaded.toFixed(0)}ms`);

    if (this.metrics.firstContentfulPaint) {
      console.log(`First Contentful Paint: ${this.metrics.firstContentfulPaint.toFixed(0)}ms`);
    }

    if (this.metrics.largestContentfulPaint) {
      console.log(`Largest Contentful Paint: ${this.metrics.largestContentfulPaint.toFixed(0)}ms`);
    }

    if (this.metrics.cumulativeLayoutShift !== undefined) {
      console.log(`Cumulative Layout Shift: ${this.metrics.cumulativeLayoutShift.toFixed(3)}`);
    }

    if (this.metrics.memoryUsage) {
      console.log(`Memory Usage: ${(this.metrics.memoryUsage / (1024 * 1024)).toFixed(1)}MB`);
    }

    // Check for performance issues
    this.checkPerformanceIssues();

    console.groupEnd();
  }

  private checkPerformanceIssues() {
    const issues: string[] = [];

    if (this.metrics.pageLoadTime > 3000) {
      issues.push(`Slow page load (${this.metrics.pageLoadTime.toFixed(0)}ms)`);
    }

    if (this.metrics.firstContentfulPaint && this.metrics.firstContentfulPaint > 2500) {
      issues.push(`Slow FCP (${this.metrics.firstContentfulPaint.toFixed(0)}ms)`);
    }

    if (this.metrics.largestContentfulPaint && this.metrics.largestContentfulPaint > 4000) {
      issues.push(`Slow LCP (${this.metrics.largestContentfulPaint.toFixed(0)}ms)`);
    }

    if (this.metrics.cumulativeLayoutShift && this.metrics.cumulativeLayoutShift > 0.25) {
      issues.push(`High CLS (${this.metrics.cumulativeLayoutShift.toFixed(3)})`);
    }

    if (this.metrics.firstInputDelay && this.metrics.firstInputDelay > 100) {
      issues.push(`High FID (${this.metrics.firstInputDelay.toFixed(0)}ms)`);
    }

    if (issues.length > 0) {
      console.warn('⚠️ Performance Issues Detected:');
      issues.forEach(issue => console.warn(`  - ${issue}`));
    }
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): PerformanceMetrics {
    return { ...this.metrics };
  }

  /**
   * Get recent user interactions
   */
  getInteractions(): UserInteraction[] {
    return [...this.interactions];
  }

  /**
   * Track a custom performance event
   */
  trackCustomEvent(name: string, duration?: number) {
    if (!this.isEnabled) return;

    console.log(`⏱️ ${name}: ${duration ? `${duration.toFixed(2)}ms` : 'started'}`);

    this.trackInteraction('custom', name);
  }

  /**
   * Start timing a custom operation
   */
  startTiming(name: string): () => void {
    if (!this.isEnabled) return () => {};

    const startTime = performance.now();

    return () => {
      const duration = performance.now() - startTime;
      this.trackCustomEvent(name, duration);
    };
  }

  /**
   * Monitor chunk loading performance
   */
  monitorChunkLoading() {
    if (!this.isEnabled) return;

    const resourceObserver = new PerformanceObserver((list) => {
      for (const entry of list.getEntries()) {
        if (entry.name.includes('chunk') || entry.name.includes('.js')) {
          const resourceEntry = entry as PerformanceResourceTiming;
          const loadTime = resourceEntry.responseEnd - resourceEntry.startTime;
          if (loadTime > 1000) {
            console.warn(`🐌 Slow chunk load: ${entry.name} (${loadTime.toFixed(0)}ms)`);
          }
        }
      }
    });
    resourceObserver.observe({ entryTypes: ['resource'] });
  }
}

// Singleton instance
export const performanceMonitor = new PerformanceMonitor();

// Export React hook for component performance tracking
export function usePerformanceTracking(componentName: string) {
  if (process.env.NODE_ENV === 'development') {
    React.useEffect(() => {
      const endTiming = performanceMonitor.startTiming(`${componentName} render`);
      return endTiming;
    }, [componentName]);
  }

  return {
    trackEvent: (eventName: string) => {
      performanceMonitor.trackCustomEvent(`${componentName}: ${eventName}`);
    },
    startTiming: (operationName: string) => {
      return performanceMonitor.startTiming(`${componentName}: ${operationName}`);
    },
  };
}

export default performanceMonitor;