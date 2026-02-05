/**
 * Color utility functions for Chart.js and other color manipulation needs.
 *
 * This module provides helpers for parsing and converting colors between
 * different formats (hex, rgb, rgba, named colors) commonly used in
 * Chart.js annotations and styling.
 */

/**
 * Named CSS colors mapped to RGB values.
 * Includes common colors used in benchmark annotations and chart styling.
 */
const NAMED_COLORS: Record<string, [number, number, number]> = {
  red: [255, 0, 0],
  green: [0, 128, 0],
  blue: [0, 0, 255],
  yellow: [255, 255, 0],
  orange: [255, 165, 0],
  purple: [128, 0, 128],
  pink: [255, 192, 203],
  black: [0, 0, 0],
  white: [255, 255, 255],
  gray: [128, 128, 128],
  grey: [128, 128, 128],
  gold: [255, 215, 0],
  silver: [192, 192, 192],
  bronze: [205, 127, 50],
  cyan: [0, 255, 255],
  magenta: [255, 0, 255],
};

/**
 * Parse any CSS color format to rgba with a specified opacity.
 *
 * Supports:
 * - Named colors (red, blue, gold, etc.)
 * - Hex colors (#fff, #ffffff)
 * - RGB/RGBA strings (rgb(255, 0, 0), rgba(255, 0, 0, 0.5))
 *
 * @param color - The color string to parse
 * @param opacity - The desired opacity (0-1, will be clamped to valid range)
 * @returns An rgba() string with the specified opacity
 *
 * @example
 * parseColorToRgba('#ff0000', 0.5) // 'rgba(255, 0, 0, 0.5)'
 * parseColorToRgba('gold', 0.15)   // 'rgba(255, 215, 0, 0.15)'
 * parseColorToRgba('rgb(0, 128, 0)', 0.8) // 'rgba(0, 128, 0, 0.8)'
 */
export function parseColorToRgba(color: string, opacity: number): string {
  // Clamp opacity to valid CSS range [0, 1]
  const validOpacity = Math.max(0, Math.min(1, opacity));
  // Try rgba/rgb match
  const rgbaMatch = color.match(/rgba?\((\d+),\s*(\d+),\s*(\d+)(?:,\s*[\d.]+)?\)/);
  if (rgbaMatch) {
    return `rgba(${rgbaMatch[1]}, ${rgbaMatch[2]}, ${rgbaMatch[3]}, ${validOpacity})`;
  }

  // Try hex match (supports both 3 and 6 character hex)
  const hexMatch = color.match(/^#([A-Fa-f0-9]{6}|[A-Fa-f0-9]{3})$/);
  if (hexMatch) {
    const hex = hexMatch[1];
    const r = parseInt(hex.length === 3 ? hex[0] + hex[0] : hex.slice(0, 2), 16);
    const g = parseInt(hex.length === 3 ? hex[1] + hex[1] : hex.slice(2, 4), 16);
    const b = parseInt(hex.length === 3 ? hex[2] + hex[2] : hex.slice(4, 6), 16);
    return `rgba(${r}, ${g}, ${b}, ${validOpacity})`;
  }

  // Try named color
  const lowerColor = color.toLowerCase();
  if (NAMED_COLORS[lowerColor]) {
    const [r, g, b] = NAMED_COLORS[lowerColor];
    return `rgba(${r}, ${g}, ${b}, ${validOpacity})`;
  }

  // Default fallback - Chart.js default pink color
  return `rgba(255, 99, 132, ${validOpacity})`;
}
