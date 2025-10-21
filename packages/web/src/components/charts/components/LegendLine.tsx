/**
 * Reusable Legend Line Component
 *
 * Renders an SVG line with customizable stroke properties for chart legends.
 * Used across multiple chart components to maintain consistent legend styling.
 */

import React from 'react';

interface LegendLineProps {
  /** Color of the line */
  color: string;
  /** Width of the SVG container */
  width?: number;
  /** Height of the SVG container */
  height?: number;
  /** Stroke width of the line */
  strokeWidth?: number;
  /** Dash pattern for the line (empty array for solid line) */
  dashPattern?: number[];
  /** Opacity of the line */
  opacity?: number;
  /** Additional CSS classes */
  className?: string;
}

export const LegendLine = React.memo(function LegendLine({
  color,
  width = 32,
  height = 8,
  strokeWidth = 2,
  dashPattern = [],
  opacity = 1,
  className = ''
}: LegendLineProps) {
  const dashArray = dashPattern.length > 0 ? dashPattern.join(',') : '0';
  const centerY = height / 2;

  return (
    <svg
      width={width}
      height={height}
      className={`flex-shrink-0 ${className}`}
      aria-hidden="true"
    >
      <line
        x1="0"
        y1={centerY}
        x2={width}
        y2={centerY}
        stroke={color}
        strokeWidth={strokeWidth}
        strokeDasharray={dashArray}
        opacity={opacity}
      />
    </svg>
  );
});

export default LegendLine;