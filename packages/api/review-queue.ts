/**
 * Manual review queue for ambiguous athlete matches
 * In production, this would be stored in the database
 */

import { ImportReviewItem, ImportReviewQueue, ImportReviewDecision } from "@shared/import-types";

class ReviewQueueManager {
  private items: Map<string, ImportReviewItem> = new Map();

  /**
   * Add an item to the review queue
   */
  addItem(item: Omit<ImportReviewItem, 'id' | 'createdAt' | 'status'>): ImportReviewItem {
    const reviewItem: ImportReviewItem = {
      ...item,
      id: this.generateId(),
      createdAt: new Date(),
      status: 'pending'
    };
    
    this.items.set(reviewItem.id, reviewItem);
    return reviewItem;
  }

  /**
   * Get all pending review items for an organization
   */
  getPendingItems(organizationId: string): ImportReviewQueue {
    const allItems = Array.from(this.items.values());
    
    // In a real implementation, filter by organization
    const pendingItems = allItems.filter(item => item.status === 'pending');
    
    return {
      items: pendingItems.sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime()),
      totalCount: allItems.length,
      pendingCount: pendingItems.length
    };
  }

  /**
   * Get a specific review item
   */
  getItem(itemId: string): ImportReviewItem | undefined {
    return this.items.get(itemId);
  }

  /**
   * Process a review decision
   */
  processDecision(decision: ImportReviewDecision, reviewedBy: string): ImportReviewItem | null {
    const item = this.items.get(decision.itemId);
    if (!item) return null;

    const updatedItem: ImportReviewItem = {
      ...item,
      status: decision.action === 'approve' ? 'approved' : 'rejected',
      reviewedAt: new Date(),
      reviewedBy,
      reviewNotes: decision.notes
    };

    this.items.set(decision.itemId, updatedItem);
    return updatedItem;
  }

  /**
   * Clean up old review items (older than 30 days)
   */
  cleanup(): number {
    const thirtyDaysAgo = new Date();
    thirtyDaysAgo.setDate(thirtyDaysAgo.getDate() - 30);
    
    let removed = 0;
    for (const [id, item] of this.items.entries()) {
      if (item.createdAt < thirtyDaysAgo && item.status !== 'pending') {
        this.items.delete(id);
        removed++;
      }
    }
    
    return removed;
  }

  /**
   * Generate a unique ID for review items
   */
  private generateId(): string {
    return `review_${Date.now()}_${Math.random().toString(36).substring(2, 9)}`;
  }
}

export const reviewQueue = new ReviewQueueManager();