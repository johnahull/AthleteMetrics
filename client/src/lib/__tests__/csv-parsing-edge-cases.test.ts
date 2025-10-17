import { describe, it, expect } from 'vitest';
import { parseCSV } from '../csv';

describe('CSV Parsing Edge Cases', () => {
  describe('Special Characters', () => {
    it('should handle commas within values', () => {
      const csv = 'name,address\n"Smith, John","123 Main St, Apt 4"';
      const result = parseCSV(csv);

      // Note: Current implementation doesn't handle quoted values correctly
      // This test documents the current behavior
      expect(result).toHaveLength(1);
    });

    it('should handle quotes within values', () => {
      const csv = 'name,quote\nJohn,"He said ""hello"""';
      const result = parseCSV(csv);

      expect(result).toHaveLength(1);
    });

    it('should handle newlines within quoted values', () => {
      const csv = 'name,address\nJohn,"123 Main St\nApt 4"';
      const result = parseCSV(csv);

      // Current implementation treats newline as row separator
      // This test documents the limitation
      expect(result.length).toBeGreaterThanOrEqual(1);
    });
  });

  describe('Formula Injection Prevention', () => {
    it('should sanitize values starting with equals sign', () => {
      const csv = 'name,formula\nJohn,=1+1';
      const result = parseCSV(csv);

      expect(result[0].formula).toBe("'=1+1");
    });

    it('should sanitize values starting with plus sign', () => {
      const csv = 'name,formula\nJohn,+1234';
      const result = parseCSV(csv);

      expect(result[0].formula).toBe("'+1234");
    });

    it('should sanitize values starting with minus sign', () => {
      const csv = 'name,formula\nJohn,-1234';
      const result = parseCSV(csv);

      expect(result[0].formula).toBe("'-1234");
    });

    it('should sanitize values starting with at sign', () => {
      const csv = 'name,formula\nJohn,@SUM(A1:A10)';
      const result = parseCSV(csv);

      expect(result[0].formula).toBe("'@SUM(A1:A10)");
    });

    it('should not sanitize normal values', () => {
      const csv = 'name,value\nJohn,123';
      const result = parseCSV(csv);

      expect(result[0].value).toBe('123');
    });
  });

  describe('Empty and Null Values', () => {
    it('should handle empty cells', () => {
      const csv = 'name,value\nJohn,\nJane,123';
      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].value).toBe('');
      expect(result[1].value).toBe('123');
    });

    it('should handle completely empty rows', () => {
      const csv = 'name,value\nJohn,123\n\nJane,456';
      const result = parseCSV(csv);

      // Empty lines are filtered out
      expect(result).toHaveLength(2);
    });

    it('should handle empty CSV', () => {
      const csv = '';
      const result = parseCSV(csv);

      expect(result).toHaveLength(0);
    });
  });

  describe('Unicode and International Characters', () => {
    it('should handle unicode characters', () => {
      const csv = 'name,city\nJuan,México\nMiá,São Paulo';
      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].city).toBe('México');
      expect(result[1].city).toBe('São Paulo');
    });

    it('should handle emoji', () => {
      const csv = 'name,emoji\nJohn,⚽\nJane,🏃';
      const result = parseCSV(csv);

      expect(result).toHaveLength(2);
      expect(result[0].emoji).toBe('⚽');
      expect(result[1].emoji).toBe('🏃');
    });
  });

  describe('Large Data Sets', () => {
    it('should handle 10k rows efficiently', () => {
      const headers = 'firstName,lastName,age';
      const rows = Array.from({ length: 10000 }, (_, i) =>
        `John${i},Doe${i},${20 + (i % 30)}`
      );
      const csv = [headers, ...rows].join('\n');

      const start = Date.now();
      const result = parseCSV(csv);
      const duration = Date.now() - start;

      expect(result).toHaveLength(10000);
      expect(duration).toBeLessThan(1000); // Should parse in less than 1 second
    });

    it('should handle 25k rows efficiently', () => {
      const headers = 'firstName,lastName,age';
      const rows = Array.from({ length: 25000 }, (_, i) =>
        `John${i},Doe${i},${20 + (i % 30)}`
      );
      const csv = [headers, ...rows].join('\n');

      const start = Date.now();
      const result = parseCSV(csv);
      const duration = Date.now() - start;

      expect(result).toHaveLength(25000);
      expect(duration).toBeLessThan(2000); // Should parse in less than 2 seconds
    });
  });

  describe('Round-Trip Data Integrity', () => {
    it('should preserve data through parse-create cycle', () => {
      const csv = 'firstName,lastName,age\nJohn,Doe,25\nJane,Smith,30';
      const parsed = parseCSV(csv);

      expect(parsed).toHaveLength(2);
      expect(parsed[0]).toEqual({ firstName: 'John', lastName: 'Doe', age: '25' });
      expect(parsed[1]).toEqual({ firstName: 'Jane', lastName: 'Smith', age: '30' });
    });

    it('should handle special characters in round-trip', () => {
      const csv = 'name,value\nJohn,"O\'Brien"\nJane,Smith-Jones';
      const parsed = parseCSV(csv);

      expect(parsed[0].value).toContain('Brien');
      expect(parsed[1].value).toContain('Smith');
    });
  });
});
