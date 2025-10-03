/**
 * Import service handling file uploads and review queue management
 */

import { BaseService } from "./base-service";
import { reviewQueue } from "../review-queue";
import type { ImportReviewItem, ImportReviewDecision } from "@shared/import-types";

export class ImportService extends BaseService {
  /**
   * Handle photo import
   */
  async importPhoto(
    file: Express.Multer.File,
    userId: string
  ): Promise<{ message: string; filename: string }> {
    try {
      this.logger.info('Importing photo', {
        userId,
        filename: file.originalname,
        size: file.size
      });

      // Photo import logic would go here
      // For now, just acknowledge the upload

      this.logger.info('Photo imported successfully', {
        userId,
        filename: file.originalname
      });

      return {
        message: "Photo uploaded successfully",
        filename: file.originalname
      };
    } catch (error) {
      this.handleError(error, 'importPhoto');
    }
  }

  /**
   * Handle CSV import
   */
  async importCSV(
    type: string,
    file: Express.Multer.File,
    userId: string
  ): Promise<{ message: string; filename: string }> {
    try {
      this.logger.info('Importing CSV', {
        userId,
        type,
        filename: file.originalname,
        size: file.size
      });

      // CSV import logic would go here
      // For now, just acknowledge the upload

      this.logger.info('CSV import initiated', {
        userId,
        type,
        filename: file.originalname
      });

      return {
        message: `${type} import initiated`,
        filename: file.originalname
      };
    } catch (error) {
      this.handleError(error, 'importCSV');
    }
  }

  /**
   * Get review queue item
   */
  async getReviewQueueItem(
    itemId: string,
    userId: string
  ): Promise<ImportReviewItem | null> {
    try {
      this.logger.info('Getting review queue item', { userId, itemId });

      const item = reviewQueue.getItem(itemId);

      if (!item) {
        this.logger.warn('Review queue item not found', { userId, itemId });
        return null;
      }

      return item;
    } catch (error) {
      this.handleError(error, 'getReviewQueueItem');
    }
  }

  /**
   * Process review decision
   */
  async processReviewDecision(
    decision: ImportReviewDecision,
    userId: string
  ): Promise<ImportReviewItem> {
    try {
      this.logger.info('Processing review decision', {
        userId,
        itemId: decision.itemId,
        action: decision.action
      });

      const result = reviewQueue.processDecision(decision, userId);

      if (!result) {
        this.logger.error('Review item not found', {
          userId,
          itemId: decision.itemId
        });
        throw new Error('Review item not found');
      }

      this.logger.info('Review decision processed', {
        userId,
        itemId: decision.itemId,
        status: result.status
      });

      return result;
    } catch (error) {
      this.handleError(error, 'processReviewDecision');
    }
  }
}
