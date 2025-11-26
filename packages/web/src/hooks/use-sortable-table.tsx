import { useState, useMemo } from 'react';
import { ArrowUpDown, ArrowUp, ArrowDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

interface UseSortableTableOptions {
  defaultSortField?: string;
  defaultSortDirection?: SortDirection;
}

interface SortState {
  field: string | null;
  direction: SortDirection;
}

export function useSortableTable<T extends Record<string, any>>(
  data: T[],
  options: UseSortableTableOptions = {}
) {
  const { defaultSortField, defaultSortDirection = 'asc' } = options;

  const [sortState, setSortState] = useState<SortState>({
    field: defaultSortField || null,
    direction: defaultSortDirection,
  });

  const handleSort = (field: string) => {
    setSortState((prev) => {
      if (prev.field === field) {
        // Toggle direction if same field
        return {
          field,
          direction: prev.direction === 'asc' ? 'desc' : 'asc',
        };
      }
      // New field, start with ascending
      return {
        field,
        direction: 'asc',
      };
    });
  };

  const sortedData = useMemo(() => {
    if (!sortState.field) return data;

    return [...data].sort((a, b) => {
      const aValue = a[sortState.field!];
      const bValue = b[sortState.field!];

      // Handle null/undefined values
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Compare values
      let comparison = 0;
      if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else {
        // Fallback to string comparison
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortState.direction === 'asc' ? comparison : -comparison;
    });
  }, [data, sortState]);

  const SortIcon = ({ field }: { field: string }) => {
    if (sortState.field !== field) {
      return <ArrowUpDown className="ml-2 h-4 w-4 text-muted-foreground" />;
    }
    if (sortState.direction === 'asc') {
      return <ArrowUp className="ml-2 h-4 w-4" />;
    }
    return <ArrowDown className="ml-2 h-4 w-4" />;
  };

  return {
    sortedData,
    handleSort,
    SortIcon,
    sortState,
  };
}
