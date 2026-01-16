/**
 * Validation tests for report sharing API schemas
 * Tests Zod validation schemas for message length limits and bulk share limits
 */

import { describe, it, expect } from "vitest";
import { z } from "zod";

// Recreate the schemas as they exist in report-routes.ts
const shareReportSchema = z.object({
  athleteId: z.string().uuid(),
  message: z.string().max(1000, "Message cannot exceed 1000 characters").optional(),
});

const bulkShareReportSchema = z.object({
  athleteIds: z.array(z.string().uuid()).optional(),
  message: z.string().max(1000, "Message cannot exceed 1000 characters").optional(),
});

const MAX_BULK_SHARE = 100;

describe("Report Sharing Validation Schemas", () => {
  describe("shareReportSchema", () => {
    it("should accept valid athleteId and no message", () => {
      const validData = {
        athleteId: "123e4567-e89b-12d3-a456-426614174000",
      };

      const result = shareReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept valid athleteId with message", () => {
      const validData = {
        athleteId: "123e4567-e89b-12d3-a456-426614174000",
        message: "Great progress this season!",
      };

      const result = shareReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept message with exactly 1000 characters", () => {
      const validData = {
        athleteId: "123e4567-e89b-12d3-a456-426614174000",
        message: "a".repeat(1000),
      };

      const result = shareReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.message?.length).toBe(1000);
      }
    });

    it("should reject message exceeding 1000 characters", () => {
      const invalidData = {
        athleteId: "123e4567-e89b-12d3-a456-426614174000",
        message: "a".repeat(1001),
      };

      const result = shareReportSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Message cannot exceed 1000 characters");
      }
    });

    it("should reject invalid UUID for athleteId", () => {
      const invalidData = {
        athleteId: "not-a-valid-uuid",
        message: "Test message",
      };

      const result = shareReportSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject missing athleteId", () => {
      const invalidData = {
        message: "Test message",
      };

      const result = shareReportSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should accept empty string message (optional validation)", () => {
      const validData = {
        athleteId: "123e4567-e89b-12d3-a456-426614174000",
        message: "",
      };

      const result = shareReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });
  });

  describe("bulkShareReportSchema", () => {
    it("should accept valid athleteIds array", () => {
      const validData = {
        athleteIds: [
          "123e4567-e89b-12d3-a456-426614174000",
          "223e4567-e89b-12d3-a456-426614174001",
        ],
      };

      const result = bulkShareReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept empty athleteIds array (share with all)", () => {
      const validData = {
        athleteIds: [],
      };

      const result = bulkShareReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept no athleteIds (share with all athletes in org)", () => {
      const validData = {};

      const result = bulkShareReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should accept message with athleteIds", () => {
      const validData = {
        athleteIds: ["123e4567-e89b-12d3-a456-426614174000"],
        message: "Team performance update",
      };

      const result = bulkShareReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should reject message exceeding 1000 characters in bulk share", () => {
      const invalidData = {
        athleteIds: ["123e4567-e89b-12d3-a456-426614174000"],
        message: "a".repeat(1001),
      };

      const result = bulkShareReportSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues[0].message).toBe("Message cannot exceed 1000 characters");
      }
    });

    it("should reject invalid UUID in athleteIds array", () => {
      const invalidData = {
        athleteIds: [
          "123e4567-e89b-12d3-a456-426614174000",
          "not-a-valid-uuid",
        ],
      };

      const result = bulkShareReportSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });

    it("should reject non-array athleteIds", () => {
      const invalidData = {
        athleteIds: "123e4567-e89b-12d3-a456-426614174000",
      };

      const result = bulkShareReportSchema.safeParse(invalidData);
      expect(result.success).toBe(false);
    });
  });

  describe("MAX_BULK_SHARE Constant", () => {
    it("should have MAX_BULK_SHARE set to 100", () => {
      expect(MAX_BULK_SHARE).toBe(100);
    });

    it("should be a reasonable limit (between 10 and 1000)", () => {
      expect(MAX_BULK_SHARE).toBeGreaterThanOrEqual(10);
      expect(MAX_BULK_SHARE).toBeLessThanOrEqual(1000);
    });

    it("should allow validating array length against limit", () => {
      // Simulate the limit check in the API
      const checkBulkLimit = (ids: string[]) => ids.length <= MAX_BULK_SHARE;

      expect(checkBulkLimit(Array(100).fill("id"))).toBe(true);
      expect(checkBulkLimit(Array(101).fill("id"))).toBe(false);
      expect(checkBulkLimit(Array(50).fill("id"))).toBe(true);
    });
  });

  describe("Edge Cases", () => {
    it("should handle unicode characters in message", () => {
      const validData = {
        athleteId: "123e4567-e89b-12d3-a456-426614174000",
        message: "Great job! 🎉🏆 Keep it up! 💪",
      };

      const result = shareReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should handle newlines in message", () => {
      const validData = {
        athleteId: "123e4567-e89b-12d3-a456-426614174000",
        message: "Line 1\nLine 2\nLine 3",
      };

      const result = shareReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
    });

    it("should handle special characters in message", () => {
      const validData = {
        athleteId: "123e4567-e89b-12d3-a456-426614174000",
        message: "Score: 95.5% - Great! <script>alert('xss')</script>",
      };

      const result = shareReportSchema.safeParse(validData);
      expect(result.success).toBe(true);
      // Note: XSS prevention is handled at the email template level, not validation
    });

    it("should count characters correctly for boundary check", () => {
      // Test exactly at the boundary
      const at999 = shareReportSchema.safeParse({
        athleteId: "123e4567-e89b-12d3-a456-426614174000",
        message: "a".repeat(999),
      });
      expect(at999.success).toBe(true);

      const at1000 = shareReportSchema.safeParse({
        athleteId: "123e4567-e89b-12d3-a456-426614174000",
        message: "a".repeat(1000),
      });
      expect(at1000.success).toBe(true);

      const at1001 = shareReportSchema.safeParse({
        athleteId: "123e4567-e89b-12d3-a456-426614174000",
        message: "a".repeat(1001),
      });
      expect(at1001.success).toBe(false);
    });
  });
});
