/** The organization list spans organizations the caller does not administer: only site admins get aiStyleExample. */
import { describe, it, expect, beforeEach, vi } from 'vitest';

const getUser = vi.fn();
const getOrganizations = vi.fn();
vi.mock('../services/metric-service', () => ({ MetricService: vi.fn().mockImplementation(() => ({})) }));
vi.mock('../services/benchmark-service', () => ({ BenchmarkService: vi.fn().mockImplementation(() => ({})) }));
vi.mock('../storage', () => ({
  storage: {
    getUser: (...a: unknown[]) => getUser(...a),
    getOrganizations: (...a: unknown[]) => getOrganizations(...a),
    createAuditLog: vi.fn(),
  },
}));

import { OrganizationTypeService } from '../services/organization-type-service';

const orgs = () => [{ id: 'o1', name: 'One', aiStyleExample: 'SECRET-STYLE' }, { id: 'o2', name: 'Two', aiStyleExample: null }];

describe('OrganizationTypeService.getOrganizationsByType style example', () => {
  let service: OrganizationTypeService;
  beforeEach(() => {
    vi.clearAllMocks();
    service = new OrganizationTypeService();
    getOrganizations.mockResolvedValue(orgs());
  });

  it('strips it for a non-site-admin, on the first call and from the cache', async () => {
    getUser.mockResolvedValue({ id: 'u', isSiteAdmin: false });
    for (let i = 0; i < 2; i++) {
      const res = await service.getOrganizationsByType('club', 'u');
      expect(JSON.stringify(res)).not.toContain('SECRET-STYLE');
      expect(res.map((o) => o.name)).toEqual(['One', 'Two']);
    }
    expect(getOrganizations).toHaveBeenCalledTimes(1);
  });

  it('keeps it for a site admin, even when the cache was filled by a non-admin first', async () => {
    getUser.mockResolvedValue({ id: 'u', isSiteAdmin: false });
    await service.getOrganizationsByType('club', 'u');
    getUser.mockResolvedValue({ id: 's', isSiteAdmin: true });
    expect(JSON.stringify(await service.getOrganizationsByType('club', 's'))).toContain('SECRET-STYLE');
  });
});
