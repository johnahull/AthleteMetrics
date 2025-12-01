/**
 * Metric icon components for athlete dashboard
 */

import React from 'react';
import { Zap, TrendingUp, Timer, Activity } from 'lucide-react';

/**
 * Get the icon component for a metric
 */
export function getMetricIcon(metric: string) {
  switch (metric) {
    case 'FLY10_TIME':
      return <Zap className="h-5 w-5 text-blue-600" />;
    case 'VERTICAL_JUMP':
      return <TrendingUp className="h-5 w-5 text-green-600" />;
    case 'DASH_40YD':
      return <Timer className="h-5 w-5 text-purple-600" />;
    default:
      return <Activity className="h-5 w-5 text-gray-600" />;
  }
}
