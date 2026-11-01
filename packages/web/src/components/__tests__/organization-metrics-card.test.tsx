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
let categories: Record<string, string | null> = {};
const site = (code: string) => ({
  code, label: code, isActive: true, sportAssociations: null, category: categories[code] ?? null, metricType: 'lower_is_better', description: `${code} description`,
  ...(code === 'C' ? { isDerived: true, formula: 'A + B', dependentMetrics: ['A', 'B'] } : { isDerived: false }),
});
const orgRow = (metricCode: string, isEnabled: boolean) => ({ id: `om-${metricCode}`, organizationId: ORG, metricCode, isEnabled });

let fetchMock: ReturnType<typeof vi.fn>;
let savedA = false;
let savedC: boolean | null = null; // null = no org_metrics row yet

beforeEach(() => {
  categories = {};
  savedA = false;
  savedC = null;
  fetchMock = vi.fn(async (input: any, init?: any) => {
    const u = String(input);
    const json = (b: unknown) => ({ ok: true, json: async () => b }) as any;
    if (u.includes('/metrics/bulk-update')) {
      const body = JSON.parse(init.body);
      if (body.enable.includes('C')) savedC = true;
      return json([...body.enable.map((c: string) => orgRow(c, true)), ...body.disable.map((c: string) => orgRow(c, false))]);
    }
    if (u.startsWith('/api/metrics')) return json([site('A'), site('B'), site('C')]);
    if (u.includes('/metrics')) return json([orgRow('A', savedA), orgRow('B', true), ...(savedC === null ? [] : [orgRow('C', savedC)])].map((r) => ({ ...r, siteMetric: site(r.metricCode) })));
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

  it('keeps a newly enabled metric on after Save when it had no saved row', async () => {
    renderCard();
    const c = await screen.findByTestId('toggle-metric-C');
    fireEvent.click(c);
    fireEvent.click(screen.getByTestId('save-metric-changes'));
    await waitFor(() => expect(screen.queryByTestId('save-metric-changes')).not.toBeInTheDocument());
    expect(c).toHaveAttribute('aria-checked', 'true');
  });

  it('does not carry staged changes over to another organization', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    const ui = (id: string) => (
      <QueryClientProvider client={qc}>
        <OrganizationMetricsCard key={id} organizationId={id} canEdit />
      </QueryClientProvider>
    );
    const { rerender } = render(ui(ORG));
    fireEvent.click(await screen.findByTestId('toggle-metric-A'));
    rerender(ui('22222222-2222-2222-2222-222222222222'));
    await screen.findByTestId('toggle-metric-A');
    expect(screen.queryByTestId('save-metric-changes')).not.toBeInTheDocument();
  });
});

describe('OrganizationMetricsCard category groups', () => {
  beforeEach(() => {
    categories = { A: 'Speed', B: 'speed', C: 'power' };
  });

  it('groups site metrics under category headers with counts, in report order', async () => {
    renderCard();
    expect(await screen.findByRole('button', { name: 'Speed, 2 metrics' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Power, 1 metric' })).toBeInTheDocument();
    const order = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace(/\d+$/, ''));
    expect(order).toEqual(['Speed', 'Power']);
  });

  it('links each group toggle to the rows it controls via aria-controls', async () => {
    renderCard();
    const toggle = await screen.findByRole('button', { name: /^Speed,/ });
    const controlsId = toggle.getAttribute('aria-controls');
    expect(controlsId).toBeTruthy();
    const region = document.getElementById(controlsId!);
    expect(region).not.toBeNull();
    expect(region).toContainElement(screen.getByTestId('org-metric-row-A'));
    fireEvent.click(toggle);
    expect(document.getElementById(controlsId!)).not.toBeNull();
  });

  it('keeps row and toggle test ids', async () => {
    renderCard();
    await screen.findByTestId('toggle-metric-A');
    for (const code of ['A', 'B', 'C']) {
      expect(screen.getByTestId(`org-metric-row-${code}`)).toBeInTheDocument();
    }
  });

  it('collapses one category and keeps staged toggles when it is reopened', async () => {
    renderCard();
    const a = await screen.findByTestId('toggle-metric-A');
    fireEvent.click(a);
    fireEvent.click(screen.getByRole('button', { name: /^Speed,/ }));
    expect(screen.queryByTestId('org-metric-row-A')).not.toBeInTheDocument();
    expect(screen.getByTestId('org-metric-row-C')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: /^Speed,/ }));
    expect(screen.getByTestId('toggle-metric-A')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByText(/1 unsaved change/i)).toBeInTheDocument();
  });

  it('puts metrics without a category under Other, last', async () => {
    categories = { A: 'Speed' };
    renderCard();
    expect(await screen.findByRole('button', { name: 'Other, 2 metrics' })).toBeInTheDocument();
    const order = screen.getAllByRole('heading', { level: 2 }).map((h) => h.textContent?.replace(/\d+$/, ''));
    expect(order).toEqual(['Speed', 'Other']);
  });
});

describe('OrganizationMetricsCard metric details', () => {
  it('opens a read-only detail dialog from a metric row', async () => {
    renderCard();
    fireEvent.click(await screen.findByTestId('metric-details-A'));
    expect(await screen.findByText('A description')).toBeInTheDocument();
    expect(screen.getByText('Lower is Better')).toBeInTheDocument();
  });

  it('marks calculated metrics and shows the formula in details', async () => {
    renderCard();
    expect(await screen.findByTestId('metric-calculated-C')).toBeInTheDocument();
    expect(screen.queryByTestId('metric-calculated-A')).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId('metric-details-C'));
    expect(await screen.findByText('A + B')).toBeInTheDocument();
  });

  it('lets a read-only viewer open details but not change anything', async () => {
    const qc = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={qc}>
        <OrganizationMetricsCard organizationId={ORG} canEdit={false} />
      </QueryClientProvider>
    );
    expect(await screen.findByTestId('toggle-metric-A')).toBeDisabled();
    expect(screen.getByTestId('edit-custom-label-B')).toBeDisabled();
    fireEvent.click(screen.getByTestId('metric-details-A'));
    expect(await screen.findByText('A description')).toBeInTheDocument();
  });
});
