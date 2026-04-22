import { useId, useState, type ReactNode } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { ChevronDown } from 'lucide-react';
import type { MetricExplanation } from '@shared/metric-explanations';
import { cn } from '@/lib/utils';

interface AthleteMetricExplanationProps {
  code: string;
  explanation: MetricExplanation | undefined;
  /** Human-readable label to show when the explanation hasn't loaded yet. */
  fallbackLabel?: string;
  /** Classes applied to the metric title element. */
  titleClassName?: string;
  /** Optional node rendered inline to the right of the title (e.g., a badge). */
  titleSuffix?: ReactNode;
  /** When true, renders a compact variant (used inline in tables/rows). */
  compact?: boolean;
  className?: string;
}

export function AthleteMetricExplanation({
  code,
  explanation,
  fallbackLabel,
  titleClassName,
  titleSuffix,
  compact = false,
  className,
}: AthleteMetricExplanationProps) {
  const [open, setOpen] = useState(false);
  const reactId = useId();
  const panelId = `athlete-metric-panel-${reactId}`;

  const title = explanation?.title ?? fallbackLabel ?? code;
  const shortDescription = explanation?.shortDescription;

  return (
    <div className={cn('flex flex-col', compact ? 'gap-0.5' : 'gap-1.5', className)}>
      <div className="flex items-center gap-2">
        <span
          className={cn(
            compact ? 'text-sm font-semibold' : 'text-lg font-semibold',
            titleClassName,
          )}
        >
          {title}
        </span>
        {titleSuffix}
      </div>

      {shortDescription && (
        <p
          data-testid="athlete-metric-short-description"
          className={cn(
            'text-slate-600 leading-snug',
            compact ? 'text-xs' : 'text-sm',
          )}
        >
          {shortDescription}
        </p>
      )}

      {explanation && (
        <>
          <button
            type="button"
            onClick={() => setOpen((v) => !v)}
            aria-expanded={open}
            aria-controls={panelId}
            className={cn(
              'inline-flex items-center gap-1 self-start rounded-sm font-medium text-blue-700',
              'underline decoration-dotted underline-offset-4 decoration-blue-400/60',
              'hover:text-blue-800 hover:decoration-blue-500 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring',
              compact ? 'text-xs' : 'text-sm',
              compact ? 'mt-0.5' : 'mt-1',
            )}
            data-testid="athlete-metric-learn-more"
          >
            {open ? 'Show less' : 'What is this?'}
            <ChevronDown
              className={cn(
                'h-3.5 w-3.5 transition-transform',
                open ? 'rotate-180' : 'rotate-0',
              )}
              aria-hidden="true"
            />
          </button>

          {open && (
            <div
              id={panelId}
              data-testid="athlete-metric-panel"
              className={cn(
                'mt-2 rounded-md border-l-2 border-l-blue-400/70 border-y border-r border-blue-100/80',
                'bg-gradient-to-br from-blue-50/60 via-white to-white p-3 space-y-3 shadow-sm',
                compact ? 'text-xs' : 'text-sm',
              )}
            >
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <p className="font-semibold text-slate-900 mb-1 tracking-tight">What it measures</p>
                <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                  {explanation.whatItMeasures}
                </ReactMarkdown>
                <p className="font-semibold text-slate-900 mt-3 mb-1 tracking-tight">Why it matters</p>
                <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                  {explanation.whyItMatters}
                </ReactMarkdown>
              </div>
              {explanation.unitNote && (
                <p className="text-xs italic text-slate-500 border-t border-blue-100/60 pt-2">
                  {explanation.unitNote}
                </p>
              )}
            </div>
          )}
        </>
      )}
    </div>
  );
}
