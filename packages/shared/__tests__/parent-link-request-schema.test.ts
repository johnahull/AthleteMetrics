import { describe, it, expect } from 'vitest';
import { parentLinkRequests } from '../schema';
import { notificationTypeEnum } from '../schema';

describe('parentLinkRequests schema', () => {
  it('exports parentLinkRequests table', () => {
    expect(parentLinkRequests).toBeDefined();
    // Drizzle pgTable objects have a Symbol-keyed metadata property
    expect(typeof parentLinkRequests).toBe('object');
  });

  it('has required columns: id, parentUserId, athleteUserId, status, createdAt, expiresAt', () => {
    const columns = parentLinkRequests;
    expect(columns.id).toBeDefined();
    expect(columns.parentUserId).toBeDefined();
    expect(columns.athleteUserId).toBeDefined();
    expect(columns.status).toBeDefined();
    expect(columns.createdAt).toBeDefined();
    expect(columns.expiresAt).toBeDefined();
  });

  it('has optional columns: organizationId, processedBy, processedAt, denialReason', () => {
    const columns = parentLinkRequests;
    expect(columns.organizationId).toBeDefined();
    expect(columns.processedBy).toBeDefined();
    expect(columns.processedAt).toBeDefined();
    expect(columns.denialReason).toBeDefined();
  });

  it('status column uses the correct enum values', () => {
    // The status column should be defined with text type and enum values
    const statusCol = parentLinkRequests.status;
    expect(statusCol).toBeDefined();
    // Drizzle stores enumValues on the column config
    const enumValues = (statusCol as any).enumValues;
    expect(enumValues).toContain('pending');
    expect(enumValues).toContain('approved');
    expect(enumValues).toContain('denied');
    expect(enumValues).toContain('cancelled');
  });

  it('notificationTypeEnum includes parent_link_request', () => {
    expect(notificationTypeEnum).toContain('parent_link_request');
  });
});
