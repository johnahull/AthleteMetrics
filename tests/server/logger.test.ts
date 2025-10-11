import { describe, it, expect, beforeEach, afterEach, vi } from 'vitest';
import { log } from '../../server/utils/logger';

/**
 * Tests for logger utility
 *
 * Verifies that the log function correctly formats messages with timestamps
 * and source identifiers for consistent server-side logging.
 */
describe('Logger Utility', () => {
  let mockConsoleLog: ReturnType<typeof vi.spyOn>;

  beforeEach(() => {
    mockConsoleLog = vi.spyOn(console, 'log').mockImplementation(() => {});
  });

  afterEach(() => {
    mockConsoleLog.mockRestore();
  });

  describe('log function', () => {
    it('should format log messages with timestamp and source', () => {
      log('Test message', 'test-source');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const logCall = mockConsoleLog.mock.calls[0][0];

      // Should contain timestamp in format: "HH:MM:SS AM/PM"
      expect(logCall).toMatch(/^\d{1,2}:\d{2}:\d{2} (AM|PM)/);

      // Should contain source in brackets
      expect(logCall).toContain('[test-source]');

      // Should contain the message
      expect(logCall).toContain('Test message');
    });

    it('should default to "express" source if not provided', () => {
      log('Test message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const logCall = mockConsoleLog.mock.calls[0][0];

      expect(logCall).toContain('[express]');
      expect(logCall).toContain('Test message');
    });

    it('should handle empty messages', () => {
      log('');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const logCall = mockConsoleLog.mock.calls[0][0];

      // Should still have timestamp and source
      expect(logCall).toMatch(/^\d{1,2}:\d{2}:\d{2} (AM|PM)/);
      expect(logCall).toContain('[express]');
    });

    it('should handle special characters in messages', () => {
      const specialMessage = 'Message with "quotes" and \'apostrophes\' and [brackets]';
      log(specialMessage, 'test');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const logCall = mockConsoleLog.mock.calls[0][0];

      expect(logCall).toContain(specialMessage);
    });

    it('should handle multiline messages', () => {
      const multilineMessage = 'Line 1\nLine 2\nLine 3';
      log(multilineMessage, 'test');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const logCall = mockConsoleLog.mock.calls[0][0];

      expect(logCall).toContain('Line 1');
      expect(logCall).toContain('Line 2');
      expect(logCall).toContain('Line 3');
    });

    it('should handle long messages', () => {
      const longMessage = 'A'.repeat(1000);
      log(longMessage, 'test');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const logCall = mockConsoleLog.mock.calls[0][0];

      expect(logCall).toContain('A'.repeat(100)); // Should contain at least part of the message
    });

    it('should format timestamp consistently', () => {
      log('Message 1');
      log('Message 2');

      expect(mockConsoleLog).toHaveBeenCalledTimes(2);

      const firstCall = mockConsoleLog.mock.calls[0][0];
      const secondCall = mockConsoleLog.mock.calls[1][0];

      // Both should have timestamp format
      expect(firstCall).toMatch(/^\d{1,2}:\d{2}:\d{2} (AM|PM)/);
      expect(secondCall).toMatch(/^\d{1,2}:\d{2}:\d{2} (AM|PM)/);
    });

    it('should use 12-hour time format with AM/PM', () => {
      log('Test message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const logCall = mockConsoleLog.mock.calls[0][0];

      // Should have AM or PM
      expect(logCall).toMatch(/(AM|PM)/);

      // Should not use 24-hour format (no hours like 13-23)
      // Matches hours 13-19 or 20-23 followed by colon
      expect(logCall).not.toMatch(/\b(1[3-9]|2[0-3]):/);
    });

    it('should handle numeric hour formats correctly', () => {
      log('Test message');

      expect(mockConsoleLog).toHaveBeenCalledTimes(1);
      const logCall = mockConsoleLog.mock.calls[0][0];

      // Hour should be 1-12, not 0-23
      const hourMatch = logCall.match(/^(\d{1,2}):/);
      expect(hourMatch).toBeTruthy();

      if (hourMatch) {
        const hour = parseInt(hourMatch[1]);
        expect(hour).toBeGreaterThanOrEqual(1);
        expect(hour).toBeLessThanOrEqual(12);
      }
    });
  });

  describe('Common use cases', () => {
    it('should log server startup messages', () => {
      log('serving on port 5000');

      const logCall = mockConsoleLog.mock.calls[0][0];

      expect(logCall).toContain('[express]');
      expect(logCall).toContain('serving on port 5000');
    });

    it('should log API requests', () => {
      log('GET /api/users 200 in 45ms');

      const logCall = mockConsoleLog.mock.calls[0][0];

      expect(logCall).toContain('[express]');
      expect(logCall).toContain('GET /api/users 200 in 45ms');
    });

    it('should log vite messages', () => {
      log('Vite dev server started', 'vite');

      const logCall = mockConsoleLog.mock.calls[0][0];

      expect(logCall).toContain('[vite]');
      expect(logCall).toContain('Vite dev server started');
    });

    it('should log database messages', () => {
      log('Database connected successfully', 'database');

      const logCall = mockConsoleLog.mock.calls[0][0];

      expect(logCall).toContain('[database]');
      expect(logCall).toContain('Database connected successfully');
    });

    it('should log error messages', () => {
      log('Failed to connect to database', 'error');

      const logCall = mockConsoleLog.mock.calls[0][0];

      expect(logCall).toContain('[error]');
      expect(logCall).toContain('Failed to connect to database');
    });
  });

  describe('Format validation', () => {
    it('should produce consistent output format', () => {
      log('Test message', 'source');

      const logCall = mockConsoleLog.mock.calls[0][0];

      // Format: "HH:MM:SS AM/PM [source] message"
      const format = /^\d{1,2}:\d{2}:\d{2} (AM|PM) \[.+\] .+$/;
      expect(logCall).toMatch(format);
    });

    it('should separate timestamp, source, and message clearly', () => {
      log('Important message', 'critical');

      const logCall = mockConsoleLog.mock.calls[0][0];

      // Should have clear separation: timestamp [source] message
      expect(logCall).toContain(' [critical] ');

      // Timestamp should be before source
      const timestampIndex = logCall.search(/^\d{1,2}:\d{2}:\d{2}/);
      const sourceIndex = logCall.indexOf('[critical]');
      const messageIndex = logCall.indexOf('Important message');

      expect(timestampIndex).toBeLessThan(sourceIndex);
      expect(sourceIndex).toBeLessThan(messageIndex);
    });

    it('should not add extra whitespace', () => {
      log('Message', 'source');

      const logCall = mockConsoleLog.mock.calls[0][0];

      // Should not have double spaces
      expect(logCall).not.toContain('  ');
    });
  });
});
