import { describe, it, expect } from 'vitest';
import { filterToBestPerPlayer } from '../analytics-utils';

interface TestItem {
  id: string;
  playerId: string;
  value: number;
}

const getId = (item: TestItem) => item.playerId;
const getValue = (item: TestItem) => item.value;

describe('filterToBestPerPlayer', () => {
  it('should return empty array for empty input', () => {
    expect(filterToBestPerPlayer([], 'VERTICAL_JUMP', getId, getValue)).toEqual([]);
  });

  it('should return single item unchanged', () => {
    const items: TestItem[] = [{ id: '1', playerId: 'p1', value: 30 }];
    const result = filterToBestPerPlayer(items, 'VERTICAL_JUMP', getId, getValue);
    expect(result).toEqual(items);
  });

  it('should pick highest value for higher_is_better metrics', () => {
    const items: TestItem[] = [
      { id: '1', playerId: 'p1', value: 28 },
      { id: '2', playerId: 'p1', value: 32 },
      { id: '3', playerId: 'p1', value: 30 },
    ];
    const result = filterToBestPerPlayer(items, 'VERTICAL_JUMP', getId, getValue);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('should pick lowest value for lower_is_better metrics', () => {
    const items: TestItem[] = [
      { id: '1', playerId: 'p1', value: 1.15 },
      { id: '2', playerId: 'p1', value: 1.08 },
      { id: '3', playerId: 'p1', value: 1.12 },
    ];
    const result = filterToBestPerPlayer(items, 'FLY10_TIME', getId, getValue);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('2');
  });

  it('should return one result per unique player', () => {
    const items: TestItem[] = [
      { id: '1', playerId: 'p1', value: 28 },
      { id: '2', playerId: 'p1', value: 32 },
      { id: '3', playerId: 'p2', value: 25 },
      { id: '4', playerId: 'p2', value: 29 },
      { id: '5', playerId: 'p3', value: 35 },
    ];
    const result = filterToBestPerPlayer(items, 'VERTICAL_JUMP', getId, getValue);
    expect(result).toHaveLength(3);
    expect(result.map((r) => r.id).sort()).toEqual(['2', '4', '5']);
  });

  it('should handle multiple lower_is_better metrics correctly', () => {
    const items: TestItem[] = [
      { id: '1', playerId: 'p1', value: 4.55 },
      { id: '2', playerId: 'p1', value: 4.48 },
      { id: '3', playerId: 'p2', value: 4.60 },
      { id: '4', playerId: 'p2', value: 4.70 },
    ];
    const result = filterToBestPerPlayer(items, 'DASH_40YD', getId, getValue);
    expect(result).toHaveLength(2);
    expect(result.find((r) => r.playerId === 'p1')?.id).toBe('2');
    expect(result.find((r) => r.playerId === 'p2')?.id).toBe('3');
  });

  it('should keep first item when values are equal', () => {
    const items: TestItem[] = [
      { id: '1', playerId: 'p1', value: 30 },
      { id: '2', playerId: 'p1', value: 30 },
    ];
    const result = filterToBestPerPlayer(items, 'VERTICAL_JUMP', getId, getValue);
    expect(result).toHaveLength(1);
    expect(result[0].id).toBe('1');
  });
});
