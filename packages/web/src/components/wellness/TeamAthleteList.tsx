import { useMemo } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { useSortableTable } from '@/hooks/use-sortable-table.tsx';
import { StatusDot } from './ui/WellnessUIComponents';

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
  onAthleteClick?: (athleteId: string) => void;
}

export default function TeamAthleteList({ athletes, onAthleteClick }: TeamAthleteListProps) {
  // Transform athlete data to include sortable status priority
  const athletesWithPriority = useMemo(() => {
    const statusOrder = { red: 0, yellow: 1, green: 2 };
    return athletes.map(athlete => ({
      ...athlete,
      statusPriority: statusOrder[athlete.status],
      lastSubmissionTime: new Date(athlete.lastSubmission).getTime(),
    }));
  }, [athletes]);

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

  const statusConfig = {
    red: { label: 'Red' },
    yellow: { label: 'Yellow' },
    green: { label: 'Green' },
  };

  if (athletes.length === 0) {
    return (
      <div className="text-center py-8 text-gray-500">
        <p>No athletes found</p>
      </div>
    );
  }

  return (
    <div className="overflow-x-auto">
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead className="cursor-pointer" onClick={() => handleSort('statusPriority')}>
              Status <SortIcon field="statusPriority" />
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
              Athlete <SortIcon field="name" />
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('score')}>
              Score <SortIcon field="score" />
            </TableHead>
            <TableHead>Injuries</TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('lastSubmissionTime')}>
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
                  <StatusDot status={athlete.status} />
                  <span className="text-sm">{statusConfig[athlete.status].label}</span>
                </div>
              </TableCell>
              <TableCell className="font-medium">{athlete.name}</TableCell>
              <TableCell>{athlete.score !== null ? athlete.score.toFixed(1) : 'N/A'}</TableCell>
              <TableCell>
                {athlete.injuries.length > 0 ? (
                  <span className="text-sm">
                    {athlete.injuries.map(i => i.label).filter(Boolean).join(', ') || 'Unlabeled'}
                  </span>
                ) : (
                  <span className="text-sm text-gray-500">None</span>
                )}
              </TableCell>
              <TableCell className="text-sm text-gray-600">
                {formatDate(athlete.lastSubmission)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}
