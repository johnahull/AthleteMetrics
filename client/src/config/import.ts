/**
 * Configuration constants for CSV import functionality
 */

export const IMPORT_CONFIG = {
  /**
   * Maximum number of rows to display in preview table
   * Limits rendering for performance with large datasets
   */
  MAX_DISPLAYED_ROWS: 100,

  /**
   * Threshold to show performance warning to users
   */
  PERFORMANCE_WARNING_THRESHOLD: 100,
} as const;
