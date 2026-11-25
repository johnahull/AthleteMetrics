import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSortableTable } from '@/hooks/use-sortable-table.tsx';
import { format } from 'date-fns';
import { StatusDot } from './ui/WellnessUIComponents';
import { getFreshness, formatLastEntry } from '@/utils/wellness-analytics';
import type { AthleteLastEntry } from '@/hooks/use-wellness-dashboard';

interface Athlete {
  id: string;
  name: string;
  status: 'red' | 'yellow' | 'green';
  score: number | null;
  injuries: { x: number; y: number; label?: string }[];
  lastSubmission: Date;
}

interface TeamAthleteListProps {
  athletes: Athlete[];
  /** Every roster athlete's latest entry; athletes missing from `athletes` are listed without a status */
  lastEntries?: AthleteLastEntry[];
  onAthleteClick?: (athleteId: string) => void;
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
              <TableCell className="font-medium">{athlete.name}</TableCell>
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
