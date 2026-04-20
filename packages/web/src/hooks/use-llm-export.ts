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
  isDownloading: boolean;
}

const EXPORT_URL = (athleteId: string, format: LlmExportFormat) =>
  `/api/athletes/${athleteId}/llm-export?format=${format}`;

const SLUG_FALLBACK = 'athlete';

function slugify(name: string | null | undefined): string {
  if (!name) return SLUG_FALLBACK;
  const withoutDiacritics = name
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '');
  // Keep this in sync with `filenameFor` in
  // packages/api/services/llm-export-service.ts: pipes are stripped
  // *without* replacement (so `a|b` → `ab`, not `a-b`) before the generic
  // non-alphanumeric collapse. This matters because the server populates
  // `Content-Disposition` with its slug, and if the clipboard-fallback
  // path runs, we want the client-generated filename to match byte-for-byte.
  const withoutPipes = withoutDiacritics.replace(/\|/g, '');
  return (
    withoutPipes
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, '-')
      .replace(/^-+|-+$/g, '') || SLUG_FALLBACK
  );
}

/**
 * Format today's date in ISO yyyy-mm-dd (UTC) to match the server's
 * `filenameFor` output. Clipboard-fallback downloads go through the client's
 * fallback path rather than surfacing `Content-Disposition`, so we mirror the
 * server's filename convention exactly to keep artifacts consistent.
 */
function todayIsoUtc(): string {
  const now = new Date();
  const yyyy = now.getUTCFullYear();
  const mm = String(now.getUTCMonth() + 1).padStart(2, '0');
  const dd = String(now.getUTCDate()).padStart(2, '0');
  return `${yyyy}-${mm}-${dd}`;
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
  const [isDownloading, setIsDownloading] = useState(false);

  const copy = useCallback(async (): Promise<CopyResult> => {
    try {
      const response = await fetchExport(athleteId, 'markdown');
      const text = await response.text();

      const canUseClipboard =
        typeof navigator !== 'undefined' &&
        !!navigator.clipboard &&
        typeof navigator.clipboard.writeText === 'function' &&
        window.isSecureContext;

      if (canUseClipboard) {
        await navigator.clipboard.writeText(text);
        return { ok: true };
      }

      // Clipboard unavailable — fall back to download so the coach still gets the data.
      const filename = filenameFromResponse(
        response,
        `${slugify(athleteName)}-${todayIsoUtc()}.md`,
      );
      triggerBlobDownload(new Blob([text], { type: 'text/markdown' }), filename);
      return { ok: true, clipboardFallback: true };
    } catch (err) {
      const error =
        err instanceof Error ? err : new Error('Failed to copy export');
      onError?.(error);
      return { ok: false };
    }
  }, [athleteId, athleteName, onError]);

  const download = useCallback(
    async (format: LlmExportFormat): Promise<boolean> => {
      setIsDownloading(true);
      try {
        const response = await fetchExport(athleteId, format);
        const blob = await response.blob();
        const ext = format === 'markdown' ? 'md' : 'json';
        const fallback = `${slugify(athleteName)}-${todayIsoUtc()}.${ext}`;
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

  return { copy, download, isDownloading };
}
