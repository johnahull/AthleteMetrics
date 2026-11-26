/**
 * useWellnessAnalytics: responses on an organization's own templates are grouped with their template.
 * The fetch mock mirrors the server: the public /api/wellness/templates/:id route serves system templates only,
 * the organization-scoped route serves the organization's templates and system templates.
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { act, renderHook, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import React from 'react';
import { useWellnessAnalytics } from '../use-wellness-analytics';
import { useUpdateWellnessTemplate } from '../use-wellness-templates';

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

  const newWrapper = (): React.FC<{ children: React.ReactNode }> => {
    const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    return ({ children }) => React.createElement(QueryClientProvider, { client: queryClient }, children);
  };

  beforeEach(() => {
    wrapper = newWrapper();
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

  const scaleFor = async (responses: unknown[]) => {
    mockServer(responses);
    const { result, unmount } = renderHook(
      () => useWellnessAnalytics({ organizationId: ORG, filters: { dateFrom: '2025-01-01', dateTo: '2025-01-31' } }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.templates).toHaveLength(2));
    const scale = { orientation: result.current.scaleOrientation, range: result.current.scaleRange };
    unmount();
    return scale;
  };

  it.each([
    ['org-tpl', 'system-tpl', { orientation: 'lower_is_better', range: 5 }],
    ['system-tpl', 'org-tpl', { orientation: 'higher_is_better', range: 10 }],
  ])('with mixed scales, reads orientation and range from the most used template (%s), in any response order', async (most, other, expected) => {
    const responses = [
      response('r1', other, '2025-01-10', 2),
      response('r2', most, '2025-01-11', 4),
      response('r3', most, '2025-01-20', 3),
    ];

    expect(await scaleFor(responses)).toEqual(expected);
    wrapper = newWrapper();
    expect(await scaleFor([...responses].reverse())).toEqual(expected);
  });

  it('with equally used templates, picks the lowest template id, in any response order', async () => {
    const responses = [response('r1', 'system-tpl', '2025-01-10', 8), response('r2', 'org-tpl', '2025-01-11', 2)];
    const expected = { orientation: 'lower_is_better', range: 5 };

    expect(await scaleFor(responses)).toEqual(expected);
    wrapper = newWrapper();
    expect(await scaleFor([...responses].reverse())).toEqual(expected);
  });

  it('reloads templates after a template is edited', async () => {
    mockServer([response('r1', 'org-tpl', '2025-01-10', 2)]);
    const serve = global.fetch as any;
    let name = 'org-tpl';
    global.fetch = vi.fn((url: string, init?: RequestInit) => {
      if (init?.method === 'PUT') {
        name = 'Renamed';
        return ok({});
      }
      if (url === `/api/organizations/${ORG}/wellness/templates/org-tpl`) return ok({ ...orgTemplate, name });
      return serve(url);
    }) as any;
    const { result } = renderHook(
      () => ({
        analytics: useWellnessAnalytics({ organizationId: ORG, filters: { dateFrom: '2025-01-01', dateTo: '2025-01-31' } }),
        update: useUpdateWellnessTemplate(ORG),
      }),
      { wrapper },
    );
    await waitFor(() => expect(result.current.analytics.templates?.[0]?.name).toBe('org-tpl'));

    await act(() => result.current.update.mutateAsync({ id: 'org-tpl', updates: { name: 'Renamed' } }));

    await waitFor(() => expect(result.current.analytics.templates?.[0]?.name).toBe('Renamed'));
  });
});
