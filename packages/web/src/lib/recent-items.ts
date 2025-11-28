/**
 * Recent items tracking for command palette
 * Stores the last 5 accessed items in localStorage
 */

export interface RecentItem {
  type: 'athlete' | 'team';
  id: string;
  name: string;
  subtitle?: string;
  timestamp: number;
}

const STORAGE_KEY = 'command-palette-recent';
const MAX_RECENT_ITEMS = 5;

/**
 * Get recent items from localStorage
 */
export function getRecentItems(): RecentItem[] {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (!stored) return [];

    const items = JSON.parse(stored) as RecentItem[];
    // Sort by timestamp (most recent first)
    return items.sort((a, b) => b.timestamp - a.timestamp).slice(0, MAX_RECENT_ITEMS);
  } catch (error) {
    console.error('Error reading recent items:', error);
    return [];
  }
}

/**
 * Add an item to recent items
 */
export function addRecentItem(item: Omit<RecentItem, 'timestamp'>): void {
  try {
    const items = getRecentItems();

    // Remove existing item with same id and type (to avoid duplicates)
    const filtered = items.filter((i) => !(i.id === item.id && i.type === item.type));

    // Add new item at the beginning
    const newItems: RecentItem[] = [
      {
        ...item,
        timestamp: Date.now(),
      },
      ...filtered,
    ].slice(0, MAX_RECENT_ITEMS);

    localStorage.setItem(STORAGE_KEY, JSON.stringify(newItems));
  } catch (error) {
    console.error('Error saving recent item:', error);
  }
}

/**
 * Clear all recent items
 */
export function clearRecentItems(): void {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch (error) {
    console.error('Error clearing recent items:', error);
  }
}
