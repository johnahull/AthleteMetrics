/**
 * Centralized Chart.js component registration
 *
 * This file registers all Chart.js components once at the application level,
 * eliminating the need for individual chart components to register them.
 *
 * Import this file once in App.tsx to ensure all charts work correctly.
 */

import {
  Chart as ChartJS,
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  TimeScale,
  PointElement,
  LineElement,
  BarElement,
  Title,
  Tooltip,
  Legend,
  Filler,
  ScatterController,
  LineController,
} from 'chart.js';

import zoomPlugin from 'chartjs-plugin-zoom';
import annotationPlugin from 'chartjs-plugin-annotation';
// Date adapter for TimeScale: parses ISO date strings and formats tick labels.
import 'chartjs-adapter-date-fns';

// Register all Chart.js components used across the application
ChartJS.register(
  // Scales
  CategoryScale,
  LinearScale,
  RadialLinearScale,
  TimeScale,

  // Elements
  PointElement,
  LineElement,
  BarElement,

  // Plugins
  Title,
  Tooltip,
  Legend,
  Filler,

  // Controllers
  ScatterController,
  LineController,

  // Third-party plugins
  zoomPlugin,
  annotationPlugin
);

// Export for convenience (though registration is automatic when imported)
export { ChartJS };
