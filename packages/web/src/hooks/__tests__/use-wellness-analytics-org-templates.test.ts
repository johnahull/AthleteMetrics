/**
 * useWellnessAnalytics: responses on an organization's own templates are grouped with their template.
 * The fetch mock mirrors the server: the public /api/wellness/templates/:id route serves system templates only,
 * the organization-scoped route serves the organization's templates and system templates.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useWellnessAnalytics } from '../use-wellness-analytics';

const ORG = 'org-123';

const scaleTemplate = (id: string, organizationId: string | null, scaleMax: number, scaleOrientation: string) => ({
  id,
  organizationId,
  name: id,
  config: {
    questions: [{ id: 'q1', type: 'scale', label: 'Q1', required: true, scaleMin: 1, scaleMax }],
    statusConfig: { scaleOrientation, calculationMethod: 'average', redThreshold: 3, yellowThreshold: 7, injuryQuestionIds: [], injuryOverride: true },
  },
});

const systemTemplate = scaleTemplate('system-tpl', null, 10, 'higher_is_better');
const orgTemplate = scaleTemplate('org-tpl', ORG, 5, 'lower_is_better');
const templates = [systemTemplate, orgTemplate];

const response = (id: string, templateId: string, date: string, value: number) => ({
  id,
  organizationId: ORG,
  templateId,
  userId: `user-${id}`,
  date,
  submittedAt: `${date}T10:00:00Z`,
  responses: { q1: { value, label: 'Q1' } },
});

const ok = (body: unknown) => Promise.resolve({ ok: true, json: async () => body });
const notFound = () => Promise.resolve({ ok: false, status: 404, json: async () => ({ message: 'Template not found' }) });

function mockServer(responses: unknown[]) {
  global.fetch = vi.fn((url: string) => {
    const orgScoped = url.match(/^\/api\/organizations\/([^/]+)\/wellness\/templates\/([^/?]+)$/);
    if (orgScoped) {
      const t = templates.find(x => x.id === orgScoped[2]);
      return t && (t.organizationId === orgScoped[1] || t.organizationId === null) ? ok(t) : notFound();
    }
    const pub = url.match(/^\/api\/wellness\/templates\/([^/?]+)$/);
    if (pub) {
      const t = templates.find(x => x.id === pub[1]);
      return t && t.organizationId === null ? ok(t) : notFound();
    }
    if (url.includes('/wellness/responses')) return ok(responses);
    if (url.includes('/wellness/analytics/trends')) return ok([]);
    if (url.includes('/wellness/requests')) return ok([]);
    return notFound();
  }) as any;
}

describe('useWellnessAnalytics - organization templates', () => {
  let wrapper: React.FC<{ children: React.ReactNode }>;

  beforeEach(() => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    wrapper = ({ children }) => React.createElement(QueryClientProvider, { client: queryClient }, children);
  });

  const render = () =>
    renderHook(() => useWellnessAnalytics({ organizationId: ORG, filters: { dateFrom: '2025-01-01', dateTo: '2025-01-31' } }), { wrapper });

  it('groups responses on an organization template with that template', async () => {
    mockServer([response('r1', 'org-tpl', '2025-01-10', 2), response('r2', 'system-tpl', '2025-01-11', 8)]);
    const { result } = render();

    await waitFor(() => expect(result.current.isLoading).toBe(false));
    expect(result.current.responsesByTemplate['org-tpl']?.responses).toHaveLength(1);
    expect(result.current.responsesByTemplate['system-tpl']?.responses).toHaveLength(1);
  });

  it('with mixed scales, still reads orientation and trend from the first template', async () => {
    mockServer([
      response('r1', 'org-tpl', '2025-01-10', 2),
      response('r2', 'system-tpl', '2025-01-11', 8),
      response('r3', 'org-tpl', '2025-01-20', 4),
    ]);
    const { result } = render();

    await waitFor(() => expect(result.current.templates).toHaveLength(2));
    // templates follow the order the responses name them, so the organization template comes first here
    expect(result.current.templates![0].id).toBe('org-tpl');
    expect(result.current.scaleOrientation).toBe('lower_is_better');
    expect(['up', 'down', 'stable']).toContain(result.current.summary?.trend);
  });
});
