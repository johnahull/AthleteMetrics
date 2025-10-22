import { describe, it, expect } from 'vitest';
import { chunkCSVData, createCSVFromChunk } from '../csv';

describe('CSV Chunking - chunkCSVData()', () => {
  it('should split array into chunks of specified size', () => {
    const data = Array.from({ length: 25 }, (_, i) => ({ id: i + 1, name: `Row ${i + 1}` }));
    const chunks = chunkCSVData(data, 10);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(10);
    expect(chunks[1]).toHaveLength(10);
    expect(chunks[2]).toHaveLength(5);
  });

  it('should handle exact multiples (20k rows, 10k chunks = 2 batches)', () => {
    const data = Array.from({ length: 20000 }, (_, i) => ({ id: i + 1 }));
    const chunks = chunkCSVData(data, 10000);

    expect(chunks).toHaveLength(2);
    expect(chunks[0]).toHaveLength(10000);
    expect(chunks[1]).toHaveLength(10000);
  });

  it('should handle remainders (25k rows, 10k chunks = 3 batches with 5k remainder)', () => {
    const data = Array.from({ length: 25000 }, (_, i) => ({ id: i + 1 }));
    const chunks = chunkCSVData(data, 10000);

    expect(chunks).toHaveLength(3);
    expect(chunks[0]).toHaveLength(10000);
    expect(chunks[1]).toHaveLength(10000);
    expect(chunks[2]).toHaveLength(5000);
  });

  it('should handle data smaller than chunk size (no split needed)', () => {
    const data = Array.from({ length: 5000 }, (_, i) => ({ id: i + 1 }));
    const chunks = chunkCSVData(data, 10000);

    expect(chunks).toHaveLength(1);
    expect(chunks[0]).toHaveLength(5000);
  });

  it('should preserve data integrity across chunks', () => {
    const data = [
      { id: 1, name: 'Alice', age: 25 },
      { id: 2, name: 'Bob', age: 30 },
      { id: 3, name: 'Charlie', age: 35 }
    ];
    const chunks = chunkCSVData(data, 2);

    expect(chunks[0][0]).toEqual({ id: 1, name: 'Alice', age: 25 });
    expect(chunks[0][1]).toEqual({ id: 2, name: 'Bob', age: 30 });
    expect(chunks[1][0]).toEqual({ id: 3, name: 'Charlie', age: 35 });
  });

  it('should return empty array for empty input', () => {
    const chunks = chunkCSVData([], 10000);
    expect(chunks).toEqual([]);
  });
});

describe('CSV Chunking - createCSVFromChunk()', () => {
  it('should recreate valid CSV with headers', () => {
    const chunk = [
      { firstName: 'Alice', lastName: 'Smith', age: 25 },
      { firstName: 'Bob', lastName: 'Jones', age: 30 }
    ];
    const headers = ['firstName', 'lastName', 'age'];

    const csv = createCSVFromChunk(chunk, headers);
    const lines = csv.split('\n');

    expect(lines[0]).toBe('firstName,lastName,age');
    expect(lines[1]).toBe('Alice,Smith,25');
    expect(lines[2]).toBe('Bob,Jones,30');
  });

  it('should handle special characters (commas, quotes, newlines)', () => {
    const chunk = [
      { name: 'Smith, John', note: 'Says "hello"', address: 'Line1\nLine2' }
    ];
    const headers = ['name', 'note', 'address'];

    const csv = createCSVFromChunk(chunk, headers);
    const lines = csv.split('\n');

    // CSV spec: comma-containing values should be quoted
    expect(lines[1]).toContain('"Smith, John"');
    // Quotes should be escaped
    expect(lines[1]).toContain('Says ""hello""');
  });

  it('should preserve data types and formats', () => {
    const chunk = [
      { name: 'Alice', score: 95.5, isActive: true, date: '2024-01-01' }
    ];
    const headers = ['name', 'score', 'isActive', 'date'];

    const csv = createCSVFromChunk(chunk, headers);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('Alice,95.5,true,2024-01-01');
  });

  it('should handle empty values gracefully', () => {
    const chunk = [
      { firstName: 'Alice', lastName: '', age: null },
      { firstName: '', lastName: 'Smith', age: undefined }
    ];
    const headers = ['firstName', 'lastName', 'age'];

    const csv = createCSVFromChunk(chunk, headers);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('Alice,,');
    expect(lines[2]).toBe(',Smith,');
  });

  it('should handle single row correctly', () => {
    const chunk = [{ name: 'Alice', age: 25 }];
    const headers = ['name', 'age'];

    const csv = createCSVFromChunk(chunk, headers);
    const lines = csv.split('\n');

    expect(lines).toHaveLength(2); // header + 1 data row
    expect(lines[0]).toBe('name,age');
    expect(lines[1]).toBe('Alice,25');
  });

  it('should return only headers for empty chunk', () => {
    const chunk: any[] = [];
    const headers = ['firstName', 'lastName', 'age'];

    const csv = createCSVFromChunk(chunk, headers);

    expect(csv).toBe('firstName,lastName,age');
  });

  it('should maintain column order based on headers array', () => {
    const chunk = [
      { age: 25, firstName: 'Alice', lastName: 'Smith' } // Properties in different order
    ];
    const headers = ['firstName', 'lastName', 'age']; // Desired order

    const csv = createCSVFromChunk(chunk, headers);
    const lines = csv.split('\n');

    expect(lines[1]).toBe('Alice,Smith,25'); // Should follow headers order
  });
});
