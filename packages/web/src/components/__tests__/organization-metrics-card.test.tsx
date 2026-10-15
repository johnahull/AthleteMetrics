/**
 * Flipping metric switches only stages the change; Save sends one bulk request, so enabling
 * many metrics cannot exhaust the per-user rate limits.
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import OrganizationMetricsCard from '../organization-metrics-card';

vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));
vi.mock('@/lib/sports-api', () => ({ useSports: () => ({ data: [] }) }));
vi.mock('@/lib/organization-api', () => ({ useOrganization: () => ({ data: { customMetricsEnabled: false } }) }));
vi.mock('@/lib/custom-metrics-api', () => ({
  useCustomOrgMetrics: () => ({ data: [], isLoading: false }),
  useArchiveCustomOrgMetric: () => ({ mutateAsync: vi.fn() }),
  useRestoreCustomOrgMetric: () => ({ mutateAsync: vi.fn() }),
}));

const ORG = '11111111-1111-1111-1111-111111111111';
const site = (code: string) => ({ code, label: code, isActive: true, sportAssociations: null });
const orgRow = (metricCode: string, isEnabled: boolean) => ({ id: `om-${metricCode}`, organizationId: ORG, metricCode, isEnabled });

let fetchMock: ReturnType<typeof vi.fn>;
let savedA = false;

beforeEach(() => {
  savedA = false;
  fetchMock = vi.fn(async (input: any, init?: any) => {
    const u = String(input);
    const json = (b: unknown) => ({ ok: true, json: async () => b }) as any;
    if (u.includes('/metrics/bulk-update')) {
      const body = JSON.parse(init.body);
      return json([...body.enable.map((c: string) => orgRow(c, true)), ...body.disable.map((c: string) => orgRow(c, false))]);
    }
    if (u.startsWith('/api/metrics')) return json([site('A'), site('B'), site('C')]);
    if (u.includes('/metrics')) return json([orgRow('A', savedA), orgRow('B', true), orgRow('C', false)].map((r) => ({ ...r, siteMetric: site(r.metricCode) })));
    return json([]);
  });
  vi.stubGlobal('fetch', fetchMock);
});

function renderCard() {
  const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  const utils = render(
    <QueryClientProvider client={qc}>
      <OrganizationMetricsCard organizationId={ORG} canEdit />
    </QueryClientProvider>
  );
  return { ...utils, qc };
}
const posts = () => fetchMock.mock.calls.filter(([, init]) => init?.method === 'POST');

describe('OrganizationMetricsCard staged toggles', () => {
  it('sends nothing while switches are flipped, then one bulk request on Save', async () => {
    renderCard();
    const a = await screen.findByTestId('toggle-metric-A');
    fireEvent.click(a);
    fireEvent.click(screen.getByTestId('toggle-metric-B'));
    fireEvent.click(screen.getByTestId('toggle-metric-C'));

    expect(posts()).toHaveLength(0);
    expect(a).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/3 unsaved changes/i)).toBeInTheDocument();

    fireEvent.click(screen.getByTestId('save-metric-changes'));

    await waitFor(() => expect(posts()).toHaveLength(1));
    const [url, init] = posts()[0];
    expect(url).toBe(`/api/organizations/${ORG}/metrics/bulk-update`);
    expect(JSON.parse(init.body)).toEqual({ enable: ['A', 'C'], disable: ['B'] });
    await waitFor(() => expect(screen.queryByTestId('save-metric-changes')).not.toBeInTheDocument());
  });

  it('flipping a switch back clears its staged change', async () => {
    renderCard();
    const a = await screen.findByTestId('toggle-metric-A');
    fireEvent.click(a);
    fireEvent.click(a);
    expect(screen.queryByTestId('save-metric-changes')).not.toBeInTheDocument();
  });

  it('Discard restores the saved state without a request', async () => {
    renderCard();
    const a = await screen.findByTestId('toggle-metric-A');
    fireEvent.click(a);
    fireEvent.click(screen.getByTestId('discard-metric-changes'));
    expect(a).toHaveAttribute('aria-checked', 'false');
    expect(posts()).toHaveLength(0);
  });

  it('drops a staged change once a refetch shows the server already has that state', async () => {
    const { qc } = renderCard();
    fireEvent.click(await screen.findByTestId('toggle-metric-A'));
    expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();

    savedA = true; // another admin enabled A
    await qc.invalidateQueries({ queryKey: ['organizationMetrics'] });

    await waitFor(() => expect(screen.queryByTestId('save-metric-changes')).not.toBeInTheDocument());
  });
});
