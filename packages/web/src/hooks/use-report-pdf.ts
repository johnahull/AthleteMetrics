/**
 * Custom hook for downloading report PDFs
 *
 * This hook consolidates the PDF download logic previously duplicated across:
 * - IndividualReportView.tsx
 * - TeamReportView.tsx
 * - AthleteReportView.tsx (both individual and team variants)
 *
 * It handles:
 * - Fetching the PDF from the API
 * - Creating a download link
 * - Managing loading state
 * - Cleaning up resources
 */

import { useState, useCallback } from 'react';
import type { PdfFormat } from '@/types/report-types';
import { captureTrendCharts } from '@/lib/chartExport';

interface UseReportPdfOptions {
  /** The ID of the report to download */
  reportId: string;
  /** The name of the report (used for filename) */
  reportName: string;
  /** Optional callback invoked when PDF download fails */
  onError?: (error: Error) => void;
}

interface DownloadOptions {
  /** PDF format for team reports */
  format?: PdfFormat;
  /** Athlete ID for individual reports */
  athleteId?: string;
}

interface UseReportPdfReturn {
  /** Function to trigger PDF download */
  downloadPdf: (options: DownloadOptions) => Promise<void>;
  /** Whether a download is currently in progress */
  isDownloading: boolean;
}

/**
 * Hook for downloading report PDFs with proper state management and cleanup.
 *
 * @param options - Report ID and name
 * @returns Object containing downloadPdf function and isDownloading state
 *
 * @example
 * // For team reports with format selection
 * const { downloadPdf, isDownloading } = useReportPdf({ reportId, reportName });
 * await downloadPdf({ format: 'visual' });
 *
 * @example
 * // For individual reports with athlete ID
 * const { downloadPdf, isDownloading } = useReportPdf({ reportId, reportName });
 * await downloadPdf({ athleteId: 'athlete-123' });
 */
export function useReportPdf({ reportId, reportName, onError }: UseReportPdfOptions): UseReportPdfReturn {
  const [isDownloading, setIsDownloading] = useState(false);

  const downloadPdf = useCallback(async (options: DownloadOptions) => {
    const { format, athleteId } = options;

    // Validate that we have at least one valid parameter
    if (!format && !athleteId) {
      console.error('[useReportPdf] No format or athleteId provided for PDF download');
      return;
    }

    setIsDownloading(true);

    try {
      const chartImages = await captureTrendCharts();

      const response = await fetch(`/api/reports/${reportId}/pdf`, {
        method: 'POST',
        credentials: 'include',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ format, athleteId, chartImages }),
      });

      if (!response.ok) {
        throw new Error('Failed to download PDF');
      }

      // Create blob from response
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);

      // Create download link
      const a = document.createElement('a');
      a.href = url;
      a.download = `${reportName.replace(/\s+/g, '_')}.pdf`;
      document.body.appendChild(a);
      a.click();

      // Cleanup
      window.URL.revokeObjectURL(url);
      document.body.removeChild(a);
    } catch (error) {
      console.error('Error downloading PDF:', error);
      const errorInstance = error instanceof Error ? error : new Error('Failed to download PDF');
      onError?.(errorInstance);
    } finally {
      setIsDownloading(false);
    }
  }, [reportId, reportName, onError]);

  return { downloadPdf, isDownloading };
}
