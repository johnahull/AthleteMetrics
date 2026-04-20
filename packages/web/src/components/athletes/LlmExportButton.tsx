/**
 * LlmExportButton — split-button that exports an athlete's data for LLMs.
 *
 *   Primary action (left half): Copy Markdown to clipboard.
 *     → On success the label swaps to "Copied ✓" for ~1.5s, then reverts.
 *     → On clipboard unavailability it auto-falls back to a Markdown download
 *       and shows "Couldn't copy — downloaded instead" briefly.
 *
 *   Secondary (right half): dropdown with explicit Markdown / JSON downloads.
 *
 * Visibility is decided by the parent (coaches/site-admin see it on any athlete
 * in their org; athletes see it on their own profile). We do not render
 * disabled teasers for unauthorized viewers.
 */

import { useEffect, useRef, useState } from 'react';
import {
  Sparkles,
  Check,
  AlertCircle,
  Loader2,
  ChevronDown,
  FileText,
  FileJson,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { cn } from '@/lib/utils';
import { useLlmExport } from '@/hooks/use-llm-export';
import { useToast } from '@/hooks/use-toast';

interface LlmExportButtonProps {
  athleteId: string;
  athleteName?: string | null;
  className?: string;
}

type UiState = 'idle' | 'loading' | 'copied' | 'fallback' | 'error';

const CONFIRMATION_MS = 1500;

export function LlmExportButton({
  athleteId,
  athleteName,
  className,
}: LlmExportButtonProps) {
  const { toast } = useToast();
  const [state, setState] = useState<UiState>('idle');
  const revertTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  const { copy, download, isDownloading } = useLlmExport({
    athleteId,
    athleteName,
    onError: (err) => {
      toast({
        variant: 'destructive',
        title: 'Export failed',
        description: err.message || 'Please try again.',
      });
    },
  });

  // Clear any pending revert timer on unmount to avoid setState-after-unmount.
  useEffect(() => {
    return () => {
      if (revertTimer.current) clearTimeout(revertTimer.current);
    };
  }, []);

  const scheduleRevert = () => {
    if (revertTimer.current) clearTimeout(revertTimer.current);
    revertTimer.current = setTimeout(() => setState('idle'), CONFIRMATION_MS);
  };

  const handleCopy = async () => {
    setState('loading');
    const result = await copy();
    if (!result.ok) {
      setState('error');
      scheduleRevert();
      return;
    }
    setState(result.clipboardFallback ? 'fallback' : 'copied');
    scheduleRevert();
  };

  const handleDownload = async (format: 'markdown' | 'json') => {
    const ok = await download(format);
    if (ok) {
      toast({
        title:
          format === 'markdown' ? 'Markdown downloaded' : 'JSON downloaded',
        description: 'Ready to paste into your LLM of choice.',
      });
    }
  };

  const {
    Icon,
    label,
    iconClass,
    disabled,
  }: {
    Icon: typeof Sparkles;
    label: string;
    iconClass?: string;
    disabled?: boolean;
  } = (() => {
    switch (state) {
      case 'loading':
        return { Icon: Loader2, label: 'Preparing…', iconClass: 'animate-spin', disabled: true };
      case 'copied':
        return { Icon: Check, label: 'Copied ✓', iconClass: 'text-green-600' };
      case 'fallback':
        return {
          Icon: AlertCircle,
          label: "Couldn't copy — downloaded instead",
          iconClass: 'text-amber-600',
        };
      case 'error':
        return {
          Icon: AlertCircle,
          label: "Couldn't copy — try download",
          iconClass: 'text-red-500',
        };
      default:
        return { Icon: Sparkles, label: 'Copy for LLM' };
    }
  })();

  return (
    <div
      className={cn('inline-flex rounded-md shadow-sm', className)}
      role="group"
      aria-label="Export athlete data for LLM"
    >
      <Button
        type="button"
        variant="outline"
        className="rounded-r-none border-r-0"
        disabled={disabled}
        onClick={handleCopy}
        aria-label="Copy athlete performance data to clipboard for use with an LLM"
        data-testid="llm-export-copy"
      >
        <Icon className={cn('h-4 w-4 mr-2', iconClass)} />
        <span aria-live="polite">{label}</span>
      </Button>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button
            type="button"
            variant="outline"
            className="rounded-l-none px-2"
            aria-label="Other export formats"
            data-testid="llm-export-menu"
            disabled={isDownloading}
          >
            <ChevronDown className="h-4 w-4" />
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end">
          <DropdownMenuItem
            onClick={() => handleDownload('markdown')}
            data-testid="llm-export-download-markdown"
          >
            <FileText className="h-4 w-4 mr-2" />
            Download as Markdown (.md)
          </DropdownMenuItem>
          <DropdownMenuItem
            onClick={() => handleDownload('json')}
            data-testid="llm-export-download-json"
          >
            <FileJson className="h-4 w-4 mr-2" />
            Download as JSON (.json)
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}
