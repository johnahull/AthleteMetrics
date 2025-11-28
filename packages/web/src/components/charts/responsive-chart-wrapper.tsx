import * as React from 'react';
import { cn } from '@/lib/utils';
import { useIsMobile } from '@/hooks/use-mobile';

interface ResponsiveChartWrapperProps {
  children: React.ReactNode;
  className?: string;
  /**
   * Mobile height in pixels (default: 300)
   */
  mobileHeight?: number;
  /**
   * Desktop height in pixels (default: 400)
   */
  desktopHeight?: number;
}

/**
 * Responsive wrapper for Chart.js charts
 * - Adjusts height based on viewport
 * - Allows horizontal scrolling on mobile if needed
 * - Maintains proper aspect ratios
 * - Memoized to prevent unnecessary re-renders
 */
export const ResponsiveChartWrapper = React.memo(function ResponsiveChartWrapper({
  children,
  className,
  mobileHeight = 300,
  desktopHeight = 400
}: ResponsiveChartWrapperProps) {
  const isMobile = useIsMobile();
  const height = isMobile ? mobileHeight : desktopHeight;

  return (
    <div
      data-testid="chart-wrapper"
      className={cn(
        "w-full overflow-x-auto",
        className
      )}
      style={{ height: `${height}px` }}
    >
      <div className="min-w-full h-full">
        {children}
      </div>
    </div>
  );
});
