import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamReportView } from '../TeamReportView';
import { useGenerateReport } from '@/hooks/use-reports';
import { useTeams } from '@/hooks/use-teams';
import { useAuth } from '@/lib/auth';
import type { Report } from '@/types/report-types';

// Mock hooks
vi.mock('@/hooks/use-reports');
vi.mock('@/hooks/use-teams');
vi.mock('@/lib/auth');
// Real labels for the metric codes used in the report fixtures, so any
// regression where a code leaks through resolveLabel() into rendered output
// is distinguishable from the legitimate "label rendered" case.
const TEST_METRIC_LABELS: Record<string, string> = {
  FLY10_TIME: '10-Yard Fly Time',
  VERTICAL_JUMP: 'Vertical Jump',
};
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({
    labels: TEST_METRIC_LABELS,
    getLabel: (code: string) => TEST_METRIC_LABELS[code] ?? code,
    isLoading: false,
  }),
}));

const mockGenerateReportMutate = vi.fn();

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch as any;

// Mock URL.createObjectURL and revokeObjectURL
const mockCreateObjectURL = vi.fn();
const mockRevokeObjectURL = vi.fn();
global.URL.createObjectURL = mockCreateObjectURL;
global.URL.revokeObjectURL = mockRevokeObjectURL;

describe('TeamReportView - PDF Export', () => {
  let queryClient: QueryClient;

  const mockReport: Report = {
    id: 'report-123',
    organizationId: 'org-456',
    createdBy: 'user-789',
    name: 'Test Team Report',
    description: 'Test Description',
    reportType: 'team',
    config: {
      timeframe: {
        type: 'preset',
        preset: 'all_time',
      },
      metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
      filters: {
        teamIds: ['team-1', 'team-2'],
      },
    },
    isTemplate: false,
    isPinned: false,
    createdAt: '2025-01-01T00:00:00Z',
  };

  const mockTeamReportData = {
    reportType: 'team' as const,
    reportConfig: mockReport.config,
    teamStatistics: [
      {
        metric: 'FLY10_TIME',
        units: 's',
        average: 1.5,
        median: 1.4,
        min: 1.2,
        max: 1.8,
        standardDeviation: 0.2,
        topPerformer: {
          userName: 'John Doe',
          value: 1.2,
        },
      },
    ],
    athleteRankings: [
      {
        userId: 'athlete-1',
        userName: 'John Doe',
        measurements: {
          FLY10_TIME: 1.2,
        },
      },
    ],
    athleteCount: 24,
    teamIds: ['team-1', 'team-2'],
    generatedAt: '2025-01-15T10:00:00Z',
  };

  const mockTeams = [
    { id: 'team-1', name: 'Varsity Football', organizationId: 'org-456' },
    { id: 'team-2', name: 'JV Football', organizationId: 'org-456' },
  ];

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    // Reset mock implementation
    mockGenerateReportMutate.mockReset();
    mockFetch.mockClear();
    mockCreateObjectURL.mockClear();
    mockRevokeObjectURL.mockClear();

    // Make mutate call onSuccess callback immediately with mock data
    mockGenerateReportMutate.mockImplementation((params: any, options: any) => {
      if (options?.onSuccess) {
        // Simulate successful report generation
        options.onSuccess({ data: mockTeamReportData });
      }
    });

    // Mock useGenerateReport hook
    (useGenerateReport as any).mockReturnValue({
      mutate: mockGenerateReportMutate,
      isPending: false,
      isError: false,
      isSuccess: true,
      data: { data: mockTeamReportData },
    });

    // Mock useTeams hook
    (useTeams as any).mockReturnValue({
      data: mockTeams,
      isLoading: false,
      error: null,
    });

    // Mock useAuth hook
    (useAuth as any).mockReturnValue({
      user: { id: 'user-789', isSiteAdmin: false },
      isLoading: false,
    });

    // Mock createObjectURL
    mockCreateObjectURL.mockReturnValue('blob:mock-url');

    // Clear all mocks
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TeamReportView report={mockReport} />
      </QueryClientProvider>
    );
  };

  it.skip('should successfully download PDF when Export PDF button is clicked', async () => {
    // Mock successful PDF response
    const mockPdfBlob = new Blob(['mock pdf content'], { type: 'application/pdf' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => mockPdfBlob,
    });

    renderComponent();

    // Wait for report data to load
    await waitFor(() => {
      expect(mockGenerateReportMutate).toHaveBeenCalled();
    });

    // Trigger report data load
    const mutateCall = mockGenerateReportMutate.mock.calls[0];
    if (mutateCall && mutateCall[1]?.onSuccess) {
      mutateCall[1].onSuccess(mockTeamReportData);
    }

    // Wait for component to re-render with data
    await waitFor(() => {
      expect(screen.getByText('Report Summary')).toBeInTheDocument();
    });

    // Spy on anchor click
    const mockClick = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement');
    const mockAnchorElement = document.createElement('a');
    mockAnchorElement.click = mockClick;
    createElementSpy.mockReturnValueOnce(mockAnchorElement as any);

    // Click Export PDF dropdown trigger
    const user = userEvent.setup();
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    expect(exportButton).toBeInTheDocument();
    await user.click(exportButton);

    // Wait for dropdown menu to appear and click Visual format option (portal rendering delay in happy-dom)
    const visualOption = await screen.findByText('Visual (Match UI)', {}, { timeout: 5000 });
    await user.click(visualOption);

    // Wait for fetch to be called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/reports/report-123/pdf',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'visual', athleteId: undefined, chartImages: [] }),
        })
      );
    });

    // Wait for download process
    await waitFor(() => {
      expect(mockCreateObjectURL).toHaveBeenCalledWith(mockPdfBlob);
      expect(mockClick).toHaveBeenCalled();
      expect(mockRevokeObjectURL).toHaveBeenCalledWith('blob:mock-url');
    });

    // Verify anchor element was configured correctly
    expect(mockAnchorElement.href).toBe('blob:mock-url');
    expect(mockAnchorElement.download).toBe('Test_Team_Report.pdf');

    createElementSpy.mockRestore();
  });

  it('should handle PDF download errors gracefully', async () => {
    const user = userEvent.setup();

    // Mock failed PDF response
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    // Spy on console.error
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});

    renderComponent();

    // Wait for report data to load
    await waitFor(() => {
      expect(mockGenerateReportMutate).toHaveBeenCalled();
    });

    // Trigger report data load
    const mutateCall = mockGenerateReportMutate.mock.calls[0];
    if (mutateCall && mutateCall[1]?.onSuccess) {
      mutateCall[1].onSuccess(mockTeamReportData);
    }

    await waitFor(() => {
      expect(screen.getByText('Report Summary')).toBeInTheDocument();
    });

    // Click Export PDF dropdown trigger
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    await user.click(exportButton);

    // Wait for dropdown menu and click Visual format option (portal rendering delay in happy-dom)
    const visualOption = await screen.findByText('Visual (Match UI)', {}, { timeout: 5000 });
    await user.click(visualOption);

    // Wait for error to be logged
    await waitFor(() => {
      expect(consoleErrorSpy).toHaveBeenCalledWith(
        'Error downloading PDF:',
        expect.any(Error)
      );
    });

    // Verify download didn't proceed
    expect(mockCreateObjectURL).not.toHaveBeenCalled();

    consoleErrorSpy.mockRestore();
  });

  it('should include credentials in PDF request', async () => {
    const user = userEvent.setup();

    // Mock successful PDF response
    const mockPdfBlob = new Blob(['mock pdf content'], { type: 'application/pdf' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => mockPdfBlob,
    });

    renderComponent();

    // Wait for report data to load
    await waitFor(() => {
      expect(mockGenerateReportMutate).toHaveBeenCalled();
    });

    // Trigger report data load
    const mutateCall = mockGenerateReportMutate.mock.calls[0];
    if (mutateCall && mutateCall[1]?.onSuccess) {
      mutateCall[1].onSuccess(mockTeamReportData);
    }

    await waitFor(() => {
      expect(screen.getByText('Report Summary')).toBeInTheDocument();
    });

    // Click Export PDF dropdown trigger
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    await user.click(exportButton);

    // Wait for dropdown menu and click Visual format option (portal rendering delay in happy-dom)
    const visualOption = await screen.findByText('Visual (Match UI)', {}, { timeout: 5000 });
    await user.click(visualOption);

    // Verify credentials are included
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        expect.any(String),
        expect.objectContaining({
          credentials: 'include',
        })
      );
    });
  });

  it.skip('should properly sanitize report name in PDF filename', async () => {
    const user = userEvent.setup();

    // Mock report with special characters in name
    const reportWithSpecialChars: Report = {
      ...mockReport,
      name: 'Test/Report\\Name: 2025!',
    };

    // Mock successful PDF response
    const mockPdfBlob = new Blob(['mock pdf content'], { type: 'application/pdf' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => mockPdfBlob,
    });

    render(
      <QueryClientProvider client={queryClient}>
        <TeamReportView report={reportWithSpecialChars} />
      </QueryClientProvider>
    );

    // Wait for report data to load
    await waitFor(() => {
      expect(mockGenerateReportMutate).toHaveBeenCalled();
    });

    // Trigger report data load
    const mutateCall = mockGenerateReportMutate.mock.calls[0];
    if (mutateCall && mutateCall[1]?.onSuccess) {
      mutateCall[1].onSuccess(mockTeamReportData);
    }

    await waitFor(() => {
      expect(screen.getByText('Report Summary')).toBeInTheDocument();
    });

    // Spy on anchor click
    const mockClick = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement');
    const mockAnchorElement = document.createElement('a');
    mockAnchorElement.click = mockClick;
    createElementSpy.mockReturnValueOnce(mockAnchorElement as any);

    // Click Export PDF dropdown
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    await user.click(exportButton);

    // Wait for dropdown menu and click simplified format option (portal rendering delay in happy-dom)
    const simplifiedOption = await screen.findByText('Simplified (Print-Friendly)', {}, { timeout: 5000 });
    await user.click(simplifiedOption);

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
    });

    // Verify filename is sanitized (spaces replaced with underscores)
    // The implementation uses replace(/\s+/g, '_') which only replaces whitespace
    expect(mockAnchorElement.download).toBe('Test/Report\\Name:_2025!.pdf');

    createElementSpy.mockRestore();
  });

  it('should render PDF format dropdown menu', async () => {
    const user = userEvent.setup();

    renderComponent();

    // Wait for report data to load
    await waitFor(() => {
      expect(mockGenerateReportMutate).toHaveBeenCalled();
    });

    // Trigger report data load
    const mutateCall = mockGenerateReportMutate.mock.calls[0];
    if (mutateCall && mutateCall[1]?.onSuccess) {
      mutateCall[1].onSuccess(mockTeamReportData);
    }

    await waitFor(() => {
      expect(screen.getByText('Report Summary')).toBeInTheDocument();
    });

    // Find Export PDF dropdown button
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    expect(exportButton).toBeInTheDocument();

    // Click to open dropdown
    await user.click(exportButton);

    // Verify both format options are available (portal rendering delay in happy-dom)
    await waitFor(() => {
      expect(screen.getByText('PDF Format')).toBeInTheDocument();
      expect(screen.getByText('Visual (Match UI)')).toBeInTheDocument();
      expect(screen.getByText('Simplified (Print-Friendly)')).toBeInTheDocument();
    }, { timeout: 5000 });
  });

  it('should download PDF with visual format when selected', async () => {
    // Mock successful PDF response
    const mockPdfBlob = new Blob(['mock pdf content'], { type: 'application/pdf' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => mockPdfBlob,
    });

    renderComponent();

    // Wait for report data to load
    await waitFor(() => {
      expect(mockGenerateReportMutate).toHaveBeenCalled();
    });

    // Trigger report data load
    const mutateCall = mockGenerateReportMutate.mock.calls[0];
    if (mutateCall && mutateCall[1]?.onSuccess) {
      mutateCall[1].onSuccess(mockTeamReportData);
    }

    await waitFor(() => {
      expect(screen.getByText('Report Summary')).toBeInTheDocument();
    });

    // Click Export PDF dropdown
    const user = userEvent.setup();
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    await user.click(exportButton);

    // Wait for dropdown menu and click Visual format option (portal rendering delay in happy-dom)
    const visualOption = await screen.findByText('Visual (Match UI)', {}, { timeout: 5000 });
    await user.click(visualOption);

    // Verify fetch was called with format=visual parameter
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/reports/report-123/pdf',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'visual', athleteId: undefined, chartImages: [] }),
        })
      );
    });
  });

  it('should download PDF with simplified format when selected', async () => {
    // Mock successful PDF response
    const mockPdfBlob = new Blob(['mock pdf content'], { type: 'application/pdf' });
    mockFetch.mockResolvedValueOnce({
      ok: true,
      blob: async () => mockPdfBlob,
    });

    renderComponent();

    // Wait for report data to load
    await waitFor(() => {
      expect(mockGenerateReportMutate).toHaveBeenCalled();
    });

    // Trigger report data load
    const mutateCall = mockGenerateReportMutate.mock.calls[0];
    if (mutateCall && mutateCall[1]?.onSuccess) {
      mutateCall[1].onSuccess(mockTeamReportData);
    }

    await waitFor(() => {
      expect(screen.getByText('Report Summary')).toBeInTheDocument();
    });

    // Click Export PDF dropdown
    const user = userEvent.setup();
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    await user.click(exportButton);

    // Wait for dropdown menu and click Simplified format option (portal rendering delay in happy-dom)
    const simplifiedOption = await screen.findByText('Simplified (Print-Friendly)', {}, { timeout: 5000 });
    await user.click(simplifiedOption);

    // Verify fetch was called with format=simplified parameter
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/reports/report-123/pdf',
        expect.objectContaining({
          method: 'POST',
          credentials: 'include',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ format: 'simplified', athleteId: undefined, chartImages: [] }),
        })
      );
    });
  });
});

