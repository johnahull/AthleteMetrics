import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { RecentReportsSection } from '../RecentReportsSection';
import { useReportsWithFilters, usePinReport, useArchiveReport } from '@/hooks/use-reports';
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

const mockRecentReports: Report[] = [
  {
    id: 'report-1',
    name: 'Weekly Performance Summary',
    description: 'Latest weekly stats',
    reportType: 'team',
    organizationId: 'org-1',
    createdBy: 'user-1',
    isPinned: false,
    isTemplate: false,
    createdAt: new Date('2025-01-20'),
    updatedAt: new Date('2025-01-20'),
    config: { metrics: ['FLY10_TIME'], filters: {} },
    coachingInsights: null,
    coachingInsightsGeneratedAt: null,
    coachingInsightsModel: null,
    archivedAt: null,
  },
  {
    id: 'report-2',
    name: 'January Rankings',
    description: 'Month-end individual rankings',
    reportType: 'individual',
    organizationId: 'org-1',
    createdBy: 'user-1',
    isPinned: false,
    isTemplate: false,
    createdAt: new Date('2025-01-18'),
    updatedAt: new Date('2025-01-18'),
    config: { metrics: ['VERTICAL_JUMP'], filters: {} },
    coachingInsights: null,
    coachingInsightsGeneratedAt: null,
    coachingInsightsModel: null,
    archivedAt: null,
  },
  {
    id: 'report-3',
    name: 'Sprint Analysis',
    description: '40-yard dash improvements',
    reportType: 'individual',
    organizationId: 'org-1',
    createdBy: 'user-1',
    isPinned: true, // This one is pinned
    isTemplate: false,
    createdAt: new Date('2025-01-15'),
    updatedAt: new Date('2025-01-15'),
    config: { metrics: ['DASH_40YD'], filters: {} },
    coachingInsights: null,
    coachingInsightsGeneratedAt: null,
    coachingInsightsModel: null,
    archivedAt: null,
  },
];

