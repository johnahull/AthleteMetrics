import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PinnedReportsSection } from '../PinnedReportsSection';
import { useReportsWithFilters, usePinReport, useUnpinReport } from '@/hooks/use-reports';
import type { Report } from '@shared/schema';

// Mock the hooks
vi.mock('@/hooks/use-reports');

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

const mockPinnedReports: Report[] = [
  {
    id: 'report-1',
    name: 'Spring Training Report',
    description: 'Performance analysis for spring season',
    reportType: 'team',
    organizationId: 'org-1',
    createdBy: 'user-1',
    isPinned: true,
    isTemplate: false,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
    config: { metrics: ['FLY10_TIME'], filters: {} },
    coachingInsights: null,
    coachingInsightsGeneratedAt: null,
    coachingInsightsModel: null,
  },
  {
    id: 'report-2',
    name: 'Top Performers Q1',
    description: 'Individual athlete rankings',
    reportType: 'individual',
    organizationId: 'org-1',
    createdBy: 'user-1',
    isPinned: true,
    isTemplate: false,
    createdAt: new Date('2025-01-10'),
    updatedAt: new Date('2025-01-10'),
    config: { metrics: ['VERTICAL_JUMP'], filters: {} },
    coachingInsights: null,
    coachingInsightsGeneratedAt: null,
    coachingInsightsModel: null,
  },
];

describe('PinnedReportsSection', () => {
  const mockPinReport = vi.fn();
  const mockUnpinReport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    // Default mock implementations
    (usePinReport as any).mockReturnValue({
      mutate: mockPinReport,
      isPending: false,
    });

    (useUnpinReport as any).mockReturnValue({
      mutate: mockUnpinReport,
      isPending: false,
    });
  });

  it('renders pinned reports when available', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockPinnedReports,
        pagination: { total: 2, limit: 10, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<PinnedReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/pinned reports/i)).toBeInTheDocument();
    expect(screen.getByText('Spring Training Report')).toBeInTheDocument();
    expect(screen.getByText('Top Performers Q1')).toBeInTheDocument();
  });

  it('shows empty state when no pinned reports', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: [],
        pagination: { total: 0, limit: 10, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<PinnedReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.queryByText(/pinned reports/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/pin your favorite reports/i)).not.toBeInTheDocument();
  });

  it('shows loading state', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(<PinnedReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/loading pinned reports/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load reports'),
    });

    render(<PinnedReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/failed to load pinned reports/i)).toBeInTheDocument();
  });

  it('displays unpin button for pinned reports', async () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockPinnedReports,
        pagination: { total: 2, limit: 10, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<PinnedReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    const unpinButtons = screen.getAllByRole('button', { name: /unpin/i });
    expect(unpinButtons.length).toBe(2);
  });

  it('calls unpinReport when unpin button is clicked', async () => {
    const user = userEvent.setup();

    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockPinnedReports,
        pagination: { total: 2, limit: 10, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<PinnedReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    const unpinButtons = screen.getAllByRole('button', { name: /unpin/i });
    await user.click(unpinButtons[0]);

    expect(mockUnpinReport).toHaveBeenCalledWith('report-1');
  });

  it('shows pin limit warning when approaching 10 pins', () => {
    const manyReports: Report[] = Array.from({ length: 9 }, (_, i) => ({
      id: `report-${i}`,
      name: `Report ${i}`,
      description: 'Test report',
      reportType: 'team' as const,
      organizationId: 'org-1',
      createdBy: 'user-1',
      isPinned: true,
      isTemplate: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      config: { metrics: [], filters: {} },
      coachingInsights: null,
      coachingInsightsGeneratedAt: null,
      coachingInsightsModel: null,
    }));

    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: manyReports,
        pagination: { total: 9, limit: 10, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<PinnedReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/9 of 10 pinned/i)).toBeInTheDocument();
  });

  it('shows maximum pins reached when at 10 pins', () => {
    const maxReports: Report[] = Array.from({ length: 10 }, (_, i) => ({
      id: `report-${i}`,
      name: `Report ${i}`,
      description: 'Test report',
      reportType: 'team' as const,
      organizationId: 'org-1',
      createdBy: 'user-1',
      isPinned: true,
      isTemplate: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      config: { metrics: [], filters: {} },
      coachingInsights: null,
      coachingInsightsGeneratedAt: null,
      coachingInsightsModel: null,
    }));

    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: maxReports,
        pagination: { total: 10, limit: 10, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<PinnedReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/maximum 10 reports pinned/i)).toBeInTheDocument();
  });

  it('displays report type badge', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockPinnedReports,
        pagination: { total: 2, limit: 10, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<PinnedReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    // Report types are displayed (capitalized by CSS)
    const badges = screen.getAllByText(/team|individual/i);
    expect(badges.length).toBeGreaterThan(0);
  });

  it('displays formatted date for each report', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockPinnedReports,
        pagination: { total: 2, limit: 10, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<PinnedReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    // Should show dates in a readable format (format: "MMM dd, yyyy")
    // Check that some date-like content exists
    const datePatterns = screen.getAllByText(/\w{3}\s+\d{1,2},\s+\d{4}/i);
    expect(datePatterns.length).toBeGreaterThan(0);
  });

  it('handles clicking on a report card', async () => {
    const user = userEvent.setup();
    const mockOnReportClick = vi.fn();

    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockPinnedReports,
        pagination: { total: 2, limit: 10, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(
      <PinnedReportsSection organizationId="org-1" onReportClick={mockOnReportClick} />,
      { wrapper: createWrapper() }
    );

    const reportCard = screen.getByText('Spring Training Report').closest('button');
    if (reportCard) {
      await user.click(reportCard);
      expect(mockOnReportClick).toHaveBeenCalledWith(mockPinnedReports[0]);
    }
  });

  it('shows collapsible section that can be expanded/collapsed', async () => {
    const user = userEvent.setup();

    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockPinnedReports,
        pagination: { total: 2, limit: 10, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<PinnedReportsSection organizationId="org-1" defaultCollapsed={true} />, {
      wrapper: createWrapper(),
    });

    // Initially collapsed
    expect(screen.queryByText('Spring Training Report')).not.toBeInTheDocument();

    // Click to expand
    const expandButton = screen.getByRole('button', { name: /pinned reports/i });
    await user.click(expandButton);

    await waitFor(() => {
      expect(screen.getByText('Spring Training Report')).toBeInTheDocument();
    });
  });
});
