/**
 * Unit tests for EventService
 * Tests event CRUD operations, registration, and freeze functionality
 *
 * TDD Phase 1.2: RED - These tests will fail until EventService is implemented
 */

import { describe, it, expect, beforeEach, vi } from "vitest";
import { EventService } from "../services/event-service";
import type { Event, EventRegistration, User, Organization } from "@shared/schema";
import type { IStorage } from "../storage";

describe("EventService", () => {
  let service: EventService;
  let mockStorage: Partial<IStorage>;

  // Mock data
  const mockOrganization: Organization = {
    id: "org-123",
    name: "Test Organization",
    isActive: true,
    orgType: "club",
    benchmarksEnabled: false,
    allowCustomBenchmarks: false,
    aiEnabledBySiteAdmin: false,
    aiEnabled: false,
    wellnessEnabled: true,
    isPublicDirectory: false,
    allowMembershipRequests: true,
    autoApproveRequests: false,
    createdAt: new Date(),
  } as Organization;

  const mockUser: User = {
    id: "user-123",
    username: "testuser",
    emails: ["test@example.com"],
    firstName: "Test",
    lastName: "User",
    fullName: "Test User",
    isActive: true,
    isSiteAdmin: false,
    role: "athlete",
    createdAt: new Date(),
  } as User;

  const mockOrgAdmin: User = {
    ...mockUser,
    id: "admin-123",
    username: "orgadmin",
    emails: ["admin@example.com"],
    fullName: "Org Admin",
  } as User;

  const mockEvent: Event = {
    id: "event-123",
    organizationId: "org-123",
    name: "Spring Combine 2025",
    description: "Annual spring athletic combine",
    location: "Sports Complex",
    eventType: "combine",
    startDate: new Date("2025-03-15T09:00:00Z"),
    endDate: new Date("2025-03-15T17:00:00Z"),
    timezone: "America/New_York",
    visibility: "org_private",
    registrationMode: "open",
    status: "draft",
    maxRegistrations: 100,
    eventCode: "ABC12345",
    resultsVisibility: "after_event",
    isFrozen: false,
    createdBy: "admin-123",
    createdAt: new Date(),
  } as Event;

  const mockPublicEvent: Event = {
    ...mockEvent,
    id: "event-public",
    name: "Open Combine",
    organizationId: null,
    visibility: "public",
    eventCode: "PUB12345",
  } as Event;

  const mockFrozenEvent: Event = {
    ...mockEvent,
    id: "event-frozen",
    name: "Frozen Event",
    isFrozen: true,
    frozenAt: new Date(),
    frozenBy: "admin-123",
    frozenReason: "Event completed",
  } as Event;

  beforeEach(() => {
    // Reset mock storage before each test
    mockStorage = {
      getOrganization: vi.fn().mockResolvedValue(mockOrganization),
      getUser: vi.fn().mockResolvedValue(mockUser),
      getUserRoles: vi.fn().mockResolvedValue(["org_admin"]),
      createAuditLog: vi.fn().mockResolvedValue(undefined),
      // Event-specific methods to be implemented
      createEvent: vi.fn(),
      getEvent: vi.fn(),
      updateEvent: vi.fn(),
      deleteEvent: vi.fn(),
      listEvents: vi.fn(),
      getEventByCode: vi.fn(),
      createEventRegistration: vi.fn(),
      getEventRegistration: vi.fn(),
      updateEventRegistration: vi.fn(),
      listEventRegistrations: vi.fn(),
      getEventRegistrationCount: vi.fn(),
    };

    service = new EventService(mockStorage as IStorage);
  });

  describe("createEvent", () => {
    it("should create event with generated eventCode", async () => {
      const eventData = {
        name: "New Combine",
        startDate: new Date("2025-04-01T09:00:00Z"),
        organizationId: "org-123",
      };

      mockStorage.createEvent = vi.fn().mockImplementation((data) =>
        Promise.resolve({ ...mockEvent, ...data, id: "new-event-id" })
      );

      const result = await service.createEvent(eventData, "admin-123");

      expect(result).toBeDefined();
      expect(result.name).toBe("New Combine");
      expect(result.eventCode).toBeDefined();
      expect(result.eventCode).toHaveLength(8); // 8-char alphanumeric code
      expect(mockStorage.createEvent).toHaveBeenCalled();
    });

    it("should associate event with organization when organizationId provided", async () => {
      const eventData = {
        name: "Org Event",
        startDate: new Date("2025-04-01T09:00:00Z"),
        organizationId: "org-123",
        visibility: "org_private" as const,
      };

      mockStorage.createEvent = vi.fn().mockImplementation((data) =>
        Promise.resolve({ ...mockEvent, ...data, id: "org-event-id" })
      );

      const result = await service.createEvent(eventData, "admin-123");

      expect(result.organizationId).toBe("org-123");
      expect(result.visibility).toBe("org_private");
    });

    it("should allow public events without organizationId", async () => {
      const eventData = {
        name: "Public Combine",
        startDate: new Date("2025-04-01T09:00:00Z"),
        visibility: "public" as const,
        // No organizationId
      };

      mockStorage.createEvent = vi.fn().mockImplementation((data) =>
        Promise.resolve({ ...mockPublicEvent, ...data, id: "public-event-id" })
      );

      const result = await service.createEvent(eventData, "admin-123");

      // When organizationId is not provided, service uses undefined (not null)
      expect(result.organizationId).toBeUndefined();
      expect(result.visibility).toBe("public");
    });

    it("should create audit log on event creation", async () => {
      const eventData = {
        name: "Audit Test Event",
        startDate: new Date("2025-04-01T09:00:00Z"),
        organizationId: "org-123",
      };

      mockStorage.createEvent = vi.fn().mockResolvedValue({
        ...mockEvent,
        ...eventData,
        id: "audit-event-id",
      });

      await service.createEvent(eventData, "admin-123");

      expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "admin-123",
          action: "event_created",
          resourceType: "event",
        })
      );
    });

    it("should set default values for optional fields", async () => {
      const eventData = {
        name: "Minimal Event",
        startDate: new Date("2025-04-01T09:00:00Z"),
      };

      mockStorage.createEvent = vi.fn().mockImplementation((data) =>
        Promise.resolve({
          id: "minimal-event-id",
          ...data,
          visibility: data.visibility || "org_private",
          registrationMode: data.registrationMode || "open",
          status: data.status || "draft",
          resultsVisibility: data.resultsVisibility || "after_event",
          isFrozen: false,
          createdAt: new Date(),
        })
      );

      const result = await service.createEvent(eventData, "admin-123");

      expect(result.visibility).toBe("org_private");
      expect(result.registrationMode).toBe("open");
      expect(result.status).toBe("draft");
      expect(result.resultsVisibility).toBe("after_event");
      expect(result.isFrozen).toBe(false);
    });
  });

  describe("getEvent", () => {
    it("should return event for org members", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockEvent);
      mockStorage.getUserRoles = vi.fn().mockResolvedValue(["athlete"]);

      const result = await service.getEvent("event-123", "user-123");

      expect(result).toBeDefined();
      expect(result?.id).toBe("event-123");
      expect(mockStorage.getEvent).toHaveBeenCalledWith("event-123");
    });

    it("should return public events for any user", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockPublicEvent);
      mockStorage.getUserRoles = vi.fn().mockResolvedValue([]); // Not in any org

      const result = await service.getEvent("event-public", "any-user-123");

      expect(result).toBeDefined();
      expect(result?.visibility).toBe("public");
    });

    it("should deny access to private events for non-members", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockEvent); // org_private event
      mockStorage.getUserRoles = vi.fn().mockResolvedValue([]); // Not in org

      await expect(
        service.getEvent("event-123", "non-member-user")
      ).rejects.toThrow(/access denied|not authorized|forbidden/i);
    });

    it("should return null for non-existent event", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(null);

      const result = await service.getEvent("non-existent", "user-123");

      expect(result).toBeNull();
    });
  });

  describe("getEventByCode", () => {
    it("should return event by eventCode", async () => {
      mockStorage.getEventByCode = vi.fn().mockResolvedValue(mockEvent);

      const result = await service.getEventByCode("ABC12345");

      expect(result).toBeDefined();
      expect(result?.eventCode).toBe("ABC12345");
    });

    it("should return null for invalid code", async () => {
      mockStorage.getEventByCode = vi.fn().mockResolvedValue(null);

      const result = await service.getEventByCode("INVALID");

      expect(result).toBeNull();
    });
  });

  describe("updateEvent", () => {
    it("should update event fields", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockEvent);
      mockStorage.updateEvent = vi.fn().mockImplementation((id, updates) =>
        Promise.resolve({ ...mockEvent, ...updates })
      );

      const result = await service.updateEvent(
        "event-123",
        { name: "Updated Combine", maxRegistrations: 150 },
        "admin-123"
      );

      expect(result.name).toBe("Updated Combine");
      expect(result.maxRegistrations).toBe(150);
    });

    it("should prevent update if event is frozen", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockFrozenEvent);

      await expect(
        service.updateEvent(
          "event-frozen",
          { name: "Try to Update" },
          "admin-123"
        )
      ).rejects.toThrow(/frozen|locked|cannot be modified/i);
    });

    it("should create audit log on update", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockEvent);
      mockStorage.updateEvent = vi.fn().mockResolvedValue({
        ...mockEvent,
        name: "Updated Name",
      });

      await service.updateEvent(
        "event-123",
        { name: "Updated Name" },
        "admin-123"
      );

      expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "admin-123",
          action: "event_updated",
          resourceType: "event",
          resourceId: "event-123",
        })
      );
    });
  });

  describe("listEvents", () => {
    it("should list events for organization", async () => {
      const events = [mockEvent, { ...mockEvent, id: "event-456", name: "Second Event" }];
      mockStorage.listEvents = vi.fn().mockResolvedValue(events);

      const result = await service.listEvents({ organizationId: "org-123" }, "user-123");

      expect(result).toHaveLength(2);
      expect(mockStorage.listEvents).toHaveBeenCalledWith(
        expect.objectContaining({ organizationId: "org-123" })
      );
    });

    it("should list public events without org filter", async () => {
      const publicEvents = [mockPublicEvent];
      mockStorage.listEvents = vi.fn().mockResolvedValue(publicEvents);

      const result = await service.listEvents({ visibility: "public" }, "any-user");

      expect(result).toHaveLength(1);
      expect(result[0].visibility).toBe("public");
    });
  });

  describe("freezeEvent", () => {
    it("should set isFrozen to true with timestamp and user", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockEvent);
      mockStorage.updateEvent = vi.fn().mockImplementation((id, updates) =>
        Promise.resolve({ ...mockEvent, ...updates })
      );

      const result = await service.freezeEvent("event-123", "admin-123", "Event completed");

      expect(result.isFrozen).toBe(true);
      expect(result.frozenAt).toBeDefined();
      expect(result.frozenBy).toBe("admin-123");
      expect(result.frozenReason).toBe("Event completed");
    });

    it("should create audit log on freeze", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockEvent);
      mockStorage.updateEvent = vi.fn().mockResolvedValue({
        ...mockEvent,
        isFrozen: true,
        frozenAt: new Date(),
        frozenBy: "admin-123",
      });

      await service.freezeEvent("event-123", "admin-123", "Event completed");

      expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "admin-123",
          action: "event_frozen",
          resourceType: "event",
          resourceId: "event-123",
        })
      );
    });

    it("should prevent double-freeze", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockFrozenEvent);

      await expect(
        service.freezeEvent("event-frozen", "admin-123", "Already frozen")
      ).rejects.toThrow(/already frozen/i);
    });
  });

  describe("unfreezeEvent", () => {
    it("should clear freeze fields", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockFrozenEvent);
      mockStorage.updateEvent = vi.fn().mockImplementation((id, updates) =>
        Promise.resolve({
          ...mockFrozenEvent,
          isFrozen: false,
          frozenAt: null,
          frozenBy: null,
          frozenReason: null,
        })
      );

      const result = await service.unfreezeEvent("event-frozen", "admin-123");

      expect(result.isFrozen).toBe(false);
      expect(result.frozenAt).toBeNull();
      expect(result.frozenBy).toBeNull();
    });

    it("should create audit log on unfreeze", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockFrozenEvent);
      mockStorage.updateEvent = vi.fn().mockResolvedValue({
        ...mockFrozenEvent,
        isFrozen: false,
      });

      await service.unfreezeEvent("event-frozen", "admin-123");

      expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "admin-123",
          action: "event_unfrozen",
          resourceType: "event",
        })
      );
    });
  });

  describe("generateEventCode", () => {
    it("should generate 8-character alphanumeric code", async () => {
      // Access private method through service if needed
      const code = service.generateEventCode();

      expect(code).toBeDefined();
      expect(code).toHaveLength(8);
      expect(code).toMatch(/^[A-Z0-9]+$/);
    });

    it("should generate unique codes", async () => {
      const codes = new Set();
      for (let i = 0; i < 100; i++) {
        codes.add(service.generateEventCode());
      }
      // All 100 codes should be unique
      expect(codes.size).toBe(100);
    });
  });

  describe("deleteEvent", () => {
    it("should soft delete event", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockEvent);
      mockStorage.deleteEvent = vi.fn().mockResolvedValue({ success: true });

      await service.deleteEvent("event-123", "admin-123");

      expect(mockStorage.deleteEvent).toHaveBeenCalledWith("event-123");
    });

    it("should prevent deletion of frozen event without override", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockFrozenEvent);

      await expect(
        service.deleteEvent("event-frozen", "admin-123")
      ).rejects.toThrow(/frozen|cannot be deleted/i);
    });

    it("should create audit log on deletion", async () => {
      mockStorage.getEvent = vi.fn().mockResolvedValue(mockEvent);
      mockStorage.deleteEvent = vi.fn().mockResolvedValue({ success: true });

      await service.deleteEvent("event-123", "admin-123");

      expect(mockStorage.createAuditLog).toHaveBeenCalledWith(
        expect.objectContaining({
          userId: "admin-123",
          action: "event_deleted",
          resourceType: "event",
          resourceId: "event-123",
        })
      );
    });
  });
});
