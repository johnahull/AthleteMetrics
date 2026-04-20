/**
 * Hook for the athlete LLM export feature.
 *
 * Two operating modes:
 *   - "copy": fetch Markdown, write to navigator.clipboard (primary UX path).
 *   - "download": fetch Markdown or JSON, trigger a blob download
 *     (mirrors use-report-pdf.ts).
 *
 * If the clipboard API is unavailable (older browsers, insecure origins),
 * `copy` falls back to `download` and signals the caller via the
 * `clipboardFallback` flag on the return value.
 */

import { useCallback, useState } from 'react';

export type LlmExportFormat = 'markdown' | 'json';

interface UseLlmExportOptions {
  athleteId: string;
  athleteName?: string | null;
  onError?: (error: Error) => void;
}

interface CopyResult {
  ok: boolean;
  clipboardFallback?: boolean;
}

interface UseLlmExportReturn {
  copy: () => Promise<CopyResult>;
  download: (format: LlmExportFormat) => Promise<boolean>;
  isCopying: boolean;
  isDownloading: boolean;
  copiedAt: number | null;
}

const EXPORT_URL = (athleteId: string, format: LlmExportFormat) =>
  `/api/athletes/${athleteId}/llm-export?format=${format}`;

const SLUG_FALLBACK = 'athlete';

function slugify(name: string | null | undefined): string {
  if (!name) return SLUG_FALLBACK;
  const withoutDiacritics = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  return (
    withoutDiacritics
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || SLUG_FALLBACK
  );
}

function filenameFromResponse(
  response: Response,
  fallback: string,
): string {
  const header = response.headers.get('content-disposition');
  if (!header) return fallback;
  const match = /filename="([^"]+)"/.exec(header);
  return match?.[1] ?? fallback;
}

async function fetchExport(
  athleteId: string,
  format: LlmExportFormat,
): Promise<Response> {
  const res = await fetch(EXPORT_URL(athleteId, format), {
    method: 'GET',
    credentials: 'include',
  });
  if (!res.ok) {
    let message = `Export failed (${res.status})`;
    try {
      const body = await res.json();
      if (body?.message) message = body.message;
    } catch {
      /* non-json error body — keep the status-based message */
    }
    throw new Error(message);
  }
  return res;
}

function triggerBlobDownload(blob: Blob, filename: string): void {
  const url = window.URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = filename;
  document.body.appendChild(anchor);
  anchor.click();
  window.URL.revokeObjectURL(url);
  document.body.removeChild(anchor);
}

export function useLlmExport({
  athleteId,
  athleteName,
  onError,
}: UseLlmExportOptions): UseLlmExportReturn {
  const [isCopying, setIsCopying] = useState(false);
  const [isDownloading, setIsDownloading] = useState(false);
  const [copiedAt, setCopiedAt] = useState<number | null>(null);

  const copy = useCallback(async (): Promise<CopyResult> => {
    setIsCopying(true);
    try {
      const response = await fetchExport(athleteId, 'markdown');
      const text = await response.text();

      const canUseClipboard =
        typeof navigator !== 'undefined' &&
        !!navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function' &&
        window.isSecureContext !== false;

      if (canUseClipboard) {
        await navigator.clipboard.writeText(text);
        setCopiedAt(Date.now());
        return { ok: true };
      }

      // Clipboard unavailable — fall back to download so the coach still gets the data.
      const filename = filenameFromResponse(
        response,
        `${slugify(athleteName)}.md`,
      );
      triggerBlobDownload(new Blob([text], { type: 'text/markdown' }), filename);
      return { ok: true, clipboardFallback: true };
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to copy export');
      onError?.(error);
      return { ok: false };
    } finally {
      setIsCopying(false);
    }
  }, [athleteId, athleteName, onError]);

  const download = useCallback(
    async (format: LlmExportFormat): Promise<boolean> => {
      setIsDownloading(true);
      try {
        const response = await fetchExport(athleteId, format);
        const blob = await response.blob();
        const ext = format === 'markdown' ? 'md' : 'json';
        const fallback = `${slugify(athleteName)}.${ext}`;
        const filename = filenameFromResponse(response, fallback);
        triggerBlobDownload(blob, filename);
        return true;
      } catch (err) {
        const error =
          err instanceof Error ? err : new Error('Failed to download export');
        onError?.(error);
        return false;
      } finally {
        setIsDownloading(false);
      }
    },
    [athleteId, athleteName, onError],
  );

  return { copy, download, isCopying, isDownloading, copiedAt };
}
