/**
 * Paired-input metric computation.
 *
 * Some metrics capture an event with two inputs — e.g. a weighted rep set
 * (load + reps) where the stored value is a derived estimate (1RM).
 * This module is a pure function: given a metric's auxiliary-input config and
 * the raw inputs, it validates and evaluates the formula. The measurement
 * service calls this just before persisting the row.
 */

import { evaluateFormula } from './formula-service';

export interface AuxiliaryInputConfig {
  label: string;
  unit: string;
  validationMin?: number;
  validationMax?: number;
  required: boolean;
  /**
   * Math.js expression evaluated against `{ load, reps }`.
   * Variable names MUST be exactly `load` (primary input) and `reps`
   * (auxiliary input). Org-custom formulas must use these same names or
   * `evaluateFormula` will return null and computation will fail.
   */
  computeFormula: string;
  primaryInputLabel: string;
  primaryInputUnit: string;
}

export interface PairedInputComputeResult {
  value: number;
  units: string;
  calculationMetadata?: {
    formula: string;
    sourceValues: Record<string, number>;
    calculatedAt: string;
    parentMetric: string;
  };
}

export class PairedInputValidationError extends Error {
  readonly field: 'primaryValue' | 'auxiliaryValue' | 'formula';

  constructor(field: PairedInputValidationError['field'], message: string) {
    super(message);
    this.name = 'PairedInputValidationError';
    this.field = field;
  }
}

export function computePairedInputMeasurement(
  config: AuxiliaryInputConfig,
  metricCode: string,
  primaryValue: number | null,
  auxiliaryValue: number | null
): PairedInputComputeResult {
  if (primaryValue === null || primaryValue <= 0) {
    throw new PairedInputValidationError(
      'primaryValue',
      `${config.primaryInputLabel} is required and must be positive`
    );
  }

  if (auxiliaryValue === null || auxiliaryValue === undefined) {
    if (config.required) {
      throw new PairedInputValidationError(
        'auxiliaryValue',
        `${config.label} is required for ${metricCode}`
      );
    }
    return { value: primaryValue, units: config.primaryInputUnit };
  }

  if (config.validationMin !== undefined && auxiliaryValue < config.validationMin) {
    throw new PairedInputValidationError(
      'auxiliaryValue',
      `${config.label} must be at least ${config.validationMin}`
    );
  }

  if (config.validationMax !== undefined && auxiliaryValue > config.validationMax) {
    throw new PairedInputValidationError(
      'auxiliaryValue',
      `${config.label} must be at most ${config.validationMax}`
    );
  }

  // Reps are integer-valued by convention. If the metric measures reps,
  // reject decimals (e.g., "2.5 reps" is meaningless). Other auxiliary
  // shapes (time, distance, RPE) may legitimately be decimal, so the
  // restriction is opt-in via the unit string.
  if (config.unit === 'reps' && !Number.isInteger(auxiliaryValue)) {
    throw new PairedInputValidationError(
      'auxiliaryValue',
      `${config.label} must be a whole number`
    );
  }

  const computed = evaluateFormula(config.computeFormula, {
    load: primaryValue,
    reps: auxiliaryValue,
  });

  if (computed === null) {
    throw new PairedInputValidationError(
      'formula',
      `Formula "${config.computeFormula}" failed to evaluate for ${metricCode}`
    );
  }

  return {
    value: computed,
    units: config.primaryInputUnit,
    calculationMetadata: {
      formula: config.computeFormula,
      sourceValues: { load: primaryValue, reps: auxiliaryValue },
      calculatedAt: new Date().toISOString(),
      parentMetric: metricCode,
    },
  };
}
