import { useId, useState } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { ChevronDown, Info } from 'lucide-react';
import type { MetricExplanation as MetricExplanationData } from '@shared/metric-explanations';
import { cn } from '@/lib/utils';

interface MetricExplanationProps {
  label: string;
  explanation: MetricExplanationData | undefined;
  className?: string;
}

export function MetricExplanation({ label, explanation, className }: MetricExplanationProps) {
  const [open, setOpen] = useState(false);
  const reactId = useId();

  if (!explanation) {
    return <span className={className}>{label}</span>;
  }

  const contentId = `metric-explanation-${reactId}`;

  return (
    <div className={cn('flex flex-col gap-1', className)}>
      <div className="flex items-center gap-1.5">
        <span className="font-medium">{label}</span>
        <button
          type="button"
          onClick={() => setOpen((v) => !v)}
          aria-expanded={open}
          aria-controls={contentId}
          aria-label={`Explanation for ${explanation.title}`}
          className="inline-flex items-center justify-center rounded-sm text-muted-foreground hover:text-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
        >
          <Info className="h-3.5 w-3.5" aria-hidden="true" />
          <ChevronDown
            className={cn(
              'h-3 w-3 transition-transform',
              open ? 'rotate-180' : 'rotate-0',
            )}
            aria-hidden="true"
          />
        </button>
      </div>
      {open && (
        <div
          id={contentId}
          className="text-sm text-muted-foreground bg-muted/40 rounded-md p-3 space-y-2"
        >
          <div className="prose prose-sm max-w-none dark:prose-invert">
            <p className="font-semibold text-foreground">{explanation.shortDescription}</p>
            <div>
              <p className="font-medium text-foreground mb-1">What it measures</p>
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                {explanation.whatItMeasures}
              </ReactMarkdown>
            </div>
            <div>
              <p className="font-medium text-foreground mb-1">Why it matters</p>
              <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                {explanation.whyItMatters}
              </ReactMarkdown>
            </div>
            <p className="text-xs italic">{explanation.unitNote}</p>
          </div>
        </div>
      )}
    </div>
  );
}
