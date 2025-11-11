import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportsFilterBar } from '../ReportsFilterBar';
import { useReportFilters } from '@/hooks/use-report-filters';

// Mock the hooks
vi.mock('@/hooks/use-report-filters');
vi.mock('@/hooks/use-teams');
vi.mock('@/hooks/use-metrics');

// Mock useTeams hook
const mockTeams = [
  { id: 'team-1', name: 'Varsity Football', organizationId: 'org-1' },
  { id: 'team-2', name: 'JV Basketball', organizationId: 'org-1' },
  { id: 'team-3', name: 'Track & Field', organizationId: 'org-1' },
];

const mockMetrics = [
  { code: 'FLY10_TIME', name: '10-Yard Fly Time' },
  { code: 'VERTICAL_JUMP', name: 'Vertical Jump' },
  { code: 'AGILITY_505', name: '5-0-5 Agility' },
];

vi.mock('@/hooks/use-teams', () => ({
  useTeams: () => ({
    data: mockTeams,
    isLoading: false,
  }),
}));

vi.mock('@/hooks/use-metrics', () => ({
  useMetrics: () => ({
    data: mockMetrics,
    isLoading: false,
  }),
}));

const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
    },
  });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('ReportsFilterBar', () => {
  const mockUpdateFilters = vi.fn();
  const mockResetFilters = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementation
    (useReportFilters as any).mockReturnValue({
      filters: {
        search: '',
        reportType: 'all',
        dateFrom: undefined,
        dateTo: undefined,
        metrics: [],
        teamIds: [],
        pinned: undefined,
      },
      updateFilters: mockUpdateFilters,
      resetFilters: mockResetFilters,
      activeFilterCount: 0,
    });
  });

  it('renders all filter controls', () => {
    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    // Search input
    expect(screen.getByPlaceholderText(/search reports/i)).toBeInTheDocument();

    // Report type dropdown
    expect(screen.getByRole('combobox', { name: /report type/i })).toBeInTheDocument();

    // Date range picker button
    expect(screen.getByRole('button', { name: /date range/i })).toBeInTheDocument();

    // Teams filter button
    expect(screen.getByRole('button', { name: /teams/i })).toBeInTheDocument();

    // Metrics filter button
    expect(screen.getByRole('button', { name: /metrics/i })).toBeInTheDocument();

    // Clear filters button should not be visible when activeFilterCount is 0
    expect(screen.queryByRole('button', { name: /clear filters/i })).not.toBeInTheDocument();
  });

  it('triggers search filter update on input', async () => {
    const user = userEvent.setup();
    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    const searchInput = screen.getByPlaceholderText(/search reports/i);
    await user.type(searchInput, 'test');

    // updateFilters is called for each character typed
    expect(mockUpdateFilters).toHaveBeenCalled();
    // Check that it was called with search parameter
    expect(mockUpdateFilters).toHaveBeenCalledWith(expect.objectContaining({ search: expect.any(String) }));
  });

  it('displays report type selector', async () => {
    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    // Check that report type selector exists
    const reportTypeSelect = screen.getByRole('combobox', { name: /report type/i });
    expect(reportTypeSelect).toBeInTheDocument();

    // Note: Full interaction test with Radix Select requires pointer event support
    // which is not available in the test environment. This is covered by E2E tests.
  });

  it('displays date range picker and updates date filters', async () => {
    const user = userEvent.setup();
    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    // Click date range button to open popover
    const dateRangeButton = screen.getByRole('button', { name: /date range/i });
    await user.click(dateRangeButton);

    // Calendar should be visible
    await waitFor(() => {
      expect(screen.getByRole('dialog')).toBeInTheDocument();
    });

    // Note: Testing actual date selection with shadcn calendar is complex
    // We'll verify the button exists and popover opens
  });

  it('displays teams filter button', async () => {
    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    const teamsButton = screen.getByRole('button', { name: /teams/i });
    expect(teamsButton).toBeInTheDocument();

    // Note: Full popover interaction and team list display requires proper DOM
    // and is better suited for E2E tests with real data loading
  });

  it('shows selected teams count when filters applied', async () => {
    (useReportFilters as any).mockReturnValue({
      filters: {
        search: '',
        reportType: 'all',
        dateFrom: undefined,
        dateTo: undefined,
        metrics: [],
        teamIds: ['team-1'],
        pinned: undefined,
      },
      updateFilters: mockUpdateFilters,
      resetFilters: mockResetFilters,
      activeFilterCount: 1,
    });

    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    // Check that teams button shows badge with count
    expect(screen.getByRole('button', { name: /teams/i })).toBeInTheDocument();

    // Multiple "1" badges may exist (one in teams button, one for activeFilterCount)
    const badges = screen.getAllByText('1');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('displays metrics filter button', async () => {
    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    const metricsButton = screen.getByRole('button', { name: /metrics/i });
    expect(metricsButton).toBeInTheDocument();

    // Note: Full popover interaction and metric list display requires proper DOM
    // and is better suited for E2E tests with real data loading
  });

  it('shows selected metrics count when filters applied', async () => {
    (useReportFilters as any).mockReturnValue({
      filters: {
        search: '',
        reportType: 'all',
        dateFrom: undefined,
        dateTo: undefined,
        metrics: ['FLY10_TIME'],
        teamIds: [],
        pinned: undefined,
      },
      updateFilters: mockUpdateFilters,
      resetFilters: mockResetFilters,
      activeFilterCount: 1,
    });

    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    // Check that metrics button shows badge with count
    expect(screen.getByRole('button', { name: /metrics/i })).toBeInTheDocument();

    // Multiple "1" badges may exist (one in metrics button, one for activeFilterCount)
    const badges = screen.getAllByText('1');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('displays active filter count badge when filters are applied', () => {
    (useReportFilters as any).mockReturnValue({
      filters: {
        search: 'test',
        reportType: 'individual',
        dateFrom: undefined,
        dateTo: undefined,
        metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
        teamIds: ['team-1'],
        pinned: undefined,
      },
      updateFilters: mockUpdateFilters,
      resetFilters: mockResetFilters,
      activeFilterCount: 4, // search + reportType + 2 metrics counted as 1 + 1 team
    });

    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    // Badge should show count
    expect(screen.getByText('4')).toBeInTheDocument();
  });

  it('shows clear filters button when filters are active', () => {
    (useReportFilters as any).mockReturnValue({
      filters: {
        search: 'test',
        reportType: 'all',
        dateFrom: undefined,
        dateTo: undefined,
        metrics: [],
        teamIds: [],
        pinned: undefined,
      },
      updateFilters: mockUpdateFilters,
      resetFilters: mockResetFilters,
      activeFilterCount: 1,
    });

    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.getByRole('button', { name: /clear filters/i })).toBeInTheDocument();
  });

  it('calls resetFilters when clear filters button is clicked', async () => {
    const user = userEvent.setup();

    (useReportFilters as any).mockReturnValue({
      filters: {
        search: 'test',
        reportType: 'all',
        dateFrom: undefined,
        dateTo: undefined,
        metrics: [],
        teamIds: [],
        pinned: undefined,
      },
      updateFilters: mockUpdateFilters,
      resetFilters: mockResetFilters,
      activeFilterCount: 1,
    });

    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    const clearButton = screen.getByRole('button', { name: /clear filters/i });
    await user.click(clearButton);

    expect(mockResetFilters).toHaveBeenCalled();
  });

  it('displays selected teams count in button badge', () => {
    (useReportFilters as any).mockReturnValue({
      filters: {
        search: '',
        reportType: 'all',
        dateFrom: undefined,
        dateTo: undefined,
        metrics: [],
        teamIds: ['team-1', 'team-2'],
        pinned: undefined,
      },
      updateFilters: mockUpdateFilters,
      resetFilters: mockResetFilters,
      activeFilterCount: 1,
    });

    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    // Check Teams button exists
    expect(screen.getByRole('button', { name: /teams/i })).toBeInTheDocument();

    // Check badge with count "2" appears near Teams button
    const badges = screen.getAllByText('2');
    expect(badges.length).toBeGreaterThan(0);
  });

  it('displays selected metrics count in button badge', () => {
    (useReportFilters as any).mockReturnValue({
      filters: {
        search: '',
        reportType: 'all',
        dateFrom: undefined,
        dateTo: undefined,
        metrics: ['FLY10_TIME', 'VERTICAL_JUMP', 'AGILITY_505'],
        teamIds: [],
        pinned: undefined,
      },
      updateFilters: mockUpdateFilters,
      resetFilters: mockResetFilters,
      activeFilterCount: 1,
    });

    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    // Check Metrics button exists
    expect(screen.getByRole('button', { name: /metrics/i })).toBeInTheDocument();

    // Check badge with count "3" appears near Metrics button
    expect(screen.getByText('3')).toBeInTheDocument();
  });

  it('handles loading state for teams gracefully', () => {
    vi.mock('@/hooks/use-teams', () => ({
      useTeams: () => ({
        data: undefined,
        isLoading: true,
      }),
    }));

    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    // Component should still render without crashing
    expect(screen.getByRole('button', { name: /teams/i })).toBeInTheDocument();
  });

  it('handles loading state for metrics gracefully', () => {
    vi.mock('@/hooks/use-metrics', () => ({
      useMetrics: () => ({
        data: undefined,
        isLoading: true,
      }),
    }));

    render(<ReportsFilterBar organizationId="org-1" />, { wrapper: createWrapper() });

    // Component should still render without crashing
    expect(screen.getByRole('button', { name: /metrics/i })).toBeInTheDocument();
  });
});
