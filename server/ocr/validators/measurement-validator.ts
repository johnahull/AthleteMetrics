import { ExtractedMeasurementData, OCRConfig } from '@shared/ocr-types';

export interface ValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
  normalizedValue?: number;
}

export class MeasurementValidator {
  constructor(private config: OCRConfig) {}

  validateMeasurement(data: ExtractedMeasurementData): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    let normalizedValue: number | undefined;

    // Validate required fields
    if (!data.firstName || data.firstName.trim().length < this.config.validation.nameMinLength) {
      errors.push(`First name too short (minimum ${this.config.validation.nameMinLength} characters)`);
    }

    if (!data.lastName || data.lastName.trim().length < this.config.validation.nameMinLength) {
      errors.push(`Last name too short (minimum ${this.config.validation.nameMinLength} characters)`);
    }

    if (!data.metric) {
      errors.push('Missing measurement metric');
    }

    if (!data.value) {
      errors.push('Missing measurement value');
    } else {
      // Validate and normalize the measurement value
      const valueValidation = this.validateValue(data.metric!, data.value);
      if (!valueValidation.isValid) {
        errors.push(...valueValidation.errors);
      }
      warnings.push(...valueValidation.warnings);
      normalizedValue = valueValidation.normalizedValue;
    }

    // Validate confidence level
    if (data.confidence < 30) {
      warnings.push('Very low confidence measurement - verify accuracy');
    } else if (data.confidence < 60) {
      warnings.push('Low confidence measurement - double-check if possible');
    }

    // Validate date if present
    if (data.date) {
      const dateValidation = this.validateDate(data.date);
      if (!dateValidation.isValid) {
        warnings.push(...dateValidation.errors);
      }
    }

    // Validate age if present
    if (data.age) {
      const ageValidation = this.validateAge(data.age);
      if (!ageValidation.isValid) {
        warnings.push(...ageValidation.errors);
      }
    }

