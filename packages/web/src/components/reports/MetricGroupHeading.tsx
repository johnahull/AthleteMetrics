import { TableHead, TableRow } from '@/components/ui/table';

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
