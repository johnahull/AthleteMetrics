/** getOrganizationById returns aiStyleExample only to site admins and to admins of that organization. */
import { describe, it, expect, beforeEach, vi } from 'vitest';

vi.mock('../db', () => ({ db: {}, pgClient: {}, sessionPool: {}, closeDatabase: vi.fn() }));
const s = vi.hoisted(() => ({
  getOrganization: vi.fn(),
  getUser: vi.fn(),
  getUserRole: vi.fn(),
  getUserOrganizations: vi.fn(),
  createAuditLog: vi.fn(),
}));
vi.mock('../storage', () => ({ storage: s }));

import { OrganizationService } from '../services/organization-service';

const ORG = 'org-1';
const org = { id: ORG, name: 'Org', aiStyleExample: 'STYLE-EXAMPLE' };

const asMember = (role: string) => {
  s.getUser.mockResolvedValue({ id: 'u', isSiteAdmin: false });
  s.getUserOrganizations.mockResolvedValue([{ userId: 'u', organizationId: ORG, role, organization: org }]);
  s.getUserRole.mockResolvedValue(role); // membership role only: storage.getUserRole never says 'site_admin'
};

describe('OrganizationService.getOrganizationById and aiStyleExample', () => {
  const service = new OrganizationService();
  beforeEach(() => {
    vi.clearAllMocks();
    s.getOrganization.mockResolvedValue(org);
    s.createAuditLog.mockResolvedValue(undefined);
  });

  it('gives it to a site admin who is not a member of the organization', async () => {
    s.getUser.mockResolvedValue({ id: 'sa', isSiteAdmin: true });
    s.getUserRole.mockResolvedValue(null);
    expect((await service.getOrganizationById(ORG, 'sa'))?.aiStyleExample).toBe('STYLE-EXAMPLE');
  });

  it('gives it to an org admin', async () => {
    asMember('org_admin');
    expect((await service.getOrganizationById(ORG, 'u'))?.aiStyleExample).toBe('STYLE-EXAMPLE');
  });

  it.each(['coach', 'athlete'])('keeps it from a %s, who still gets the organization', async (role) => {
    asMember(role);
    const result = await service.getOrganizationById(ORG, 'u');
    expect(result).not.toBeNull();
    expect(result).not.toHaveProperty('aiStyleExample');
  });
});
