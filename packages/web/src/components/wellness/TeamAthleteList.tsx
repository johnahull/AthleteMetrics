import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSortableTable } from '@/hooks/use-sortable-table.tsx';
import { format } from 'date-fns';
import { StatusDot } from './ui/WellnessUIComponents';
import { getFreshness, formatLastEntry } from '@/utils/wellness-analytics';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';
import { AlertTriangle } from 'lucide-react';
import type { AthleteLastEntry, EarlierEntry } from '@/hooks/use-wellness-dashboard';

interface Athlete {
  id: string;
  name: string;
  status: 'red' | 'yellow' | 'green';
  score: number | null;
  injuries: { x: number; y: number; label?: string }[];
  lastSubmission: Date;
  earlierEntries?: EarlierEntry[];
}

interface TeamAthleteListProps {
  athletes: Athlete[];
  /** Every roster athlete's latest entry; athletes missing from `athletes` are listed without a status */
  lastEntries?: AthleteLastEntry[];
  onAthleteClick?: (athleteId: string) => void;
}

const formatTime = (date: string) =>
  new Intl.DateTimeFormat('en-US', { month: 'short', day: 'numeric', hour: 'numeric', minute: '2-digit' }).format(new Date(date));

/** "Edited" marker for an athlete who resubmitted the day: the earlier entries stay visible to the coach */
function EditedMarker({ name, entries }: { name: string; entries: EarlierEntry[] }) {
  const hadPain = entries.some(e => e.painAreas.length > 0);
  // Popover content is portalled, but React events still bubble to the row: keep the row click out
  const stop = (e: React.SyntheticEvent) => e.stopPropagation();
  return (
    <Popover>
      <PopoverTrigger asChild>
        <button
          type="button"
          onClick={stop}
          className={`mt-1 inline-flex max-w-full items-start gap-1 rounded-md border px-1.5 py-0.5 text-left text-xs font-medium focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring ${
            hadPain ? 'border-amber-300 bg-amber-50 text-amber-900' : 'border-gray-300 bg-gray-50 text-gray-700'
          }`}
        >
          {hadPain && <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden="true" />}
          {hadPain ? (
            <span>
              <span className="whitespace-nowrap">Edited ·</span> earlier pain report
            </span>
          ) : (
            'Edited'
          )}
          <span className="sr-only">
            , show {entries.length === 1 ? 'the earlier entry' : `${entries.length} earlier entries`} for {name}
          </span>
        </button>
      </PopoverTrigger>
      <PopoverContent
        aria-label={`Earlier entries for ${name}`}
        align="start"
        collisionPadding={16}
        className="w-72 max-w-[calc(100vw-2rem)] p-3"
        onClick={stop}
      >
        <p className="text-sm font-medium">Earlier entries this day</p>
        <p className="mb-2 text-xs text-gray-500">Replaced by a later entry; not counted in scores.</p>
        {/* Focusable so a long list can be scrolled from the keyboard */}
        <ul
          className="max-h-72 space-y-3 overflow-y-auto rounded-sm p-1 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
          tabIndex={0}
        >
          {entries.map(entry => (
            <li key={entry.id} className="border-t pt-2 text-sm first:border-t-0 first:pt-0">
              <p className="font-medium">Submitted {formatTime(entry.submittedAt)}</p>
              <p className={entry.painAreas.length > 0 ? 'text-amber-900' : 'text-gray-600'}>
                {entry.painAreas.length > 0 ? (
                  <>Pain: {entry.painAreas.map((area, i) => <span key={i}>{i > 0 && ', '}{area}</span>)}</>
                ) : (
                  'No pain reported'
                )}
              </p>
              {entry.answers.length > 0 && (
                <dl className="mt-1 space-y-1 text-xs">
                  {entry.answers.map((answer, i) => (
                    <div key={i}>
                      <dt className="break-words text-gray-600">{answer.label}</dt>
                      <dd className="break-words font-medium">{answer.value}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </li>
          ))}
        </ul>
      </PopoverContent>
    </Popover>
  );
}

const statusConfig = {
  red: { label: 'Red' },
  yellow: { label: 'Yellow' },
  green: { label: 'Green' },
};

export default function TeamAthleteList({ athletes, lastEntries = [], onAthleteClick }: TeamAthleteListProps) {
  // Transform athlete data to include sortable status priority
  const athletesWithPriority = useMemo(() => {
    const statusOrder = { red: 0, yellow: 1, green: 2, none: 3 };
    const today = format(new Date(), 'yyyy-MM-dd');
    const entryById = new Map(lastEntries.map(e => [e.userId, e]));
    const lastEntryText = (id: string) => {
      const entry = entryById.get(id);
      return entry ? formatLastEntry(getFreshness(entry.lastDate, today).daysAgo) : null;
    };

    const withStatus = athletes.map(athlete => ({
      ...athlete,
      statusLabel: statusConfig[athlete.status].label,
      lastSubmission: athlete.lastSubmission as Date | null,
      lastEntryText: lastEntryText(athlete.id),
    }));
    // Roster athletes with no entry on the selected date: grey, never red/yellow/green
    const withoutStatus = lastEntries
      .filter(e => !athletes.some(a => a.id === e.userId))
      .map(e => ({
        id: e.userId,
        name: e.name ?? 'Unknown athlete',
        status: 'none' as const,
        statusLabel: getFreshness(e.lastDate, today).isStale ? 'No recent data' : 'Not submitted',
        score: null,
        injuries: [],
        lastSubmission: e.lastSubmittedAt ? new Date(e.lastSubmittedAt) : null,
        lastEntryText: lastEntryText(e.userId),
      }));

    return [...withStatus, ...withoutStatus].map(athlete => ({
      ...athlete,
      statusPriority: statusOrder[athlete.status],
      lastSubmissionTime: athlete.lastSubmission ? new Date(athlete.lastSubmission).getTime() : 0,
    }));
  }, [athletes, lastEntries]);

  // Use sortable table hook with status as default sort
  const { sortedData: sortedAthletes, handleSort, SortIcon } = useSortableTable(athletesWithPriority, {
    defaultSortField: 'statusPriority',
    defaultSortDirection: 'asc',
  });

  const formatDate = (date: Date) => {
    return new Intl.DateTimeFormat('en-US', {
      month: 'short',
      day: 'numeric',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(date));
  };

  if (athletesWithPriority.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No athletes found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto -mx-6 px-6 md:mx-0 md:px-0">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer text-xs sm:text-sm" onClick={() => handleSort('statusPriority')}>
              Status <SortIcon field="statusPriority" />
            </TableHead>
            <TableHead className="cursor-pointer text-xs sm:text-sm" onClick={() => handleSort('name')}>
              Athlete <SortIcon field="name" />
            </TableHead>
            <TableHead className="cursor-pointer text-xs sm:text-sm" onClick={() => handleSort('score')}>
              Score <SortIcon field="score" />
            </TableHead>
            <TableHead className="hidden md:table-cell text-xs sm:text-sm">Injuries</TableHead>
            <TableHead className="hidden lg:table-cell cursor-pointer text-xs sm:text-sm" onClick={() => handleSort('lastSubmissionTime')}>
              Last Submission <SortIcon field="lastSubmissionTime" />
            </TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {sortedAthletes.map((athlete) => (
            <TableRow
              key={athlete.id}
              className={onAthleteClick ? 'cursor-pointer hover:bg-gray-50' : ''}
              onClick={() => onAthleteClick?.(athlete.id)}
            >
              <TableCell>
                <div className="flex items-center gap-2">
                  <StatusDot status={athlete.status} label={athlete.statusLabel} />
                  <span className={`text-sm ${athlete.status === 'none' ? 'text-gray-500' : ''}`}>{athlete.statusLabel}</span>
                </div>
                {athlete.lastEntryText && (
                  <p className="text-xs text-gray-500 mt-0.5">{athlete.lastEntryText}</p>
                )}
              </TableCell>
              <TableCell className="font-medium">
                {athlete.name}
                {'earlierEntries' in athlete && athlete.earlierEntries && athlete.earlierEntries.length > 0 && (
                  <div>
                    <EditedMarker name={athlete.name} entries={athlete.earlierEntries} />
                  </div>
                )}
              </TableCell>
              <TableCell>{athlete.score !== null ? athlete.score.toFixed(1) : 'N/A'}</TableCell>
              <TableCell className="hidden md:table-cell">
                {athlete.injuries.length > 0 ? (
                  <span className="text-sm">
                    {athlete.injuries.map(i => i.label).filter(Boolean).join(', ') || 'Unlabeled'}
                  </span>
                ) : (
                  <span className="text-sm text-gray-500">None</span>
                )}
              </TableCell>
              <TableCell className="hidden lg:table-cell text-sm text-gray-600">
                {athlete.lastSubmission ? formatDate(athlete.lastSubmission) : '—'}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
