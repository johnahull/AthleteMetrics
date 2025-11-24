import { useState } from 'react';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { ArrowUpDown } from 'lucide-react';

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

type SortField = 'name' | 'status' | 'score' | 'lastSubmission';
type SortDirection = 'asc' | 'desc';

export default function TeamAthleteList({ athletes, onAthleteClick }: TeamAthleteListProps) {
  const [sortField, setSortField] = useState<SortField>('status');
  const [sortDirection, setSortDirection] = useState<SortDirection>('asc');

  const statusOrder = { red: 0, yellow: 1, green: 2 };

  const sortedAthletes = [...athletes].sort((a, b) => {
    let comparison = 0;

    switch (sortField) {
      case 'status':
        comparison = statusOrder[a.status] - statusOrder[b.status];
        break;
      case 'name':
        comparison = a.name.localeCompare(b.name);
        break;
      case 'score':
        comparison = (a.score || 0) - (b.score || 0);
        break;
      case 'lastSubmission':
        comparison = new Date(a.lastSubmission).getTime() - new Date(b.lastSubmission).getTime();
        break;
    }

    return sortDirection === 'asc' ? comparison : -comparison;
  });

  const handleSort = (field: SortField) => {
    if (sortField === field) {
      setSortDirection(sortDirection === 'asc' ? 'desc' : 'asc');
    } else {
      setSortField(field);
      setSortDirection('asc');
    }
  };

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
    red: { label: 'Red', dotClass: 'bg-red-500' },
    yellow: { label: 'Yellow', dotClass: 'bg-yellow-500' },
    green: { label: 'Green', dotClass: 'bg-green-500' },
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
            <TableHead className="cursor-pointer" onClick={() => handleSort('status')}>
              <div className="flex items-center gap-1">
                Status <ArrowUpDown className="w-3 h-3" />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('name')}>
              <div className="flex items-center gap-1">
                Athlete <ArrowUpDown className="w-3 h-3" />
              </div>
            </TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('score')}>
              <div className="flex items-center gap-1">
                Score <ArrowUpDown className="w-3 h-3" />
              </div>
            </TableHead>
            <TableHead>Injuries</TableHead>
            <TableHead className="cursor-pointer" onClick={() => handleSort('lastSubmission')}>
              <div className="flex items-center gap-1">
                Last Submission <ArrowUpDown className="w-3 h-3" />
              </div>
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
                  <div className={`w-3 h-3 rounded-full ${statusConfig[athlete.status].dotClass}`} />
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
