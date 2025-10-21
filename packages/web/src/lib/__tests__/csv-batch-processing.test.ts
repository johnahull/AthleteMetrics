import { describe, it, expect } from 'vitest';
import {
  chunkCSVData,
  createCSVFromChunk,
  parseCSV,
  needsBatchProcessing,
  getBatchInfo,
  aggregateBatchResults
} from '../csv';

describe('Batch Processing - Detection', () => {
  it('should detect files >10,000 rows need batch processing', () => {
    expect(needsBatchProcessing(15000)).toBe(true);
    expect(needsBatchProcessing(25000)).toBe(true);
  });

  it('should not batch process files ≤10,000 rows', () => {
    expect(needsBatchProcessing(10000)).toBe(false);
    expect(needsBatchProcessing(5000)).toBe(false);
    expect(needsBatchProcessing(100)).toBe(false);
  });

  it('should allow custom batch size', () => {
    expect(needsBatchProcessing(6000, 5000)).toBe(true);
    expect(needsBatchProcessing(4000, 5000)).toBe(false);
  });
});

describe('Batch Processing - Batch Information', () => {
  it('should calculate correct batch count for exact multiples', () => {
    const info = getBatchInfo(20000);
    expect(info.needsBatching).toBe(true);
    expect(info.batchCount).toBe(2);
    expect(info.lastBatchSize).toBe(10000);
  });

  it('should calculate correct batch count for remainders', () => {
    const info = getBatchInfo(25000);
    expect(info.needsBatching).toBe(true);
    expect(info.batchCount).toBe(3);
    expect(info.lastBatchSize).toBe(5000);
  });

  it('should handle files that do not need batching', () => {
    const info = getBatchInfo(5000);
    expect(info.needsBatching).toBe(false);
    expect(info.batchCount).toBe(1);
    expect(info.rowsPerBatch).toBe(5000);
  });

  it('should handle edge case of exactly 10,000 rows', () => {
    const info = getBatchInfo(10000);
    expect(info.needsBatching).toBe(false);
    expect(info.batchCount).toBe(1);
  });
});

describe('Batch Processing - Result Aggregation', () => {
  it('should aggregate success counts from multiple batches', () => {
    const batchResults = [
      {
        totalRows: 10000,
        summary: { created: 9950, updated: 0, matched: 0, skipped: 50 },
        errors: [],
        warnings: []
      },
      {
        totalRows: 10000,
        summary: { created: 9980, updated: 0, matched: 0, skipped: 20 },
        errors: [],
        warnings: []
      },
      {
        totalRows: 5000,
        summary: { created: 4995, updated: 0, matched: 0, skipped: 5 },
        errors: [],
        warnings: []
      }
    ];

    const result = aggregateBatchResults(batchResults);

    expect(result.totalRows).toBe(25000);
    expect(result.summary.created).toBe(24925);
    expect(result.summary.skipped).toBe(75);
  });

  it('should aggregate errors from multiple batches with batch context', () => {
    const batchResults = [
      {
        totalRows: 10000,
        summary: { created: 9950, updated: 0, matched: 0, skipped: 0 },
        errors: [
          { row: 42, message: 'Invalid email' },
          { row: 100, message: 'Missing birth date' }
        ],
        warnings: []
      },
      {
        totalRows: 10000,
        summary: { created: 9980, updated: 0, matched: 0, skipped: 0 },
        errors: [
          { row: 50, message: 'Invalid phone' }
        ],
        warnings: []
      }
    ];

    const result = aggregateBatchResults(batchResults);

    expect(result.errors).toHaveLength(3);
    expect(result.errors[0].batch).toBe(1);
    expect(result.errors[0].message).toContain('[Batch 1]');
    expect(result.errors[2].batch).toBe(2);
  });

  it('should handle batches with no errors or warnings', () => {
    const batchResults = [
      {
        totalRows: 10000,
        summary: { created: 10000, updated: 0, matched: 0, skipped: 0 },
        errors: [],
        warnings: []
      }
    ];

    const result = aggregateBatchResults(batchResults);

    expect(result.errors).toHaveLength(0);
    expect(result.warnings).toHaveLength(0);
  });

  it('should aggregate created teams and athletes', () => {
    const batchResults = [
      {
        totalRows: 10000,
        summary: { created: 10000, updated: 0, matched: 0, skipped: 0 },
        errors: [],
        warnings: [],
        createdTeams: [{ id: 'team1', name: 'Varsity' }],
        createdAthletes: [{ id: 'athlete1', name: 'John Doe' }]
      },
      {
        totalRows: 5000,
        summary: { created: 5000, updated: 0, matched: 0, skipped: 0 },
        errors: [],
        warnings: [],
        createdTeams: [{ id: 'team2', name: 'JV' }],
        createdAthletes: [{ id: 'athlete2', name: 'Jane Smith' }]
      }
    ];

    const result = aggregateBatchResults(batchResults);

    expect(result.createdTeams).toHaveLength(2);
    expect(result.createdAthletes).toHaveLength(2);
  });
});

describe('Batch Processing - Integration', () => {
  it('should process data in batches correctly', () => {
    // Create test data
    const data = Array.from({ length: 25 }, (_, i) => ({
      firstName: `First${i + 1}`,
      lastName: `Last${i + 1}`,
      age: 20 + (i % 10)
    }));

    // Check if batching needed
    const batchInfo = getBatchInfo(data.length, 10);
    expect(batchInfo.needsBatching).toBe(true);
    expect(batchInfo.batchCount).toBe(3);

    // Split into batches
    const batches = chunkCSVData(data, 10);
    expect(batches).toHaveLength(3);

    // Create CSV from each batch
    const headers = ['firstName', 'lastName', 'age'];
    const csvBatches = batches.map(batch => createCSVFromChunk(batch, headers));

    // Verify each CSV is valid
    csvBatches.forEach((csv, index) => {
      const lines = csv.split('\n');
      expect(lines[0]).toBe('firstName,lastName,age'); // Header

      if (index < 2) {
        expect(lines.length).toBe(11); // header + 10 data rows
      } else {
        expect(lines.length).toBe(6); // header + 5 data rows (remainder)
      }
    });
  });
});
