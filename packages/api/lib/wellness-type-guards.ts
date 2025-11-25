/**
 * Type Guards for Wellness Feature
 * Ensures runtime type safety for wellness templates and configurations
 */

import type { WellnessTemplate, WellnessTemplateConfig } from '@shared/wellness-types';

/**
 * Checks if a value is a valid wellness template config
 * @param config - Configuration to validate
 * @returns True if config is valid WellnessTemplateConfig
 */
export function isWellnessTemplateConfig(config: unknown): config is WellnessTemplateConfig {
  if (!config || typeof config !== 'object') {
    return false;
  }

  const c = config as any;

  // Check if it has questions array
  if (!Array.isArray(c.questions)) {
    return false;
  }

  // Check if it has statusConfig (optional but common)
  if (c.statusConfig !== undefined && c.statusConfig !== null) {
    const sc = c.statusConfig;
    if (typeof sc !== 'object') {
      return false;
    }

    // Validate statusConfig properties if present
    if (
      sc.scaleOrientation &&
      !['higher_is_better', 'lower_is_better'].includes(sc.scaleOrientation)
    ) {
      return false;
    }

    if (sc.redThreshold !== undefined && typeof sc.redThreshold !== 'number') {
      return false;
    }

    if (sc.yellowThreshold !== undefined && typeof sc.yellowThreshold !== 'number') {
      return false;
    }
  }

  return true;
}

/**
 * Checks if a wellness template has a valid status configuration
 * @param template - Wellness template to check
 * @returns True if template has valid statusConfig
 */
export function hasValidStatusConfig(template: WellnessTemplate): boolean {
  if (!isWellnessTemplateConfig(template.config)) {
    return false;
  }

  const config = template.config as WellnessTemplateConfig;
  return (
    config.statusConfig !== undefined &&
    config.statusConfig !== null &&
    typeof config.statusConfig === 'object' &&
    typeof config.statusConfig.redThreshold === 'number' &&
    typeof config.statusConfig.yellowThreshold === 'number' &&
    ['higher_is_better', 'lower_is_better'].includes(config.statusConfig.scaleOrientation || 'higher_is_better')
  );
}

/**
 * Safely gets the status config from a template
 * @param template - Wellness template
 * @returns Status config or null if invalid
 */
export function getStatusConfig(template: WellnessTemplate): {
  scaleOrientation: 'higher_is_better' | 'lower_is_better';
  redThreshold: number;
  yellowThreshold: number;
  calculationMethod?: 'average' | 'sum';
} | null {
  if (!hasValidStatusConfig(template)) {
    console.error(`Template ${template.id} has invalid status config`);
    return null;
  }

  const config = template.config as WellnessTemplateConfig;
  return {
    scaleOrientation: config.statusConfig!.scaleOrientation || 'higher_is_better',
    redThreshold: config.statusConfig!.redThreshold,
    yellowThreshold: config.statusConfig!.yellowThreshold,
    calculationMethod: config.statusConfig!.calculationMethod,
  };
}

/**
 * Safely casts a template to have a valid config
 * Logs error and returns null if config is invalid
 * @param template - Template to validate and cast (accepts database schema type with nullable fields)
 * @returns Validated template or null
 */
export function validateTemplate(template: any): WellnessTemplate | null {
  if (!template || !template.id) {
    console.error(`Invalid template: missing id`);
    return null;
  }

  if (!isWellnessTemplateConfig(template.config)) {
    console.error(`Invalid template config for template ${template.id}`, template.config);
    return null;
  }

  // Cast to WellnessTemplate (handles organizationId being null for system templates)
  return template as WellnessTemplate;
}
