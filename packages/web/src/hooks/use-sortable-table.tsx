import { useState, useMemo } from 'react';
import { ChevronUp, ChevronDown } from 'lucide-react';

export type SortDirection = 'asc' | 'desc';

interface UseSortableTableOptions<T> {
  defaultSortField?: keyof T;
  defaultSortDirection?: SortDirection;
}

interface UseSortableTableReturn<T> {
  sortedData: T[];
  sortField: keyof T | undefined;
  sortDirection: SortDirection;
  handleSort: (field: keyof T) => void;
  SortIcon: React.FC<{ field: keyof T }>;
}

export function useSortableTable<T>(
  data: T[],
  options?: UseSortableTableOptions<T>
): UseSortableTableReturn<T> {
  const [sortField, setSortField] = useState<keyof T | undefined>(
    options?.defaultSortField
  );
  const [sortDirection, setSortDirection] = useState<SortDirection>(
    options?.defaultSortDirection ?? 'asc'
  );

  const handleSort = (field: keyof T) => {
    if (sortField === field) {
      // Toggle direction for current field
      setSortDirection((prev) => (prev === 'asc' ? 'desc' : 'asc'));
    } else {
      // New field - reset to ascending
      setSortField(field);
      setSortDirection('asc');
    }
  };

  const sortedData = useMemo(() => {
    if (!sortField) {
      return data;
    }

    return [...data].sort((a, b) => {
      const aValue = a[sortField];
      const bValue = b[sortField];

      // Handle null/undefined - push to end
      if (aValue == null && bValue == null) return 0;
      if (aValue == null) return 1;
      if (bValue == null) return -1;

      // Compare values
      let comparison = 0;
      if (typeof aValue === 'number' && typeof bValue === 'number') {
        comparison = aValue - bValue;
      } else if (typeof aValue === 'string' && typeof bValue === 'string') {
        comparison = aValue.localeCompare(bValue);
      } else {
        // Fallback for other types - convert to string
        comparison = String(aValue).localeCompare(String(bValue));
      }

      return sortDirection === 'asc' ? comparison : -comparison;
    });
  }, [data, sortField, sortDirection]);

  const SortIcon: React.FC<{ field: keyof T }> = ({ field }) => {
    if (sortField !== field) {
      return null;
    }

    return sortDirection === 'asc' ? (
      <ChevronUp className="ml-1 inline h-4 w-4" />
    ) : (
      <ChevronDown className="ml-1 inline h-4 w-4" />
    );
  };

  return {
    sortedData,
    sortField,
    sortDirection,
    handleSort,
    SortIcon,
  };
}