    // Validate name format
    const nameValidation = this.validateName(data.firstName!, data.lastName!);
    warnings.push(...nameValidation.warnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      normalizedValue
    };
  }

  private validateValue(metric: string, value: string): ValidationResult {
    const errors: string[] = [];
    const warnings: string[] = [];
    
    // Parse numeric value
    const numericValue = parseFloat(value);
    if (isNaN(numericValue)) {
      return {
        isValid: false,
        errors: [`Invalid numeric value: "${value}"`],
        warnings: []
      };
    }

    if (numericValue <= 0) {
      return {
        isValid: false,
        errors: [`Value must be positive: ${numericValue}`],
        warnings: []
      };
    }

    // Check against configured ranges
    const range = this.config.validation.measurementRanges[metric];
    if (range) {
      if (numericValue < range.min) {
        errors.push(`Value too low for ${metric}: ${numericValue} (minimum: ${range.min})`);
      } else if (numericValue > range.max) {
        errors.push(`Value too high for ${metric}: ${numericValue} (maximum: ${range.max})`);
      }
      
      // Add warnings for values near the limits
      const rangeSpan = range.max - range.min;
      const lowThreshold = range.min + (rangeSpan * 0.1); // Bottom 10%
      const highThreshold = range.max - (rangeSpan * 0.1); // Top 10%
      
      if (numericValue <= lowThreshold) {
        warnings.push(`Unusually low value for ${metric}: ${numericValue}`);
      } else if (numericValue >= highThreshold) {
        warnings.push(`Unusually high value for ${metric}: ${numericValue}`);
      }
    }

    // Metric-specific validations
    const metricWarnings = this.getMetricSpecificWarnings(metric, numericValue);
    warnings.push(...metricWarnings);

    return {
      isValid: errors.length === 0,
      errors,
      warnings,
      normalizedValue: numericValue
    };
  }

  private validateDate(dateStr: string): ValidationResult {
    const errors: string[] = [];
    
    try {
      const date = new Date(dateStr);
      if (isNaN(date.getTime())) {
        errors.push(`Invalid date format: "${dateStr}"`);
      } else {
        // Check if date is in the future
        if (date > new Date()) {
          errors.push(`Date cannot be in the future: ${dateStr}`);
        }
        
        // Check if date is too old (more than 10 years ago)
        const tenYearsAgo = new Date();
        tenYearsAgo.setFullYear(tenYearsAgo.getFullYear() - 10);
        if (date < tenYearsAgo) {
          errors.push(`Date is too old: ${dateStr}`);
        }
      }
    } catch {
      errors.push(`Unable to parse date: "${dateStr}"`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  private validateAge(ageStr: string): ValidationResult {
    const errors: string[] = [];
    const age = parseInt(ageStr);
    
    if (isNaN(age)) {
      errors.push(`Invalid age: "${ageStr}"`);
    } else if (age < 8 || age > 40) {
      errors.push(`Age out of reasonable range: ${age} (expected 8-40)`);
    }

    return {
      isValid: errors.length === 0,
      errors,
      warnings: []
    };
  }

  private validateName(firstName: string, lastName: string): { warnings: string[] } {
    const warnings: string[] = [];
    
    // Check for common OCR errors in names
    const suspiciousChars = /[0-9!@#$%^&*()_+=\[\]{}|;:,.<>?]/;
    if (suspiciousChars.test(firstName)) {
      warnings.push(`First name contains suspicious characters: "${firstName}"`);
    }
    if (suspiciousChars.test(lastName)) {
      warnings.push(`Last name contains suspicious characters: "${lastName}"`);
    }

    // Check for very short names that might be OCR errors
    if (firstName.length === 1) {
      warnings.push(`Very short first name: "${firstName}" - verify accuracy`);
    }
    if (lastName.length === 1) {
      warnings.push(`Very short last name: "${lastName}" - verify accuracy`);
    }

    // Check for repeated characters (OCR artifacts)
    const repeatedChars = /(.)\1{3,}/;
    if (repeatedChars.test(firstName)) {
      warnings.push(`First name has repeated characters: "${firstName}"`);
    }
    if (repeatedChars.test(lastName)) {
      warnings.push(`Last name has repeated characters: "${lastName}"`);
    }

    return { warnings };
  }

  private getMetricSpecificWarnings(metric: string, value: number): string[] {
    const warnings: string[] = [];

    switch (metric) {
      case 'DASH_40YD':
        if (value < 4.0) {
          warnings.push('Exceptionally fast 40-yard dash time - verify accuracy');
        } else if (value > 6.0) {
          warnings.push('Slow 40-yard dash time - confirm measurement conditions');
        }
        break;

      case 'FLY10_TIME':
        if (value < 1.0) {
          warnings.push('Very fast 10-yard fly time - verify measurement setup');
        } else if (value > 2.5) {
          warnings.push('Slow 10-yard fly time - check measurement conditions');
        }
        break;

      case 'VERTICAL_JUMP':
        if (value < 15) {
          warnings.push('Low vertical jump - confirm measurement technique');
        } else if (value > 40) {
          warnings.push('Very high vertical jump - verify measurement accuracy');
        }
        break;

      case 'AGILITY_505':
      case 'AGILITY_5105':
        if (value < 2.0) {
          warnings.push('Very fast agility time - verify measurement setup');
        } else if (value > 3.5) {
          warnings.push('Slow agility time - check measurement conditions');
        }
        break;

      case 'T_TEST':
        if (value < 8.0) {
          warnings.push('Very fast T-test time - verify measurement setup');
        } else if (value > 12.0) {
          warnings.push('Slow T-test time - check measurement conditions');
        }
        break;

      case 'RSI':
        if (value < 1.0) {
          warnings.push('Low RSI value - verify calculation method');
        } else if (value > 3.0) {
          warnings.push('High RSI value - confirm measurement technique');
        }
        break;
    }

    return warnings;
  }

  validateBatch(measurements: ExtractedMeasurementData[]): {
    valid: ExtractedMeasurementData[];
    invalid: Array<{ data: ExtractedMeasurementData; validation: ValidationResult }>;
    summary: {
      total: number;
      valid: number;
      invalid: number;
      warnings: number;
    };
  } {
    const valid: ExtractedMeasurementData[] = [];
    const invalid: Array<{ data: ExtractedMeasurementData; validation: ValidationResult }> = [];
    let totalWarnings = 0;

    for (const measurement of measurements) {
      const validation = this.validateMeasurement(measurement);
      totalWarnings += validation.warnings.length;

      if (validation.isValid) {
        valid.push(measurement);
      } else {
        invalid.push({ data: measurement, validation });
      }
    }

    return {
      valid,
      invalid,
      summary: {
        total: measurements.length,
        valid: valid.length,
        invalid: invalid.length,
        warnings: totalWarnings
      }
    };
  }
}