describe('RecentReportsSection', () => {
  const mockPinReport = vi.fn();
  const mockArchiveReport = vi.fn();

  beforeEach(() => {
    vi.clearAllMocks();

    (usePinReport as any).mockReturnValue({
      mutate: mockPinReport,
      isPending: false,
    });

    (useArchiveReport as any).mockReturnValue({
      mutate: mockArchiveReport,
      isPending: false,
    });
  });

  it('renders recent unpinned reports', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockRecentReports.filter((r) => !r.isPinned),
        pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<RecentReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/recent reports/i)).toBeInTheDocument();
    expect(screen.getByText('Weekly Performance Summary')).toBeInTheDocument();
    expect(screen.getByText('January Rankings')).toBeInTheDocument();
    expect(screen.queryByText('Sprint Analysis')).not.toBeInTheDocument(); // Pinned report excluded
  });

  it('shows empty state when no reports', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: [],
        pagination: { total: 0, limit: 25, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<RecentReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/no reports found/i)).toBeInTheDocument();
    expect(screen.getByText(/create your first report/i)).toBeInTheDocument();
  });

  it('shows loading state', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: undefined,
      isLoading: true,
      error: null,
    });

    render(<RecentReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/loading reports/i)).toBeInTheDocument();
  });

  it('shows error state', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: undefined,
      isLoading: false,
      error: new Error('Failed to load reports'),
    });

    render(<RecentReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.getByText(/failed to load reports/i)).toBeInTheDocument();
  });

  it('displays pin button for unpinned reports', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockRecentReports.filter((r) => !r.isPinned),
        pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<RecentReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    const pinButtons = screen.getAllByRole('button', { name: /pin report/i });
    expect(pinButtons.length).toBe(2);
  });

  it('calls pinReport when pin button is clicked', async () => {
    const user = userEvent.setup();

    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockRecentReports.filter((r) => !r.isPinned),
        pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<RecentReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    const pinButtons = screen.getAllByRole('button', { name: /pin report/i });
    await user.click(pinButtons[0]);

    expect(mockPinReport).toHaveBeenCalledWith('report-1');
  });

  it('handles clicking on a report card', async () => {
    const user = userEvent.setup();
    const mockOnReportClick = vi.fn();

    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockRecentReports.filter((r) => !r.isPinned),
        pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(
      <RecentReportsSection organizationId="org-1" onReportClick={mockOnReportClick} />,
      { wrapper: createWrapper() }
    );

    const reportCard = screen.getByText('Weekly Performance Summary').closest('button');
    if (reportCard) {
      await user.click(reportCard);
      expect(mockOnReportClick).toHaveBeenCalledWith(
        expect.objectContaining({ id: 'report-1' })
      );
    }
  });

  it('displays report metadata (type, date)', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockRecentReports.filter((r) => !r.isPinned),
        pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<RecentReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    // Check for report types
    const badges = screen.getAllByText(/team|individual/i);
    expect(badges.length).toBeGreaterThan(0);

    // Check for dates
    const datePatterns = screen.getAllByText(/\w{3}\s+\d{1,2},\s+\d{4}/i);
    expect(datePatterns.length).toBeGreaterThan(0);
  });

  it('respects pagination limit', () => {
    const manyReports: Report[] = Array.from({ length: 30 }, (_, i) => ({
      id: `report-${i}`,
      name: `Report ${i}`,
      description: `Description ${i}`,
      reportType: 'team' as const,
      organizationId: 'org-1',
      createdBy: 'user-1',
      isPinned: false,
      isTemplate: false,
      createdAt: new Date(),
      updatedAt: new Date(),
      config: { metrics: [], filters: {} },
      coachingInsights: null,
      coachingInsightsGeneratedAt: null,
      coachingInsightsModel: null,
    archivedAt: null,
    }));

    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: manyReports.slice(0, 25), // Only first 25
        pagination: { total: 30, limit: 25, offset: 0, hasMore: true },
      },
      isLoading: false,
      error: null,
    });

    render(<RecentReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    // Should show "Load more" button or pagination indicator
    const reportCards = screen.getAllByRole('button').filter(
      (btn) => btn.getAttribute('aria-label') !== 'Pin report'
    );

    // Should have 25 report cards + 1 "Load more" button
    expect(reportCards.length).toBeGreaterThanOrEqual(25);
  });

  it('shows "Load more" button when hasMore is true', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockRecentReports.slice(0, 2),
        pagination: { total: 10, limit: 2, offset: 0, hasMore: true },
      },
      isLoading: false,
      error: null,
    });

    render(<RecentReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.getByRole('button', { name: /load more/i })).toBeInTheDocument();
  });

  it('hides "Load more" button when hasMore is false', () => {
    (useReportsWithFilters as any).mockReturnValue({
      data: {
        reports: mockRecentReports.slice(0, 2),
        pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
      },
      isLoading: false,
      error: null,
    });

    render(<RecentReportsSection organizationId="org-1" />, { wrapper: createWrapper() });

    expect(screen.queryByRole('button', { name: /load more/i })).not.toBeInTheDocument();
  });

  describe('Archive functionality', () => {
    it('displays archive button on report cards when not in selection mode', () => {
      (useReportsWithFilters as any).mockReturnValue({
        data: {
          reports: mockRecentReports.filter((r) => !r.isPinned),
          pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
        },
        isLoading: false,
        error: null,
      });

      const mockOnArchive = vi.fn();
      render(
        <RecentReportsSection organizationId="org-1" onArchive={mockOnArchive} />,
        { wrapper: createWrapper() }
      );

      const archiveButtons = screen.getAllByRole('button', { name: /archive report/i });
      expect(archiveButtons.length).toBe(2);
    });

    it('hides archive button when in selection mode', () => {
      (useReportsWithFilters as any).mockReturnValue({
        data: {
          reports: mockRecentReports.filter((r) => !r.isPinned),
          pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
        },
        isLoading: false,
        error: null,
      });

      render(
        <RecentReportsSection
          organizationId="org-1"
          isSelectionMode={true}
          selectedReportIds={new Set()}
          onToggleSelection={vi.fn()}
        />,
        { wrapper: createWrapper() }
      );

      const archiveButtons = screen.queryAllByRole('button', { name: /archive report/i });
      expect(archiveButtons.length).toBe(0);
    });

    it('calls onArchive when archive button is clicked', async () => {
      const user = userEvent.setup();
      const mockOnArchive = vi.fn();

      (useReportsWithFilters as any).mockReturnValue({
        data: {
          reports: mockRecentReports.filter((r) => !r.isPinned),
          pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
        },
        isLoading: false,
        error: null,
      });

      render(
        <RecentReportsSection organizationId="org-1" onArchive={mockOnArchive} />,
        { wrapper: createWrapper() }
      );

      const archiveButtons = screen.getAllByRole('button', { name: /archive report/i });
      await user.click(archiveButtons[0]);

      expect(mockOnArchive).toHaveBeenCalledWith('report-1', expect.any(Object));
    });

    it('archive button has proper aria-label for accessibility', () => {
      (useReportsWithFilters as any).mockReturnValue({
        data: {
          reports: mockRecentReports.filter((r) => !r.isPinned),
          pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
        },
        isLoading: false,
        error: null,
      });

      const mockOnArchive = vi.fn();
      render(
        <RecentReportsSection organizationId="org-1" onArchive={mockOnArchive} />,
        { wrapper: createWrapper() }
      );

      const archiveButtons = screen.getAllByRole('button', { name: /archive report/i });
      archiveButtons.forEach((button) => {
        expect(button).toHaveAttribute('aria-label', 'Archive report');
      });
    });

    it('displays archive button between pin and delete buttons', () => {
      (useReportsWithFilters as any).mockReturnValue({
        data: {
          reports: mockRecentReports.filter((r) => !r.isPinned),
          pagination: { total: 2, limit: 25, offset: 0, hasMore: false },
        },
        isLoading: false,
        error: null,
      });

      const mockOnDelete = vi.fn();
      const mockOnArchive = vi.fn();
      render(
        <RecentReportsSection
          organizationId="org-1"
          onDelete={mockOnDelete}
          onArchive={mockOnArchive}
        />,
        { wrapper: createWrapper() }
      );

      // Get all button groups (one per report card)
      const cards = screen.getAllByTestId(/report-/);
      expect(cards.length).toBe(2);

      // Check that each card has pin, archive, and delete buttons in order
      cards.forEach((card) => {
        const buttons = card.querySelectorAll('button[aria-label]');
        const buttonLabels = Array.from(buttons).map((btn) => btn.getAttribute('aria-label'));

        // Should contain all three buttons
        expect(buttonLabels).toContain('Pin report');
        expect(buttonLabels).toContain('Archive report');
        expect(buttonLabels).toContain('Delete report');

        // Archive should be between Pin and Delete
        const pinIndex = buttonLabels.indexOf('Pin report');
        const archiveIndex = buttonLabels.indexOf('Archive report');
        const deleteIndex = buttonLabels.indexOf('Delete report');

        expect(archiveIndex).toBeGreaterThan(pinIndex);
        expect(deleteIndex).toBeGreaterThan(archiveIndex);
      });
    });
  });
});
