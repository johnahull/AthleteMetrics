/**
 * CSV Validation Tests for TOP_SPEED metric
 */

import { describe, it, expect } from 'vitest';

// Mock the validation function structure
function validateMeasurementRow(row: {
  firstName?: string;
  lastName?: string;
  metric?: string;
  value?: string;
  units?: string;
  date?: string;
}) {
  const errors: string[] = [];

  // Basic field validation
  if (!row.firstName?.trim()) {
    errors.push('First name is required');
  }
  if (!row.lastName?.trim()) {
    errors.push('Last name is required');
  }
  if (!row.metric?.trim()) {
    errors.push('Metric is required');
  }
  if (!row.date?.trim()) {
    errors.push('Date is required');
  }
  if (!row.value?.trim()) {
    errors.push('Valid numeric value is required');
  } else {
    const value = parseFloat(row.value);
    if (value <= 0) {
      errors.push('Value must be positive');
    }
  }

  // Validate units - THIS IS THE CRITICAL TEST
  const validUnits = ['s', 'in', 'mph', ''];
  if (row.units && !validUnits.includes(row.units)) {
    errors.push('Units must be "s" for time, "in" for distance, "mph" for speed, or empty for dimensionless');
  }

  return {
    valid: errors.length === 0,
    errors,
  };
}

describe('CSV Validation for TOP_SPEED', () => {
  it('should accept mph units for TOP_SPEED metric', () => {
    const row = {
      firstName: 'John',
      lastName: 'Doe',
      metric: 'TOP_SPEED',
      value: '18.5',
      units: 'mph',
      date: '2024-01-15'
    };

    const result = validateMeasurementRow(row);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept s units for FLY10_TIME metric', () => {
    const row = {
      firstName: 'Jane',
      lastName: 'Smith',
      metric: 'FLY10_TIME',
      value: '1.95',
      units: 's',
      date: '2024-01-15'
    };

    const result = validateMeasurementRow(row);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept in units for VERTICAL_JUMP metric', () => {
    const row = {
      firstName: 'Mike',
      lastName: 'Johnson',
      metric: 'VERTICAL_JUMP',
      value: '32',
      units: 'in',
      date: '2024-01-15'
    };

    const result = validateMeasurementRow(row);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should accept empty units for dimensionless metrics', () => {
    const row = {
      firstName: 'Sarah',
      lastName: 'Williams',
      metric: 'RSI',
      value: '2.5',
      units: '',
      date: '2024-01-15'
    };

    const result = validateMeasurementRow(row);
    expect(result.valid).toBe(true);
    expect(result.errors).toHaveLength(0);
  });

  it('should reject invalid units', () => {
    const row = {
      firstName: 'Chris',
      lastName: 'Brown',
      metric: 'TOP_SPEED',
      value: '18.5',
      units: 'km/h', // Invalid unit
      date: '2024-01-15'
    };

    const result = validateMeasurementRow(row);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Units must be "s" for time, "in" for distance, "mph" for speed, or empty for dimensionless');
  });

  it('should reject negative values', () => {
    const row = {
      firstName: 'Alex',
      lastName: 'Davis',
      metric: 'TOP_SPEED',
      value: '-10',
      units: 'mph',
      date: '2024-01-15'
    };

    const result = validateMeasurementRow(row);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Value must be positive');
  });

  it('should reject zero values', () => {
    const row = {
      firstName: 'Pat',
      lastName: 'Taylor',
      metric: 'TOP_SPEED',
      value: '0',
      units: 'mph',
      date: '2024-01-15'
    };

    const result = validateMeasurementRow(row);
    expect(result.valid).toBe(false);
    expect(result.errors).toContain('Value must be positive');
  });

  it('should require all mandatory fields', () => {
    const row = {
      firstName: '',
      lastName: '',
      metric: '',
      value: '',
      units: 'mph',
      date: ''
    };

    const result = validateMeasurementRow(row);
    expect(result.valid).toBe(false);
    expect(result.errors.length).toBeGreaterThan(0);
    expect(result.errors).toContain('First name is required');
    expect(result.errors).toContain('Last name is required');
    expect(result.errors).toContain('Metric is required');
    expect(result.errors).toContain('Date is required');
  });
});

describe('CSV Validation - All Valid Units', () => {
  const validUnitsTestCases = [
    { units: 's', description: 'seconds for time metrics' },
    { units: 'in', description: 'inches for distance metrics' },
    { units: 'mph', description: 'miles per hour for speed metrics' },
    { units: '', description: 'empty for dimensionless metrics' }
  ];

  validUnitsTestCases.forEach(({ units, description }) => {
    it(`should accept ${description}`, () => {
      const row = {
        firstName: 'Test',
        lastName: 'User',
        metric: 'TEST_METRIC',
        value: '10',
        units: units,
        date: '2024-01-15'
      };

      const result = validateMeasurementRow(row);
      expect(result.valid).toBe(true);
    });
  });
});