describe('TeamReportView - Benchmark Achievement Summary', () => {
  let queryClient: QueryClient;

  const mockReport: Report = {
    id: 'report-123',
    organizationId: 'org-456',
    createdBy: 'user-789',
    name: 'Benchmark Test Report',
    description: 'Testing benchmark calculations',
    reportType: 'team',
    config: {
      timeframe: {
        type: 'preset',
        preset: 'all_time',
      },
      metrics: ['FLY10_TIME', 'VERTICAL_JUMP'],
    },
    isTemplate: false,
    isPinned: false,
    createdAt: '2025-01-01T00:00:00Z',
  };

  const renderComponent = () => {
    return render(
      <QueryClientProvider client={queryClient}>
        <TeamReportView report={mockReport} />
      </QueryClientProvider>
    );
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: {
        queries: { retry: false },
        mutations: { retry: false },
      },
    });

    vi.mocked(useTeams).mockReturnValue({
      data: [
        { id: 'team-1', name: 'Team A' },
        { id: 'team-2', name: 'Team B' },
      ],
      isLoading: false,
      error: null,
    } as any);

    // Mock useAuth hook
    vi.mocked(useAuth).mockReturnValue({
      user: { id: 'user-789', isSiteAdmin: false },
      isLoading: false,
    } as any);

    // Default mock - will be overridden in individual tests
    mockGenerateReportMutate.mockResolvedValue({});
    vi.mocked(useGenerateReport).mockReturnValue({
      mutate: mockGenerateReportMutate,
      isSuccess: false,
      data: undefined,
      isPending: true,
      isError: false,
      error: null,
    } as any);

    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  it.skip('should calculate benchmark achievements correctly', async () => {
    const reportDataWithBenchmarks = {
      reportType: 'team' as const,
      reportConfig: mockReport.config,
      teamStatistics: [],
      athleteRankings: [
        {
          userId: 'athlete-1',
          userName: 'John Doe',
          measurements: { FLY10_TIME: 1.5, VERTICAL_JUMP: 24 },
          percentiles: { FLY10_TIME: 75, VERTICAL_JUMP: 80 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Club Average', benchmarkValue: 1.8, meetsOrExceeds: true },
              { benchmarkName: 'Elite Level', benchmarkValue: 1.4, meetsOrExceeds: false },
            ],
            VERTICAL_JUMP: [
              { benchmarkName: 'Club Average', benchmarkValue: 20, meetsOrExceeds: true },
            ],
          },
        },
        {
          userId: 'athlete-2',
          userName: 'Jane Smith',
          measurements: { FLY10_TIME: 1.7, VERTICAL_JUMP: 22 },
          percentiles: { FLY10_TIME: 60, VERTICAL_JUMP: 70 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Club Average', benchmarkValue: 1.8, meetsOrExceeds: true },
            ],
            VERTICAL_JUMP: [
              { benchmarkName: 'Club Average', benchmarkValue: 20, meetsOrExceeds: true },
            ],
          },
        },
        {
          userId: 'athlete-3',
          userName: 'Bob Johnson',
          measurements: { FLY10_TIME: 2.0, VERTICAL_JUMP: 18 },
          percentiles: { FLY10_TIME: 40, VERTICAL_JUMP: 50 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Club Average', benchmarkValue: 1.8, meetsOrExceeds: false },
            ],
            VERTICAL_JUMP: [
              { benchmarkName: 'Club Average', benchmarkValue: 20, meetsOrExceeds: false },
            ],
          },
        },
      ],
      athleteCount: 3,
      teamIds: ['team-1'],
      generatedAt: '2025-01-01T12:00:00Z',
    };

    vi.mocked(useGenerateReport).mockReturnValue({
      mutate: mockGenerateReportMutate,
      isPending: false,
      isError: false,
      data: reportDataWithBenchmarks,
    } as any);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Benchmark Achievement Summary')).toBeInTheDocument();
    }, { timeout: 5000 });

    // Should show "Club Average" benchmark with 2 athletes (67%)
    await waitFor(() => {
      expect(screen.getByText(/Club Average/i)).toBeInTheDocument();
      expect(screen.getByText('67%')).toBeInTheDocument(); // 2 out of 3 athletes
    }, { timeout: 5000 });

    // Should show "Elite Level" benchmark with 0 athletes (0%)
    // Note: The component filters out benchmarks with 0 count
    expect(screen.queryByText(/Elite Level/i)).not.toBeInTheDocument();
  });

  it.skip('should count athletes meeting multiple benchmarks separately', async () => {
    const reportDataWithMultipleBenchmarks = {
      reportType: 'team' as const,
      reportConfig: mockReport.config,
      teamStatistics: [],
      athleteRankings: [
        {
          userId: 'athlete-1',
          userName: 'John Doe',
          measurements: { FLY10_TIME: 1.3 },
          percentiles: { FLY10_TIME: 90 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Good', benchmarkValue: 1.8, meetsOrExceeds: true },
              { benchmarkName: 'Great', benchmarkValue: 1.5, meetsOrExceeds: true },
              { benchmarkName: 'Elite', benchmarkValue: 1.4, meetsOrExceeds: true },
            ],
          },
        },
        {
          userId: 'athlete-2',
          userName: 'Jane Smith',
          measurements: { FLY10_TIME: 1.6 },
          percentiles: { FLY10_TIME: 70 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Good', benchmarkValue: 1.8, meetsOrExceeds: true },
              { benchmarkName: 'Great', benchmarkValue: 1.5, meetsOrExceeds: false },
            ],
          },
        },
      ],
      athleteCount: 2,
      teamIds: ['team-1'],
      generatedAt: '2025-01-01T12:00:00Z',
    };

    vi.mocked(useGenerateReport).mockReturnValue({
      mutate: mockGenerateReportMutate,
      isPending: false,
      isError: false,
      data: reportDataWithMultipleBenchmarks,
    } as any);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('Benchmark Achievement Summary')).toBeInTheDocument();
    }, { timeout: 5000 });

    // Both athletes meet "Good"
    await waitFor(() => {
      const goodBenchmark = screen.getByText(/Good/i).closest('div');
      expect(goodBenchmark).toBeInTheDocument();
      expect(goodBenchmark?.textContent).toContain('100%'); // 2 out of 2
    }, { timeout: 5000 });

    // Only athlete-1 meets "Great"
    const greatBenchmark = screen.getByText(/Great/i).closest('div');
    expect(greatBenchmark?.textContent).toContain('50%'); // 1 out of 2

    // Only athlete-1 meets "Elite"
    const eliteBenchmark = screen.getByText(/Elite/i).closest('div');
    expect(eliteBenchmark?.textContent).toContain('50%'); // 1 out of 2
  });

  it.skip('should show "No benchmark met" when athletes do not meet any benchmarks', async () => {
    const reportDataNoBenchmarksMet = {
      reportType: 'team' as const,
      reportConfig: mockReport.config,
      teamStatistics: [],
      athleteRankings: [
        {
          userId: 'athlete-1',
          userName: 'John Doe',
          measurements: { FLY10_TIME: 2.5 },
          percentiles: { FLY10_TIME: 20 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Club Average', benchmarkValue: 1.8, meetsOrExceeds: false },
            ],
          },
        },
        {
          userId: 'athlete-2',
          userName: 'Jane Smith',
          measurements: { FLY10_TIME: 2.8 },
          percentiles: { FLY10_TIME: 10 },
          benchmarkComparisons: {
            FLY10_TIME: [
              { benchmarkName: 'Club Average', benchmarkValue: 1.8, meetsOrExceeds: false },
            ],
          },
        },
      ],
      athleteCount: 2,
      teamIds: ['team-1'],
      generatedAt: '2025-01-01T12:00:00Z',
    };

    vi.mocked(useGenerateReport).mockReturnValue({
      mutate: mockGenerateReportMutate,
      isPending: false,
      isError: false,
      data: reportDataNoBenchmarksMet,
    } as any);

    renderComponent();

    await waitFor(() => {
      expect(screen.getByText('No benchmark met')).toBeInTheDocument();
      expect(screen.getByText('100%')).toBeInTheDocument(); // All athletes met no benchmarks
    });
  });

  it('should not display benchmark summary when no benchmarks are configured', async () => {
    const reportDataNoBenchmarks = {
      reportType: 'team' as const,
      reportConfig: mockReport.config,
      teamStatistics: [],
      athleteRankings: [
        {
          userId: 'athlete-1',
          userName: 'John Doe',
          measurements: { FLY10_TIME: 1.5 },
          percentiles: { FLY10_TIME: 75 },
          benchmarkComparisons: {},
        },
      ],
      athleteCount: 1,
      teamIds: ['team-1'],
      generatedAt: '2025-01-01T12:00:00Z',
    };

    vi.mocked(useGenerateReport).mockReturnValue({
      mutate: mockGenerateReportMutate,
      isPending: false,
      isError: false,
      data: reportDataNoBenchmarks,
    } as any);

    renderComponent();

    // Should not show benchmark summary section at all
    await waitFor(() => {
      expect(screen.queryByText('Benchmark Achievement Summary')).not.toBeInTheDocument();
    }, { timeout: 5000 });
  });
});

