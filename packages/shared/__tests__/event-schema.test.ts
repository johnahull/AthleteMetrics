import { describe, it, expect } from 'vitest';
import {
  insertEventSchema,
  updateEventSchema,
  insertEventRegistrationSchema,
  eventVisibilityEnum,
  eventStatusEnum,
  registrationModeEnum,
  resultsVisibilityEnum,
  registrationStatusEnum,
} from '../schema';

describe('Event Schema', () => {
  describe('insertEventSchema', () => {
    it('should accept valid event with all required fields', () => {
      const validEvent = {
        name: 'Spring Combine 2025',
        startDate: new Date('2025-03-15T09:00:00Z'),
        organizationId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = insertEventSchema.safeParse(validEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Spring Combine 2025');
        expect(result.data.visibility).toBe('org_private'); // default
        expect(result.data.registrationMode).toBe('open'); // default
        expect(result.data.status).toBe('draft'); // default
      }
    });

    it('should accept public event without organizationId', () => {
      const publicEvent = {
        name: 'Open Combine',
        startDate: new Date('2025-03-15T09:00:00Z'),
        visibility: 'public' as const,
        // No organizationId - allowed for public events
      };

      const result = insertEventSchema.safeParse(publicEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.visibility).toBe('public');
        expect(result.data.organizationId).toBeUndefined();
      }
    });

    it('should reject event without name', () => {
      const eventWithoutName = {
        startDate: new Date('2025-03-15T09:00:00Z'),
        organizationId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = insertEventSchema.safeParse(eventWithoutName);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('name')
        )).toBe(true);
      }
    });

    it('should reject event with empty name', () => {
      const eventWithEmptyName = {
        name: '',
        startDate: new Date('2025-03-15T09:00:00Z'),
      };

      const result = insertEventSchema.safeParse(eventWithEmptyName);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('name')
        )).toBe(true);
      }
    });

    it('should reject event without startDate', () => {
      const eventWithoutStartDate = {
        name: 'Spring Combine',
        organizationId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = insertEventSchema.safeParse(eventWithoutStartDate);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('startDate')
        )).toBe(true);
      }
    });

    it('should reject event with endDate before startDate', () => {
      const eventWithInvalidDates = {
        name: 'Spring Combine',
        startDate: new Date('2025-03-15T09:00:00Z'),
        endDate: new Date('2025-03-14T09:00:00Z'), // Before start
        organizationId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = insertEventSchema.safeParse(eventWithInvalidDates);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('endDate') || issue.message.includes('End date')
        )).toBe(true);
      }
    });

    it('should accept event with endDate equal to startDate', () => {
      const sameDay = new Date('2025-03-15T09:00:00Z');
      const validEvent = {
        name: 'One Day Combine',
        startDate: sameDay,
        endDate: sameDay,
        organizationId: '123e4567-e89b-12d3-a456-426614174000',
      };

      const result = insertEventSchema.safeParse(validEvent);

      expect(result.success).toBe(true);
    });

    it('should reject invalid visibility enum value', () => {
      const eventWithInvalidVisibility = {
        name: 'Spring Combine',
        startDate: new Date('2025-03-15T09:00:00Z'),
        visibility: 'invalid' as any,
      };

      const result = insertEventSchema.safeParse(eventWithInvalidVisibility);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('visibility')
        )).toBe(true);
      }
    });

    it('should accept all valid visibility enum values', () => {
      const visibilities: (typeof eventVisibilityEnum)[number][] = ['org_private', 'public', 'invite_only'];

      for (const visibility of visibilities) {
        const event = {
          name: 'Test Event',
          startDate: new Date('2025-03-15T09:00:00Z'),
          visibility,
        };

        const result = insertEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid registrationMode enum value', () => {
      const eventWithInvalidMode = {
        name: 'Spring Combine',
        startDate: new Date('2025-03-15T09:00:00Z'),
        registrationMode: 'invalid' as any,
      };

      const result = insertEventSchema.safeParse(eventWithInvalidMode);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('registrationMode')
        )).toBe(true);
      }
    });

    it('should accept all valid registrationMode enum values', () => {
      const modes: (typeof registrationModeEnum)[number][] = ['open', 'request_approval', 'invitation_only'];

      for (const registrationMode of modes) {
        const event = {
          name: 'Test Event',
          startDate: new Date('2025-03-15T09:00:00Z'),
          registrationMode,
        };

        const result = insertEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }
    });

    it('should reject invalid status enum value', () => {
      const eventWithInvalidStatus = {
        name: 'Spring Combine',
        startDate: new Date('2025-03-15T09:00:00Z'),
        status: 'invalid' as any,
      };

      const result = insertEventSchema.safeParse(eventWithInvalidStatus);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('status')
        )).toBe(true);
      }
    });

    it('should accept all valid status enum values', () => {
      const statuses: (typeof eventStatusEnum)[number][] = ['draft', 'published', 'active', 'completed', 'cancelled'];

      for (const status of statuses) {
        const event = {
          name: 'Test Event',
          startDate: new Date('2025-03-15T09:00:00Z'),
          status,
        };

        const result = insertEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }
    });

    it('should accept valid maxRegistrations', () => {
      const eventWithCapacity = {
        name: 'Limited Combine',
        startDate: new Date('2025-03-15T09:00:00Z'),
        maxRegistrations: 50,
      };

      const result = insertEventSchema.safeParse(eventWithCapacity);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.maxRegistrations).toBe(50);
      }
    });

    it('should reject negative maxRegistrations', () => {
      const eventWithNegativeCapacity = {
        name: 'Limited Combine',
        startDate: new Date('2025-03-15T09:00:00Z'),
        maxRegistrations: -10,
      };

      const result = insertEventSchema.safeParse(eventWithNegativeCapacity);

      expect(result.success).toBe(false);
    });

    it('should reject zero maxRegistrations', () => {
      const eventWithZeroCapacity = {
        name: 'Limited Combine',
        startDate: new Date('2025-03-15T09:00:00Z'),
        maxRegistrations: 0,
      };

      const result = insertEventSchema.safeParse(eventWithZeroCapacity);

      expect(result.success).toBe(false);
    });

    it('should reject registrationClosesAt before registrationOpensAt', () => {
      const eventWithInvalidRegistrationDates = {
        name: 'Spring Combine',
        startDate: new Date('2025-03-15T09:00:00Z'),
        registrationOpensAt: new Date('2025-03-01T09:00:00Z'),
        registrationClosesAt: new Date('2025-02-15T09:00:00Z'), // Before opens
      };

      const result = insertEventSchema.safeParse(eventWithInvalidRegistrationDates);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.message.includes('Registration close') || issue.path.includes('registrationClosesAt')
        )).toBe(true);
      }
    });

    it('should accept all valid resultsVisibility enum values', () => {
      const visibilities: (typeof resultsVisibilityEnum)[number][] = ['immediate', 'after_event', 'manual'];

      for (const resultsVisibility of visibilities) {
        const event = {
          name: 'Test Event',
          startDate: new Date('2025-03-15T09:00:00Z'),
          resultsVisibility,
        };

        const result = insertEventSchema.safeParse(event);
        expect(result.success).toBe(true);
      }
    });

    it('should accept event with all optional fields', () => {
      const fullEvent = {
        name: 'Complete Combine 2025',
        description: 'A comprehensive athletic combine event',
        location: '123 Sports Complex, Anytown USA',
        eventType: 'combine',
        startDate: new Date('2025-03-15T09:00:00Z'),
        endDate: new Date('2025-03-16T18:00:00Z'),
        timezone: 'America/Chicago',
        visibility: 'public' as const,
        registrationMode: 'request_approval' as const,
        status: 'draft' as const,
        registrationOpensAt: new Date('2025-02-01T00:00:00Z'),
        registrationClosesAt: new Date('2025-03-10T23:59:59Z'),
        maxRegistrations: 100,
        resultsVisibility: 'after_event' as const,
      };

      const result = insertEventSchema.safeParse(fullEvent);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Complete Combine 2025');
        expect(result.data.description).toBe('A comprehensive athletic combine event');
        expect(result.data.location).toBe('123 Sports Complex, Anytown USA');
        expect(result.data.eventType).toBe('combine');
        expect(result.data.maxRegistrations).toBe(100);
      }
    });
  });

  describe('updateEventSchema', () => {
    it('should accept partial update with only name', () => {
      const update = { name: 'Updated Event Name' };

      const result = updateEventSchema.safeParse(update);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.name).toBe('Updated Event Name');
      }
    });

    it('should accept partial update with multiple fields', () => {
      const update = {
        name: 'Updated Event',
        description: 'New description',
        maxRegistrations: 75,
      };

      const result = updateEventSchema.safeParse(update);

      expect(result.success).toBe(true);
    });

    it('should allow null for optional fields to clear them', () => {
      const update = {
        description: null,
        location: null,
        endDate: null,
      };

      const result = updateEventSchema.safeParse(update);

      expect(result.success).toBe(true);
    });

    it('should reject invalid enum values in update', () => {
      const update = { visibility: 'invalid' as any };

      const result = updateEventSchema.safeParse(update);

      expect(result.success).toBe(false);
    });
  });

  describe('insertEventRegistrationSchema', () => {
    it('should accept valid registration', () => {
      const validRegistration = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '223e4567-e89b-12d3-a456-426614174000',
        userFullNameSnapshot: 'John Doe',
      };

      const result = insertEventRegistrationSchema.safeParse(validRegistration);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.eventId).toBe('123e4567-e89b-12d3-a456-426614174000');
        expect(result.data.status).toBe('pending'); // default
      }
    });

    it('should reject registration without eventId', () => {
      const registrationWithoutEventId = {
        userId: '223e4567-e89b-12d3-a456-426614174000',
        userFullNameSnapshot: 'John Doe',
      };

      const result = insertEventRegistrationSchema.safeParse(registrationWithoutEventId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('eventId')
        )).toBe(true);
      }
    });

    it('should reject registration without userId', () => {
      const registrationWithoutUserId = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        userFullNameSnapshot: 'John Doe',
      };

      const result = insertEventRegistrationSchema.safeParse(registrationWithoutUserId);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('userId')
        )).toBe(true);
      }
    });

    it('should reject registration without userFullNameSnapshot', () => {
      const registrationWithoutName = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '223e4567-e89b-12d3-a456-426614174000',
      };

      const result = insertEventRegistrationSchema.safeParse(registrationWithoutName);

      expect(result.success).toBe(false);
      if (!result.success) {
        expect(result.error.issues.some(issue =>
          issue.path.includes('userFullNameSnapshot')
        )).toBe(true);
      }
    });

    it('should accept all valid registration status values', () => {
      const statuses: (typeof registrationStatusEnum)[number][] = [
        'pending', 'approved', 'waitlisted', 'declined', 'cancelled', 'checked_in', 'completed'
      ];

      for (const status of statuses) {
        const registration = {
          eventId: '123e4567-e89b-12d3-a456-426614174000',
          userId: '223e4567-e89b-12d3-a456-426614174000',
          userFullNameSnapshot: 'John Doe',
          status,
        };

        const result = insertEventRegistrationSchema.safeParse(registration);
        expect(result.success).toBe(true);
      }
    });

    it('should accept registration with optional snapshot data', () => {
      const registrationWithSnapshots = {
        eventId: '123e4567-e89b-12d3-a456-426614174000',
        userId: '223e4567-e89b-12d3-a456-426614174000',
        userFullNameSnapshot: 'John Doe',
        organizationIdSnapshot: '323e4567-e89b-12d3-a456-426614174000',
        organizationNameSnapshot: 'Elite Athletics',
        discoveryMethod: 'event_code',
        athleteNotes: 'Looking forward to the combine!',
      };

      const result = insertEventRegistrationSchema.safeParse(registrationWithSnapshots);

      expect(result.success).toBe(true);
      if (result.success) {
        expect(result.data.organizationNameSnapshot).toBe('Elite Athletics');
        expect(result.data.discoveryMethod).toBe('event_code');
      }
    });
  });

  describe('Enum Exports', () => {
    it('should export eventVisibilityEnum with correct values', () => {
      expect(eventVisibilityEnum).toContain('org_private');
      expect(eventVisibilityEnum).toContain('public');
      expect(eventVisibilityEnum).toContain('invite_only');
      expect(eventVisibilityEnum.length).toBe(3);
    });

    it('should export eventStatusEnum with correct values', () => {
      expect(eventStatusEnum).toContain('draft');
      expect(eventStatusEnum).toContain('published');
      expect(eventStatusEnum).toContain('active');
      expect(eventStatusEnum).toContain('completed');
      expect(eventStatusEnum).toContain('cancelled');
      expect(eventStatusEnum.length).toBe(5);
    });

    it('should export registrationModeEnum with correct values', () => {
      expect(registrationModeEnum).toContain('open');
      expect(registrationModeEnum).toContain('request_approval');
      expect(registrationModeEnum).toContain('invitation_only');
      expect(registrationModeEnum.length).toBe(3);
    });

    it('should export registrationStatusEnum with correct values', () => {
      expect(registrationStatusEnum).toContain('pending');
      expect(registrationStatusEnum).toContain('approved');
      expect(registrationStatusEnum).toContain('waitlisted');
      expect(registrationStatusEnum).toContain('declined');
      expect(registrationStatusEnum).toContain('cancelled');
      expect(registrationStatusEnum).toContain('checked_in');
      expect(registrationStatusEnum).toContain('completed');
      expect(registrationStatusEnum.length).toBe(7);
    });

    it('should export resultsVisibilityEnum with correct values', () => {
      expect(resultsVisibilityEnum).toContain('immediate');
      expect(resultsVisibilityEnum).toContain('after_event');
      expect(resultsVisibilityEnum).toContain('manual');
      expect(resultsVisibilityEnum.length).toBe(3);
    });
  });
});
