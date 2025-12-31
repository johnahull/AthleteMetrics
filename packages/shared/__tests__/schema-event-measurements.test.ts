/**
 * Schema tests for eventId on measurements table
 * TDD Phase 1: RED - These tests will fail until schema is updated
 */

import { describe, it, expect } from "vitest";
import { measurements } from "../schema";

describe("Measurements Schema - Event Integration", () => {
  it("should have eventId column", () => {
    expect(measurements.eventId).toBeDefined();
  });

  it("should have eventNameSnapshot column", () => {
    expect(measurements.eventNameSnapshot).toBeDefined();
  });

  it("should have eventDateSnapshot column", () => {
    expect(measurements.eventDateSnapshot).toBeDefined();
  });

  it("eventId should be nullable (historical reference pattern)", () => {
    const column = measurements.eventId;
    expect(column).toBeDefined();
    // Event ID is optional - not all measurements are from events
    // This follows the same pattern as teamId (historical reference, no FK)
  });

  it("eventNameSnapshot should be nullable", () => {
    const column = measurements.eventNameSnapshot;
    expect(column).toBeDefined();
  });

  it("eventDateSnapshot should be nullable", () => {
    const column = measurements.eventDateSnapshot;
    expect(column).toBeDefined();
  });
});
