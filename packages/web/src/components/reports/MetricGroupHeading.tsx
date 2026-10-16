import type { ReactNode } from 'react';
import type { MetricGroup } from '@shared/metric-order';
import { TableHead, TableRow } from '@/components/ui/table';
import { groupedCodes } from '@/lib/metric-groups';

/** Heading row for one metric group inside its own <TableBody>. Renders nothing for an unlabelled group. */
export function MetricGroupRowHeading({ label, colSpan }: { label: string | null; colSpan: number }) {
  if (!label) return null;
  return (
    <TableRow className="hover:bg-transparent">
      <TableHead scope="rowgroup" colSpan={colSpan} className="h-8 bg-muted/50 text-xs font-semibold uppercase tracking-wide text-muted-foreground">
        {label}
      </TableHead>
    </TableRow>
  );
}

/** Heading above a run of charts / cards of one metric group. Keep it OUTSIDE captured chart nodes. */
export function MetricGroupHeading({ label }: { label: string | null }) {
  if (!label) return null;
  return <h4 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h4>;
}

/**
 * Renders `render(code)` for each code, wrapped per metric group with a heading. The wrapper carries
 * data-metric-group so PDF capture can tell which group a chart belongs to; the heading is a sibling of the
 * captured chart nodes, never inside one.
 */
export function MetricGroupBlocks({
  codes,
  metricGroups,
  className,
  render,
}: {
  codes: string[];
  metricGroups?: MetricGroup[];
  className?: string;
  render: (code: string) => ReactNode;
}) {
  return (
    <>
      {groupedCodes(codes, metricGroups).map((g) => (
        <div
          key={g.group ?? 'all'}
          data-metric-group={g.group ?? undefined}
          data-metric-group-label={g.label ?? undefined}
          className={className}
        >
          <MetricGroupHeading label={g.label} />
          {g.codes.map(render)}
        </div>
      ))}
    </>
  );
}
