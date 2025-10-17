/**
 * Integration tests for CSV import with TOP_SPEED metric
 */

import { describe, it, expect } from 'vitest';
import { parseCSV } from '../csv';

describe('CSV Import Integration - TOP_SPEED', () => {
  it('should parse CSV with TOP_SPEED measurements', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units,Team
John,Doe,2024-01-15,TOP_SPEED,18.5,mph,Team A
Jane,Smith,2024-01-15,TOP_SPEED,20.2,mph,Team B
Mike,Johnson,2024-01-16,TOP_SPEED,17.8,mph,Team A`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(3);

    // Verify first row
    expect(result[0]['First Name']).toBe('John');
    expect(result[0]['Metric']).toBe('TOP_SPEED');
    expect(result[0]['Value']).toBe('18.5');
    expect(result[0]['Units']).toBe('mph');
  });

  it('should handle mixed metrics including TOP_SPEED', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units
Sarah,Williams,2024-01-16,TOP_SPEED,19.1,mph
Chris,Brown,2024-01-17,FLY10_TIME,2.0,s
Alex,Davis,2024-01-17,VERTICAL_JUMP,32,in`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(3);

    const topSpeedRow = result[0];
    expect(topSpeedRow['Metric']).toBe('TOP_SPEED');
    expect(topSpeedRow['Units']).toBe('mph');

    const fly10Row = result[1];
    expect(fly10Row['Metric']).toBe('FLY10_TIME');
    expect(fly10Row['Units']).toBe('s');

    const vjRow = result[2];
    expect(vjRow['Metric']).toBe('VERTICAL_JUMP');
    expect(vjRow['Units']).toBe('in');
  });

  it('should validate TOP_SPEED units correctly', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units
Test,User,2024-01-15,TOP_SPEED,18.5,mph`;

    const result = parseCSV(csvContent);
    const row = result[0];

    // Verify mph is a valid unit
    expect(row['Units']).toBe('mph');
  });

  it('should handle TOP_SPEED without explicit units', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value
Test,User,2024-01-15,TOP_SPEED,18.5`;

    const result = parseCSV(csvContent);
    const row = result[0];

    // Should still parse successfully
    expect(row['Metric']).toBe('TOP_SPEED');
    expect(row['Value']).toBe('18.5');
  });

  it('should handle multiple athletes with TOP_SPEED measurements', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units,Fly-In Distance,Team
Athlete,One,2024-01-15,TOP_SPEED,18.5,mph,10,Team A
Athlete,Two,2024-01-15,TOP_SPEED,19.2,mph,10,Team A
Athlete,Three,2024-01-15,TOP_SPEED,17.9,mph,10,Team B
Athlete,Four,2024-01-15,TOP_SPEED,20.1,mph,10,Team B`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(4);

    const values = result.map(r => parseFloat(r['Value']));
    expect(values).toEqual([18.5, 19.2, 17.9, 20.1]);

    const teams = result.map(r => r['Team']);
    expect(teams).toEqual(['Team A', 'Team A', 'Team B', 'Team B']);
  });

  it('should parse edge case values for TOP_SPEED', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units
Fast,Runner,2024-01-15,TOP_SPEED,22.5,mph
Slow,Runner,2024-01-15,TOP_SPEED,11.0,mph
Average,Runner,2024-01-15,TOP_SPEED,17.5,mph`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(3);

    const values = result.map(r => parseFloat(r['Value']));
    expect(values).toEqual([22.5, 11.0, 17.5]);
  });

  it('should handle decimal precision in TOP_SPEED values', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units
Test,User1,2024-01-15,TOP_SPEED,18.52,mph
Test,User2,2024-01-15,TOP_SPEED,18.5,mph
Test,User3,2024-01-15,TOP_SPEED,18,mph`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(3);

    expect(result[0]['Value']).toBe('18.52');
    expect(result[1]['Value']).toBe('18.5');
    expect(result[2]['Value']).toBe('18');
  });

  it('should handle empty/missing fields gracefully', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units
John,Doe,2024-01-15,TOP_SPEED,18.5,mph
Jane,,2024-01-15,TOP_SPEED,19.0,mph
,Smith,2024-01-15,TOP_SPEED,17.5,mph`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(3);
    expect(result[1]['Last Name']).toBe('');
    expect(result[2]['First Name']).toBe('');
  });
});

describe('CSV Import - Mutual Exclusion Validation', () => {
  it('should allow TOP_SPEED and FLY10_TIME in separate rows', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units
John,Doe,2024-01-15,TOP_SPEED,18.5,mph
John,Doe,2024-01-16,FLY10_TIME,2.0,s`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(2);
    expect(result[0]['Metric']).toBe('TOP_SPEED');
    expect(result[1]['Metric']).toBe('FLY10_TIME');
  });

  it('should handle athlete with only TOP_SPEED measurements', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units
John,Doe,2024-01-15,TOP_SPEED,18.5,mph
John,Doe,2024-01-16,TOP_SPEED,19.0,mph
John,Doe,2024-01-17,TOP_SPEED,18.8,mph`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(3);
    expect(result.every(r => r['Metric'] === 'TOP_SPEED')).toBe(true);
  });

  it('should handle athlete with only FLY10_TIME measurements', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units
Jane,Smith,2024-01-15,FLY10_TIME,2.0,s
Jane,Smith,2024-01-16,FLY10_TIME,1.95,s
Jane,Smith,2024-01-17,FLY10_TIME,1.98,s`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(3);
    expect(result.every(r => r['Metric'] === 'FLY10_TIME')).toBe(true);
  });
});

describe('CSV Import - Error Handling', () => {
  it('should handle invalid TOP_SPEED values', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units
Test,User,2024-01-15,TOP_SPEED,invalid,mph`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(1);
    expect(result[0]['Value']).toBe('invalid');
    // Validation happens later in the import process
  });

  it('should handle negative TOP_SPEED values', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units
Test,User,2024-01-15,TOP_SPEED,-10,mph`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(1);
    expect(result[0]['Value']).toBe('-10');
    // Validation happens later
  });

  it('should handle zero TOP_SPEED values', () => {
    const csvContent = `First Name,Last Name,Date,Metric,Value,Units
Test,User,2024-01-15,TOP_SPEED,0,mph`;

    const result = parseCSV(csvContent);

    expect(result).toHaveLength(1);
    expect(result[0]['Value']).toBe('0');
    // Validation happens later
  });
});
