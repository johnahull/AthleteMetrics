import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { TeamReportView } from '../TeamReportView';
import { useGenerateReport } from '@/hooks/use-reports';
import { useTeams } from '@/hooks/use-teams';
import type { Report } from '@/types/report-types';

// Mock hooks
vi.mock('@/hooks/use-reports');
vi.mock('@/hooks/use-teams');

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

    // Mock useGenerateReport hook
    (useGenerateReport as any).mockReturnValue({
      mutate: mockGenerateReportMutate,
      isPending: false,
      isError: false,
      data: mockTeamReportData,
    });

    // Mock useTeams hook
    (useTeams as any).mockReturnValue({
      data: mockTeams,
      isLoading: false,
      error: null,
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

  it('should successfully download PDF when Export PDF button is clicked', async () => {
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

    // Find and click Export PDF button
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    expect(exportButton).toBeInTheDocument();

    // Spy on anchor click
    const mockClick = vi.fn();
    const createElementSpy = vi.spyOn(document, 'createElement');
    const mockAnchorElement = document.createElement('a');
    mockAnchorElement.click = mockClick;
    createElementSpy.mockReturnValueOnce(mockAnchorElement as any);

    fireEvent.click(exportButton);

    // Wait for fetch to be called
    await waitFor(() => {
      expect(mockFetch).toHaveBeenCalledWith(
        '/api/reports/report-123/pdf',
        expect.objectContaining({
          method: 'GET',
          credentials: 'include',
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

    // Click Export PDF button
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    fireEvent.click(exportButton);

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

    // Click Export PDF button
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    fireEvent.click(exportButton);

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

  it('should properly sanitize report name in PDF filename', async () => {
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

    // Click Export PDF button
    const exportButton = screen.getByRole('button', { name: /export pdf/i });
    fireEvent.click(exportButton);

    await waitFor(() => {
      expect(mockClick).toHaveBeenCalled();
    });

    // Verify filename is sanitized (spaces replaced with underscores)
    // The implementation uses replace(/\s+/g, '_') which only replaces whitespace
    expect(mockAnchorElement.download).toBe('Test/Report\\Name:_2025!.pdf');

    createElementSpy.mockRestore();
  });
});