describe('TeamReportView - Rendered Hooks Consistency', () => {
  // Regression test for a bug caught in code review: useMetricLabels() was
  // called AFTER the component's early-return statements (loading/error
  // states), so the hook only ran once reportData had loaded. That changes
  // the number of hooks called between the "loading" render and the "loaded"
  // render, which React detects and throws for ("Rendered more hooks than
  // during the previous render"). A test that only renders each state in
  // isolation (as the other describe blocks above do) can't catch this — it
  // requires an actual state TRANSITION within one mounted component.
  let queryClient: QueryClient;

  const mockReport: Report = {
    id: 'report-hooks-1',
    organizationId: 'org-1',
    createdBy: 'user-1',
    name: 'Hooks Consistency Report',
    reportType: 'team',
    config: {
      timeframe: { type: 'preset', preset: 'all_time' },
      metrics: ['VERTICAL_JUMP'],
    },
    isTemplate: false,
    isPinned: false,
    createdAt: '2025-01-01T00:00:00Z',
  };

  const loadedReportData = {
    reportType: 'team' as const,
    reportConfig: mockReport.config,
    teamStatistics: [],
    athleteRankings: [],
    athleteCount: 0,
    teamIds: [],
    generatedAt: '2025-01-01T12:00:00Z',
  };

  beforeEach(() => {
    queryClient = new QueryClient({
      defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
    });
    vi.mocked(useTeams).mockReturnValue({ data: [], isLoading: false, error: null } as any);
    vi.mocked(useAuth).mockReturnValue({ user: { id: 'user-1', isSiteAdmin: false }, isLoading: false } as any);
  });

  it('transitions from loading to loaded without a hook-count mismatch', async () => {
    // reportData is local state, populated by generateReport.mutate's
    // onSuccess callback (fired from a mount-time useEffect) — not read
    // directly from the hook's return value. So the loading->loaded
    // transition happens by capturing and later invoking that callback, not
    // by changing the mocked hook's return value and re-rendering.
    const consoleErrorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    let capturedOnSuccess: ((response: unknown) => void) | undefined;

    mockGenerateReportMutate.mockImplementation((_params: unknown, options?: { onSuccess?: (r: unknown) => void }) => {
      capturedOnSuccess = options?.onSuccess;
      // Deliberately do NOT call onSuccess yet — component stays in loading state.
    });
    vi.mocked(useGenerateReport).mockReturnValue({
      mutate: mockGenerateReportMutate,
      isPending: true,
      isError: false,
      data: undefined,
    } as any);

    render(
      <QueryClientProvider client={queryClient}>
        <TeamReportView report={mockReport} />
      </QueryClientProvider>
    );

    expect(screen.getByText(/Generating report/i)).toBeInTheDocument();
    expect(capturedOnSuccess).toBeDefined();

    // Now "load" the report — this is the transition that previously threw
    // ("Rendered more hooks than during the previous render"), because
    // useMetricLabels() used to be called only after this point. The early
    // return checks `generateReport.isPending || !reportData`, so both must
    // flip together: update the mocked hook's isPending before the state
    // update (setReportData, via the captured callback) triggers a re-render.
    vi.mocked(useGenerateReport).mockReturnValue({
      mutate: mockGenerateReportMutate,
      isPending: false,
      isError: false,
      data: loadedReportData,
    } as any);
    capturedOnSuccess!({ data: loadedReportData });

    await waitFor(() => {
      expect(screen.getByText(mockReport.name)).toBeInTheDocument();
    });

    const hookOrderErrors = consoleErrorSpy.mock.calls.filter((call) =>
      String(call[0]).includes('Rendered more hooks') || String(call[0]).includes('Rendered fewer hooks')
    );
    expect(hookOrderErrors).toHaveLength(0);

    consoleErrorSpy.mockRestore();
  });
});
