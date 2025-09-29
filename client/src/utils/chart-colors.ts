/**
 * Shared chart color constants for consistent styling across all chart components
 */

/**
 * Validate if a color string is safe for CSS injection
 * Only allows hex colors and rgb/rgba formats
 * @param color - Color string to validate
 * @returns true if color is safe, false otherwise
 */
export function isValidColor(color: string): boolean {
  if (!color || typeof color !== 'string') return false;

  // Allow hex colors: #RGB, #RRGGBB, #RRGGBBAA
  const hexPattern = /^#([0-9A-Fa-f]{3}|[0-9A-Fa-f]{6}|[0-9A-Fa-f]{8})$/;
  if (hexPattern.test(color)) return true;

  // Allow rgb/rgba colors: rgb(r,g,b) or rgba(r,g,b,a)
  const rgbPattern = /^rgba?\(\s*\d+\s*,\s*\d+\s*,\s*\d+\s*(,\s*[\d.]+\s*)?\)$/;
  if (rgbPattern.test(color)) return true;

  return false;
}

/**
 * Sanitize color value for safe CSS usage
 * Returns validated color or fallback
 * @param color - Color string to sanitize
 * @param fallback - Fallback color if validation fails
 * @returns Safe color string
 */
export function sanitizeColor(color: string, fallback: string = '#3B82F6'): string {
  return isValidColor(color) ? color : fallback;
}

export const CHART_COLORS = [
  'rgba(59, 130, 246, 1)',    // Blue
  'rgba(16, 185, 129, 1)',    // Green
  'rgba(239, 68, 68, 1)',     // Red
  'rgba(245, 158, 11, 1)',    // Amber
  'rgba(139, 92, 246, 1)',    // Purple
  'rgba(236, 72, 153, 1)',    // Pink
  'rgba(20, 184, 166, 1)',    // Teal
  'rgba(251, 113, 133, 1)',   // Rose
  'rgba(168, 85, 247, 1)',    // Violet
  'rgba(34, 197, 94, 1)',     // Emerald
  'rgba(6, 182, 212, 1)',     // Cyan
  'rgba(249, 115, 22, 1)',    // Orange
] as const;

/**
 * Hex color palette for group visualization (12 colors)
 */
export const GROUP_COLOR_PALETTE = [
  '#3B82F6', // Blue
  '#10B981', // Green
  '#F59E0B', // Amber
  '#EF4444', // Red
  '#8B5CF6', // Purple
  '#EC4899', // Pink
  '#06B6D4', // Cyan
  '#F97316', // Orange
  '#6366F1', // Indigo
  '#14B8A6', // Teal
  '#A855F7', // Violet
  '#F43F5E', // Rose
] as const;

export const CHART_BACKGROUND_COLORS = CHART_COLORS.map(color =>
  color.replace('1)', '0.6)')
);

export const CHART_HIGHLIGHT_COLORS = CHART_COLORS.map(color =>
  color.replace('1)', '0.8)')
);

/**
 * Get a color by index, cycling through available colors
 */
export const getChartColor = (index: number): string => {
  return CHART_COLORS[index % CHART_COLORS.length];
};

/**
 * Get a background color by index, cycling through available colors
 */
export const getChartBackgroundColor = (index: number): string => {
  return CHART_BACKGROUND_COLORS[index % CHART_BACKGROUND_COLORS.length];
};

/**
 * Get a highlight color by index, cycling through available colors
 */
export const getChartHighlightColor = (index: number): string => {
  return CHART_HIGHLIGHT_COLORS[index % CHART_HIGHLIGHT_COLORS.length];
};

/**
 * Get group color by index with unlimited color generation
 * For indices beyond the palette, generates HSL colors using golden angle distribution
 *
 * @param index - Zero-based group index
 * @returns Hex color code
 *
 * @example
 * ```ts
 * const color1 = getGroupColor(0); // '#3B82F6' (blue)
 * const color15 = getGroupColor(15); // Generated HSL color
 * ```
 */
export function getGroupColor(index: number): string {
  // Use predefined colors for first 12 groups
  if (index < GROUP_COLOR_PALETTE.length) {
    return GROUP_COLOR_PALETTE[index];
  }

  // Generate colors using HSL for groups beyond palette
  // Use golden angle for even hue distribution
  const hue = (index * 137.5) % 360;
  const saturation = 65 + (index % 3) * 10; // 65-85%
  const lightness = 50 + (index % 2) * 5; // 50-55%

  return hslToHex(hue, saturation, lightness);
}

/**
 * Convert HSL color values to hex color code
 * @param h - Hue (0-360)
 * @param s - Saturation (0-100)
 * @param l - Lightness (0-100)
 * @returns Hex color code
 */
function hslToHex(h: number, s: number, l: number): string {
  const sNorm = s / 100;
  const lNorm = l / 100;

  const c = (1 - Math.abs(2 * lNorm - 1)) * sNorm;
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1));
  const m = lNorm - c / 2;

  let r = 0, g = 0, b = 0;

  if (h >= 0 && h < 60) {
    r = c; g = x; b = 0;
  } else if (h >= 60 && h < 120) {
    r = x; g = c; b = 0;
  } else if (h >= 120 && h < 180) {
    r = 0; g = c; b = x;
  } else if (h >= 180 && h < 240) {
    r = 0; g = x; b = c;
  } else if (h >= 240 && h < 300) {
    r = x; g = 0; b = c;
  } else if (h >= 300 && h < 360) {
    r = c; g = 0; b = x;
  }

  const rHex = Math.round((r + m) * 255).toString(16).padStart(2, '0');
  const gHex = Math.round((g + m) * 255).toString(16).padStart(2, '0');
  const bHex = Math.round((b + m) * 255).toString(16).padStart(2, '0');

  return `#${rHex}${gHex}${bHex}`;
}