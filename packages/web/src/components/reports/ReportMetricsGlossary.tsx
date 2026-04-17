import { useId } from 'react';
import ReactMarkdown from 'react-markdown';
import rehypeSanitize from 'rehype-sanitize';
import { BookOpen } from 'lucide-react';
import { Card, CardContent, CardHeader } from '@/components/ui/card';
import type { MetricExplanation } from '@shared/metric-explanations';

interface ReportMetricsGlossaryProps {
  explanations: Record<string, MetricExplanation>;
  metricOrder?: string[];
}

export function ReportMetricsGlossary({ explanations, metricOrder }: ReportMetricsGlossaryProps) {
  const headingId = useId();
  const codes = [...new Set(metricOrder?.filter((c) => explanations[c]) ?? Object.keys(explanations))];

  if (codes.length === 0) {
    return null;
  }

  return (
    <section aria-labelledby={headingId}>
      <Card className="mt-6">
        <CardHeader>
          <h2
            id={headingId}
            className="flex items-center gap-2 text-lg font-semibold leading-none tracking-tight"
          >
            <BookOpen className="h-5 w-5" aria-hidden="true" />
            Glossary of metrics
          </h2>
        </CardHeader>
        <CardContent className="space-y-6">
        {codes.map((code) => {
          const entry = explanations[code];
          return (
            <div key={code} className="space-y-2">
              <h3 className="text-base font-semibold">{entry.title}</h3>
              <p className="text-sm text-muted-foreground">{entry.shortDescription}</p>
              <div className="prose prose-sm max-w-none dark:prose-invert">
                <p className="font-medium text-foreground">What it measures</p>
                <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                  {entry.whatItMeasures}
                </ReactMarkdown>
                <p className="font-medium text-foreground">Why it matters</p>
                <ReactMarkdown rehypePlugins={[rehypeSanitize]}>
                  {entry.whyItMatters}
                </ReactMarkdown>
              </div>
              <p className="text-xs italic text-muted-foreground">{entry.unitNote}</p>
            </div>
          );
        })}
        </CardContent>
      </Card>
    </section>
  );
}
