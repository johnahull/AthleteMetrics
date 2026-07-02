/**
 * TDD Tests for use-report-pdf.ts
 *
 * Tests the PDF download hook that consolidates download logic
 * from IndividualReportView, TeamReportView, and AthleteReportView.
 */

import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act, waitFor } from '@testing-library/react';
import { useReportPdf } from '../use-report-pdf';
import React from 'react';

// Create a wrapper that provides a proper React context
const wrapper = ({ children }: { children: React.ReactNode }) => {
  return React.createElement(React.Fragment, null, children);
};

describe('useReportPdf', () => {
  // Mock fetch globally
  const mockFetch = vi.fn();
  let originalFetch: typeof global.fetch;

  // Mock URL methods
  const mockCreateObjectURL = vi.fn();
  const mockRevokeObjectURL = vi.fn();
  let originalCreateObjectURL: typeof URL.createObjectURL;
  let originalRevokeObjectURL: typeof URL.revokeObjectURL;

  // Mock document methods
  let mockAnchor: HTMLAnchorElement;
  let originalCreateElement: typeof document.createElement;
  let originalAppendChild: typeof document.body.appendChild;
  let originalRemoveChild: typeof document.body.removeChild;

  beforeEach(() => {
    // Store originals
    originalFetch = global.fetch;
    originalCreateObjectURL = URL.createObjectURL;
    originalRevokeObjectURL = URL.revokeObjectURL;
    originalCreateElement = document.createElement.bind(document);
    originalAppendChild = document.body.appendChild.bind(document.body);
    originalRemoveChild = document.body.removeChild.bind(document.body);

    // Setup mock anchor element
    mockAnchor = {
      href: '',
      download: '',
      click: vi.fn(),
    } as unknown as HTMLAnchorElement;

    // Apply mocks
    global.fetch = mockFetch;
    URL.createObjectURL = mockCreateObjectURL;
    URL.revokeObjectURL = mockRevokeObjectURL;
    mockCreateObjectURL.mockReturnValue('blob:test-url');

    // Mock createElement to return our mock anchor for 'a' elements
    document.createElement = vi.fn((tagName: string) => {
      if (tagName === 'a') {
        return mockAnchor;
      }
      return originalCreateElement(tagName);
    }) as typeof document.createElement;

    // Mock body methods
    document.body.appendChild = vi.fn((node) => node) as typeof document.body.appendChild;
    document.body.removeChild = vi.fn((node) => node) as typeof document.body.removeChild;

    vi.clearAllMocks();
    mockCreateObjectURL.mockReturnValue('blob:test-url');
  });

  afterEach(() => {
    // Restore originals
    global.fetch = originalFetch;
    URL.createObjectURL = originalCreateObjectURL;
    URL.revokeObjectURL = originalRevokeObjectURL;
    document.createElement = originalCreateElement;
    document.body.appendChild = originalAppendChild;
    document.body.removeChild = originalRemoveChild;
  });

  describe('initialization', () => {
    it('should initialize with isDownloading as false', () => {
      const { result } = renderHook(
        () => useReportPdf({ reportId: 'report-123', reportName: 'Test Report' }),
        { wrapper }
      );

      expect(result.current.isDownloading).toBe(false);
    });

    it('should return downloadPdf function', () => {
      const { result } = renderHook(
        () => useReportPdf({ reportId: 'report-123', reportName: 'Test Report' }),
        { wrapper }
      );

      expect(typeof result.current.downloadPdf).toBe('function');
    });
  });

  describe('downloadPdf for team reports', () => {
    it('should download PDF with format parameter for team reports', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      const { result } = renderHook(
        () => useReportPdf({ reportId: 'report-123', reportName: 'Team Report' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.downloadPdf({ format: 'visual' });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/reports/report-123/pdf', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: 'visual', athleteId: undefined, chartImages: [] }),
      });
    });

    it('should set filename with underscores replacing spaces', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      const { result } = renderHook(
        () => useReportPdf({ reportId: 'report-123', reportName: 'My Test Report' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.downloadPdf({ format: 'visual' });
      });

      expect(mockAnchor.download).toBe('My_Test_Report.pdf');
    });
  });

  describe('downloadPdf for individual reports', () => {
    it('should download PDF with athleteId parameter for individual reports', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      const { result } = renderHook(
        () => useReportPdf({ reportId: 'report-456', reportName: 'Individual Report' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.downloadPdf({ athleteId: 'athlete-789' });
      });

      expect(mockFetch).toHaveBeenCalledWith('/api/reports/report-456/pdf', {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format: undefined, athleteId: 'athlete-789', chartImages: [] }),
      });
    });
  });

  describe('isDownloading state', () => {
    it('should set isDownloading to false after successful download', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      const { result } = renderHook(
        () => useReportPdf({ reportId: 'report-123', reportName: 'Test Report' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.downloadPdf({ format: 'visual' });
      });

      expect(result.current.isDownloading).toBe(false);
    });

    it('should set isDownloading to false on error', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(
        () => useReportPdf({ reportId: 'report-123', reportName: 'Test Report' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.downloadPdf({ format: 'visual' });
      });

      expect(result.current.isDownloading).toBe(false);
      consoleErrorSpy.mockRestore();
    });
  });

  describe('error handling', () => {
    it('should log error on failed fetch', async () => {
      mockFetch.mockResolvedValueOnce({
        ok: false,
        status: 500,
      });

      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(
        () => useReportPdf({ reportId: 'report-123', reportName: 'Test Report' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.downloadPdf({ format: 'visual' });
      });

      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error downloading PDF:',
        expect.any(Error)
      );

      consoleErrorSpy.mockRestore();
    });

    it('should not proceed with download if no valid parameters provided', async () => {
      const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

      const { result } = renderHook(
        () => useReportPdf({ reportId: 'report-123', reportName: 'Test Report' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.downloadPdf({});
      });

      // Should not have made a fetch call since no valid parameters provided
      expect(mockFetch).not.toHaveBeenCalled();
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        '[useReportPdf] No format or athleteId provided for PDF download'
      );

      consoleErrorSpy.mockRestore();
    });
  });

  describe('cleanup', () => {
    it('should clean up object URL after download', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      const { result } = renderHook(
        () => useReportPdf({ reportId: 'report-123', reportName: 'Test Report' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.downloadPdf({ format: 'visual' });
      });

      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:test-url');
    });

    it('should remove anchor element from DOM after download', async () => {
      const mockBlob = new Blob(['test'], { type: 'application/pdf' });
      mockFetch.mockResolvedValueOnce({
        ok: true,
        blob: () => Promise.resolve(mockBlob),
      });

      const { result } = renderHook(
        () => useReportPdf({ reportId: 'report-123', reportName: 'Test Report' }),
        { wrapper }
      );

      await act(async () => {
        await result.current.downloadPdf({ format: 'visual' });
      });

      expect(document.body.removeChild).toHaveBeenCalledWith(mockAnchor);
    });
  });
});
