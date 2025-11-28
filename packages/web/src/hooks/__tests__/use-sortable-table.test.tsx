import { renderHook, act } from '@testing-library/react';
import { render } from '@testing-library/react';
import { describe, it, expect } from 'vitest';
import { useSortableTable } from '../use-sortable-table.tsx';

describe('useSortableTable', () => {
  describe('Initial state', () => {
    it('should return unsorted data when no default sort is provided', () => {
      const data = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      expect(result.current.sortedData).toEqual(data);
      expect(result.current.sortField).toBeUndefined();
      expect(result.current.sortDirection).toBe('asc');
    });

    it('should apply default sort field and direction', () => {
      const data = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];

      const { result } = renderHook(() =>
        useSortableTable(data, {
          defaultSortField: 'name',
          defaultSortDirection: 'desc',
        })
      );

      expect(result.current.sortField).toBe('name');
      expect(result.current.sortDirection).toBe('desc');
      expect(result.current.sortedData[0].name).toBe('Charlie');
      expect(result.current.sortedData[2].name).toBe('Alice');
    });
  });

  describe('String sorting', () => {
    it('should sort strings in ascending order', () => {
      const data = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('name');
      });

      expect(result.current.sortDirection).toBe('asc');
      expect(result.current.sortedData.map((d) => d.name)).toEqual([
        'Alice',
        'Bob',
        'Charlie',
      ]);
    });

    it('should sort strings in descending order when toggled', () => {
      const data = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('name');
      });

      act(() => {
        result.current.handleSort('name');
      });

      expect(result.current.sortDirection).toBe('desc');
      expect(result.current.sortedData.map((d) => d.name)).toEqual([
        'Charlie',
        'Bob',
        'Alice',
      ]);
    });
  });

  describe('Numeric sorting', () => {
    it('should sort numbers in ascending order', () => {
      const data = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('age');
      });

      expect(result.current.sortedData.map((d) => d.age)).toEqual([25, 30, 35]);
    });

    it('should sort numbers in descending order when toggled', () => {
      const data = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('age');
      });

      act(() => {
        result.current.handleSort('age');
      });

      expect(result.current.sortedData.map((d) => d.age)).toEqual([35, 30, 25]);
    });
  });

  describe('Field switching', () => {
    it('should reset to ascending when switching to a new field', () => {
      const data = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      // Sort by name descending
      act(() => {
        result.current.handleSort('name');
      });
      act(() => {
        result.current.handleSort('name');
      });

      expect(result.current.sortDirection).toBe('desc');

      // Switch to age - should reset to asc
      act(() => {
        result.current.handleSort('age');
      });

      expect(result.current.sortField).toBe('age');
      expect(result.current.sortDirection).toBe('asc');
      expect(result.current.sortedData.map((d) => d.age)).toEqual([25, 30, 35]);
    });
  });

  describe('Null and undefined handling', () => {
    it('should push null values to the end when sorting ascending', () => {
      const data = [
        { name: 'Charlie', score: 30 },
        { name: 'Alice', score: null as number | null },
        { name: 'Bob', score: 35 },
        { name: 'David', score: 25 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('score');
      });

      expect(result.current.sortedData.map((d) => d.name)).toEqual([
        'David',
        'Charlie',
        'Bob',
        'Alice',
      ]);
    });

    it('should push null values to the end when sorting descending', () => {
      const data = [
        { name: 'Charlie', score: 30 },
        { name: 'Alice', score: null as number | null },
        { name: 'Bob', score: 35 },
        { name: 'David', score: 25 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('score');
      });

      act(() => {
        result.current.handleSort('score');
      });

      expect(result.current.sortedData.map((d) => d.name)).toEqual([
        'Bob',
        'Charlie',
        'David',
        'Alice',
      ]);
    });

    it('should push undefined values to the end', () => {
      const data = [
        { name: 'Charlie', score: 30 },
        { name: 'Alice', score: undefined as number | undefined },
        { name: 'Bob', score: 35 },
        { name: 'David', score: 25 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('score');
      });

      expect(result.current.sortedData.map((d) => d.name)).toEqual([
        'David',
        'Charlie',
        'Bob',
        'Alice',
      ]);
    });
  });

  describe('Empty data handling', () => {
    it('should handle empty array', () => {
      const data: Array<{ name: string; age: number }> = [];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('name');
      });

      expect(result.current.sortedData).toEqual([]);
    });
  });

  describe('SortIcon component', () => {
    it('should render null for inactive field', () => {
      const data = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('name');
      });

      const { container } = render(
        <result.current.SortIcon field="age" />
      );

      expect(container.firstChild).toBeNull();
    });

    it('should render ChevronUp for ascending sort', () => {
      const data = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('name');
      });

      const { container } = render(
        <result.current.SortIcon field="name" />
      );

      // Check for ChevronUp icon (should have an svg element)
      expect(container.querySelector('svg')).toBeTruthy();
    });

    it('should render ChevronDown for descending sort', () => {
      const data = [
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 30 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('name');
      });

      act(() => {
        result.current.handleSort('name');
      });

      const { container } = render(
        <result.current.SortIcon field="name" />
      );

      // Check for ChevronDown icon (should have an svg element)
      expect(container.querySelector('svg')).toBeTruthy();
    });
  });

  describe('Stable sort', () => {
    it('should maintain original order for equal values', () => {
      const data = [
        { name: 'Charlie', age: 30, id: 1 },
        { name: 'Alice', age: 30, id: 2 },
        { name: 'Bob', age: 30, id: 3 },
      ];

      const { result } = renderHook(() => useSortableTable(data));

      act(() => {
        result.current.handleSort('age');
      });

      // All have same age, should maintain original order
      expect(result.current.sortedData.map((d) => d.id)).toEqual([1, 2, 3]);
    });
  });

  describe('Data updates', () => {
    it('should re-sort when data changes', () => {
      const initialData = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
      ];

      const { result, rerender } = renderHook(
        ({ data }) => useSortableTable(data),
        { initialProps: { data: initialData } }
      );

      act(() => {
        result.current.handleSort('name');
      });

      expect(result.current.sortedData.map((d) => d.name)).toEqual([
        'Alice',
        'Charlie',
      ]);

      // Update data
      const newData = [
        { name: 'Charlie', age: 30 },
        { name: 'Alice', age: 25 },
        { name: 'Bob', age: 35 },
      ];

      rerender({ data: newData });

      // Should still be sorted by name
      expect(result.current.sortedData.map((d) => d.name)).toEqual([
        'Alice',
        'Bob',
        'Charlie',
      ]);
    });
  });
});
