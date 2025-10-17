/**
 * Type-safe number conversion utilities
 * Provides centralized, safe conversion of string/unknown values to numbers
 * with proper error handling and validation
 */

export interface NumberConversionResult {
  value: number;
  isValid: boolean;
  error?: string;
}

/**
 * Safely converts a value to a number with validation
 * @param value - The value to convert (string, number, or unknown)
 * @param options - Conversion options
 * @returns NumberConversionResult with converted value and validation status
 */
export function safeNumberConversion(
  value: unknown,
  options: {
    allowNaN?: boolean;
    allowInfinity?: boolean;
    min?: number;
    max?: number;
    defaultValue?: number;
  } = {}
): NumberConversionResult {
  const {
    allowNaN = false,
    allowInfinity = false,
    min,
    max,
    defaultValue = 0
  } = options;

  // Handle null/undefined
  if (value == null) {
    return {
      value: defaultValue,
      isValid: false,
      error: 'Value is null or undefined'
    };
  }

  // Handle already valid numbers
  if (typeof value === 'number') {
    if (!allowNaN && isNaN(value)) {
      return {
        value: defaultValue,
        isValid: false,
        error: 'Value is NaN'
      };
    }

    if (!allowInfinity && !isFinite(value) && !isNaN(value)) {
      return {
        value: defaultValue,
        isValid: false,
        error: 'Value is infinite'
      };
    }

    // Check range constraints only for valid finite numbers
    if (!isNaN(value) && isFinite(value)) {
      if (min !== undefined && value < min) {
        return {
          value: defaultValue,
          isValid: false,
          error: `Value ${value} is less than minimum ${min}`
        };
      }

      if (max !== undefined && value > max) {
        return {
          value: defaultValue,
          isValid: false,
          error: `Value ${value} is greater than maximum ${max}`
        };
      }
    }

    return { value, isValid: true };
  }

  // Handle string conversion
  if (typeof value === 'string') {
    const trimmed = value.trim();

    if (trimmed === '') {
      return {
        value: defaultValue,
        isValid: false,
        error: 'Empty string'
      };
    }

    const converted = parseFloat(trimmed);

    // Apply the same validation logic as for numbers, but handle special string cases
    if (!allowNaN && isNaN(converted)) {
      return {
        value: defaultValue,
        isValid: false,
        error: 'String value resulted in NaN'
      };
    }

    if (!allowInfinity && !isFinite(converted) && !isNaN(converted)) {
      return {
        value: defaultValue,
        isValid: false,
        error: 'String value resulted in infinite number'
      };
    }

    // For NaN with allowNaN=true, or finite numbers, apply range constraints
    if (!isNaN(converted)) {
      // Check range constraints only for valid numbers
      if (min !== undefined && converted < min) {
        return {
          value: defaultValue,
          isValid: false,
          error: `Converted value ${converted} is less than minimum ${min}`
        };
      }

      if (max !== undefined && converted > max) {
        return {
          value: defaultValue,
          isValid: false,
          error: `Converted value ${converted} is greater than maximum ${max}`
        };
      }
    }

    return { value: converted, isValid: true };
  }

  // Handle other types
  return {
    value: defaultValue,
    isValid: false,
    error: `Cannot convert value of type ${typeof value} to number`
  };
}

/**
 * Safely converts a value to a number, throwing an error if conversion fails
 * @param value - The value to convert
 * @param options - Conversion options
 * @returns The converted number
 * @throws Error if conversion fails
 */
export function requireNumber(
  value: unknown,
  options: Parameters<typeof safeNumberConversion>[1] = {}
): number {
  const result = safeNumberConversion(value, options);

  if (!result.isValid) {
    throw new Error(`Number conversion failed: ${result.error}`);
  }

  return result.value;
}

/**
 * Safely converts a value to a number, returning default value if conversion fails
 * @param value - The value to convert
 * @param defaultValue - Value to return if conversion fails
 * @param options - Additional conversion options
 * @returns The converted number or default value
 */
export function safeNumber(
  value: unknown,
  defaultValue: number = 0,
  options: Omit<Parameters<typeof safeNumberConversion>[1], 'defaultValue'> = {}
): number {
  const result = safeNumberConversion(value, { ...options, defaultValue });
  return result.value;
}

/**
 * Converts an array of values to numbers, filtering out invalid conversions
 * @param values - Array of values to convert
 * @param options - Conversion options
 * @returns Array of successfully converted numbers
 */
export function safeNumberArray(
  values: unknown[],
  options: Parameters<typeof safeNumberConversion>[1] = {}
): number[] {
  return values
    .map(value => safeNumberConversion(value, options))
    .filter(result => result.isValid)
    .map(result => result.value);
}

/**
 * Specialized conversion for athletic performance metrics
 * Handles common edge cases in sports data
 */
export function convertAthleteMetricValue(value: unknown): NumberConversionResult {
  return safeNumberConversion(value, {
    allowNaN: false,
    allowInfinity: false,
    min: 0, // Most athletic metrics are positive
    max: 1000000 // Reasonable upper bound for athletic data
  });
}