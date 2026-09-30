import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ReportWizard } from '../ReportWizard';

// Mock hooks
const mockOrganizationContext = 'org-123';
const mockUseAuth = vi.fn();
vi.mock('@/lib/auth', () => ({
  useAuth: () => mockUseAuth(),
}));

const mockCreateReportMutate = vi.fn();
const mockUseCreateReport = vi.fn();
vi.mock('@/hooks/use-reports', () => ({
  useCreateReport: () => mockUseCreateReport(),
}));

// Mock apiRequest and STALE_TIME
const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
  STALE_TIME: {
    REALTIME: 1 * 60 * 1000,
    DEFAULT: 5 * 60 * 1000,
    STATIC: 15 * 60 * 1000,
    INFINITE: Infinity,
  },
}));

// Mock useOrganizationMetrics
const mockUseOrganizationMetrics = vi.fn();
vi.mock('@/lib/metrics-api', () => ({
  useOrganizationMetrics: (...args: any[]) => mockUseOrganizationMetrics(...args),
}));

// Mock useOrganizationBenchmarks
const mockUseOrganizationBenchmarks = vi.fn();
vi.mock('@/lib/benchmarks-api', () => ({
  useOrganizationBenchmarks: (...args: any[]) => mockUseOrganizationBenchmarks(...args),
}));

describe('ReportWizard Component', () => {
  let queryClient: QueryClient;
  const mockOnClose = vi.fn();
  const mockOnSuccess = vi.fn();

  const renderWithQueryClient = (component: React.ReactElement) => {
    return render(
      <QueryClientProvider client={queryClient}>
        {component}
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

    // Setup default mocks
    mockUseAuth.mockReturnValue({
      organizationContext: mockOrganizationContext,
      user: { id: 'user-1', role: 'org_admin' },
    });

    mockUseCreateReport.mockReturnValue({
      mutateAsync: mockCreateReportMutate,
      isPending: false,
    });

    // Mock API responses
    mockApiRequest.mockImplementation((method: string, url: string) => {
      if (url.includes('/metrics')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            {
              metricCode: 'FLY10_TIME',
              siteMetric: { name: '10-Yard Fly', unit: 'seconds', category: 'Speed' },
            },
            {
              metricCode: 'VERTICAL_JUMP',
              siteMetric: { name: 'Vertical Jump', unit: 'inches', category: 'Power' },
            },
          ],
        });
      }
      if (url.includes('/teams')) {
        return Promise.resolve({
          ok: true,
          json: async () => [
            { id: 'team-1', name: 'Team A' },
            { id: 'team-2', name: 'Team B' },
          ],
        });
      }
      if (url.includes('/benchmarks')) {
        return Promise.resolve({
          ok: true,
          json: async () => [],
        });
      }
      return Promise.resolve({ ok: true, json: async () => [] });
    });

    mockCreateReportMutate.mockResolvedValue({
      id: 'report-new',
      name: 'Test Report',
      organizationId: mockOrganizationContext,
    });

    // Mock useOrganizationMetrics hook
    mockUseOrganizationMetrics.mockReturnValue({
      data: [
        {
          metricCode: 'FLY10_TIME',
          siteMetric: { name: '10-Yard Fly', unit: 'seconds', category: 'Speed' },
        },
        {
          metricCode: 'VERTICAL_JUMP',
          siteMetric: { name: 'Vertical Jump', unit: 'inches', category: 'Power' },
        },
      ],
      isLoading: false,
      error: null,
    });

    // Mock useOrganizationBenchmarks hook
    mockUseOrganizationBenchmarks.mockReturnValue({
      data: [],
      isLoading: false,
      error: null,
    });

    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('OrganizationId Handling', () => {
    it('should pass organizationId from organizationContext to mutation', async () => {
      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      // Select team report type
      const teamRadio = screen.getByLabelText(/Team Report/i, { exact: false });
      fireEvent.click(teamRadio);

      // Navigate through wizard steps
      const nextButton = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextButton);

      // Fill in report name
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Report Name/i);
        fireEvent.change(nameInput, { target: { value: 'Test Report' } });
      });

      fireEvent.click(nextButton);

      // Select timeframe
      fireEvent.click(nextButton);

      // Select at least one metric
      await waitFor(() => {
        const checkbox = screen.getAllByRole('checkbox')[0];
        fireEvent.click(checkbox);
      });

      fireEvent.click(nextButton);

      // Skip benchmarks
      fireEvent.click(nextButton);

      // Skip filters
      fireEvent.click(nextButton);

      // Submit form
      const createButton = screen.getByRole('button', { name: /Create Report/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockCreateReportMutate).toHaveBeenCalled();
      });

      const callArgs = mockCreateReportMutate.mock.calls[0][0];
      expect(callArgs).toHaveProperty('organizationId', mockOrganizationContext);
    });

    it('should not submit when organizationContext is null', async () => {
      mockUseAuth.mockReturnValue({
        organizationContext: null,
        user: { id: 'user-1', role: 'org_admin' },
      });

      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      // Try to submit form
      const teamRadio = screen.getByLabelText(/Team Report/i, { exact: false });
      fireEvent.click(teamRadio);

      // Navigate to end
      const nextButton = screen.getByRole('button', { name: /Next/i });
      fireEvent.click(nextButton);

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Report Name/i);
        fireEvent.change(nameInput, { target: { value: 'Test Report' } });
      });

      // Continue through steps
      for (let i = 0; i < 5; i++) {
        const next = screen.getByRole('button', { name: /Next/i });
        fireEvent.click(next);
      }

      // Try to create - should not call mutation
      const createButton = screen.getByRole('button', { name: /Create Report/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockCreateReportMutate).not.toHaveBeenCalled();
      });
    });

    it('should include organizationId in payload with all config options', async () => {
      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      // Select team report
      const teamRadio = screen.getByLabelText(/Team Report/i, { exact: false });
      fireEvent.click(teamRadio);
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Fill details
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Report Name/i);
        fireEvent.change(nameInput, { target: { value: 'Full Config Report' } });
        const descInput = screen.getByLabelText(/Description/i);
        fireEvent.change(descInput, { target: { value: 'Test description' } });
      });
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Timeframe
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Select metrics
      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
      });
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Skip benchmarks and filters
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Submit
      const createButton = screen.getByRole('button', { name: /Create Report/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockCreateReportMutate).toHaveBeenCalled();
      });

      const payload = mockCreateReportMutate.mock.calls[0][0];
      expect(payload).toMatchObject({
        name: 'Full Config Report',
        description: 'Test description',
        reportType: 'team',
        organizationId: mockOrganizationContext,
        config: expect.objectContaining({
          timeframe: expect.any(Object),
          metrics: expect.any(Array),
        }),
      });
    });

    it('should call onSuccess with report id after successful creation', async () => {
      const createdReportId = 'report-abc-123';
      mockCreateReportMutate.mockResolvedValueOnce({
        id: createdReportId,
        organizationId: mockOrganizationContext,
      });

      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      // Quick navigation through wizard
      const teamRadio = screen.getByLabelText(/Team Report/i, { exact: false });
      fireEvent.click(teamRadio);
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Report Name/i);
        fireEvent.change(nameInput, { target: { value: 'Test' } });
      });

      // Navigate through timeframe step
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Select at least one metric
      await waitFor(() => {
        const checkbox = screen.getAllByRole('checkbox')[0];
        fireEvent.click(checkbox);
      });

      // Navigate to end (benchmarks, filters, composite)
      for (let i = 0; i < 3; i++) {
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      }

      const createButton = screen.getByRole('button', { name: /Create Report/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockOnSuccess).toHaveBeenCalledWith(createdReportId);
      });
    });
  });

  describe('Data Loading with organizationContext', () => {
    it('should fetch metrics with organizationContext', async () => {
      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(mockUseOrganizationMetrics).toHaveBeenCalledWith(mockOrganizationContext, true);
      });
    });

    it('should fetch teams with organizationContext', async () => {
      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(mockApiRequest).toHaveBeenCalledWith(
          'GET',
          `/api/teams?organizationId=${mockOrganizationContext}`
        );
      });
    });

    it('should fetch custom benchmarks with organizationContext', async () => {
      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(mockUseOrganizationBenchmarks).toHaveBeenCalledWith(mockOrganizationContext, false);
      });
    });

    it('should not fetch organization-scoped data when organizationContext is null', async () => {
      mockUseAuth.mockReturnValue({
        organizationContext: null,
        user: { id: 'user-1', role: 'site_admin' },
      });

      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      // Should not fetch organization-scoped endpoints
      const orgScopedCalls = mockApiRequest.mock.calls.filter((call) =>
        call[1].includes('/organizations/')
      );

      expect(orgScopedCalls.length).toBe(0);
    });
  });

  describe('Error Handling', () => {
    it('should display error message when metrics fail to load', async () => {
      mockApiRequest.mockImplementation((method: string, url: string) => {
        if (url.includes('/metrics')) {
          return Promise.reject(new Error('Failed to load metrics'));
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      // Mock the hook to return an error
      mockUseOrganizationMetrics.mockReturnValue({
        data: undefined,
        isLoading: false,
        error: new Error('Failed to load metrics'),
      });

      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      // Navigate to metrics step
      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      const teamRadio = screen.getByLabelText(/Team Report/i, { exact: false });
      fireEvent.click(teamRadio);
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Report Name/i);
        fireEvent.change(nameInput, { target: { value: 'Test' } });
      });

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Should show error message
      await waitFor(() => {
        const errorMessages = screen.queryAllByText(/Failed to load metrics/i);
        expect(errorMessages.length).toBeGreaterThan(0);
      }, { timeout: 3000 });
    });

    it('should show empty state when no metrics are enabled', async () => {
      mockApiRequest.mockImplementation((method: string, url: string) => {
        if (url.includes('/metrics')) {
          return Promise.resolve({ ok: true, json: async () => [] });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      // Mock the hook to return empty metrics
      mockUseOrganizationMetrics.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      // Navigate to metrics step
      const teamRadio = screen.getByLabelText(/Team Report/i, { exact: false });
      fireEvent.click(teamRadio);
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Report Name/i);
        fireEvent.change(nameInput, { target: { value: 'Test' } });
      });

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Should show empty state
      await waitFor(() => {
        expect(
          screen.getByText(/No metrics enabled for this organization/i)
        ).toBeInTheDocument();
      });
    });
  });

  describe('Force-Velocity chart option', () => {
    const navigateToChartsStep = async () => {
      await waitFor(() => {
        expect(screen.getByText('Individual Report')).toBeInTheDocument();
      });
      fireEvent.click(screen.getByLabelText(/Individual Report/i, { exact: false }));
      // Step 1 (type) → 2 (athletes) → 3 (name) → ... → 8 (charts). Name is
      // validated on step 3; athlete selection is only enforced on submit.
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Report Name/i);
        fireEvent.change(nameInput, { target: { value: 'FV Test' } });
      });
      for (let i = 0; i < 5; i++) {
        fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      }
    };

    it('shows the Force-Velocity option when site and org flags are enabled', async () => {
      mockApiRequest.mockImplementation((method: string, url: string) => {
        if (url.includes('/site-settings/public')) {
          return Promise.resolve({ ok: true, json: async () => ({ sprintFvEnabled: true }) });
        }
        if (url.includes(`/organizations/${mockOrganizationContext}`)) {
          return Promise.resolve({ ok: true, json: async () => ({ id: mockOrganizationContext, sprintFvEnabled: true }) });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );
      await navigateToChartsStep();

      await waitFor(() => {
        expect(screen.getByText('Force-Velocity profile')).toBeInTheDocument();
      });
    });

    it('hides the Force-Velocity option when the feature flags are off', async () => {
      // Default mockApiRequest returns [] for the flag endpoints → flags falsy
      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );
      await navigateToChartsStep();

      await waitFor(() => {
        // Another chart option confirms we reached the charts step
        expect(screen.getByText('All-around profile (radar)')).toBeInTheDocument();
      });
      expect(screen.queryByText('Force-Velocity profile')).not.toBeInTheDocument();
    });
  });

  describe('Custom Benchmarks', () => {
    const mockCustomBenchmarks = [
      {
        id: 'org-bench-1',
        benchmarkId: 'custom-bench-1',
        benchmarkType: 'custom',
        name: 'Club Average - Boys',
        metricCode: 'FLY10_TIME',
        benchmarkValue: 1.8,
        isEnabled: true,
      },
      {
        id: 'org-bench-2',
        benchmarkId: 'custom-bench-2',
        benchmarkType: 'custom',
        name: 'Elite Level - Girls',
        metricCode: 'VERTICAL_JUMP',
        benchmarkValue: 22.5,
        isEnabled: true,
      },
    ];

    const mockSiteBenchmarks = [
      {
        id: 'org-bench-3',
        benchmarkId: 'site-bench-1',
        benchmarkType: 'site',
        name: 'D1 College Standard',
        metricCode: 'FLY10_TIME',
        benchmarkValue: 1.6,
        isEnabled: true,
      },
    ];

    beforeEach(() => {
      mockApiRequest.mockImplementation((method: string, url: string) => {
        if (url.includes('/metrics')) {
          return Promise.resolve({
            ok: true,
            json: async () => [
              {
                metricCode: 'FLY10_TIME',
                siteMetric: { name: '10-Yard Fly', unit: 'seconds', category: 'Speed' },
              },
              {
                metricCode: 'VERTICAL_JUMP',
                siteMetric: { name: 'Vertical Jump', unit: 'inches', category: 'Power' },
              },
            ],
          });
        }
        if (url.includes('/teams')) {
          return Promise.resolve({
            ok: true,
            json: async () => [{ id: 'team-1', name: 'Team A' }],
          });
        }
        if (url.includes('/benchmarks')) {
          return Promise.resolve({
            ok: true,
            json: async () => [...mockSiteBenchmarks, ...mockCustomBenchmarks],
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      // Update the useOrganizationBenchmarks mock for these tests
      mockUseOrganizationBenchmarks.mockReturnValue({
        data: [...mockSiteBenchmarks, ...mockCustomBenchmarks],
        isLoading: false,
        error: null,
      });
    });

    it('should load and display custom benchmarks', async () => {
      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      // Navigate to benchmarks step
      const teamRadio = screen.getByLabelText(/Team Report/i, { exact: false });
      fireEvent.click(teamRadio);
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Report Name/i);
        fireEvent.change(nameInput, { target: { value: 'Test Report' } });
      });

      // Navigate through timeframe and metrics
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
      });

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Should show custom benchmarks
      await waitFor(() => {
        expect(screen.getByText('Custom Benchmarks')).toBeInTheDocument();
        expect(screen.getByText('Club Average - Boys')).toBeInTheDocument();
        expect(screen.getByText('Elite Level - Girls')).toBeInTheDocument();
      });
    });

    it('should allow selecting custom benchmarks', async () => {
      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      // Navigate to benchmarks step
      const teamRadio = screen.getByLabelText(/Team Report/i, { exact: false });
      fireEvent.click(teamRadio);
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Report Name/i);
        fireEvent.change(nameInput, { target: { value: 'Test Report' } });
      });

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
      });

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Select custom benchmarks
      await waitFor(() => {
        const customBenchCheckbox = screen.getByLabelText(/Club Average - Boys/i);
        fireEvent.click(customBenchCheckbox);
      });

      // Continue to submission
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      const createButton = screen.getByRole('button', { name: /Create Report/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockCreateReportMutate).toHaveBeenCalled();
      });

      const callArgs = mockCreateReportMutate.mock.calls[0][0];
      expect(callArgs.config.benchmarks).toBeDefined();
      expect(callArgs.config.benchmarks.custom).toContain('custom-bench-1');
    });

    it('should store correct benchmark IDs (not organization_benchmarks IDs)', async () => {
      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      const teamRadio = screen.getByLabelText(/Team Report/i, { exact: false });
      fireEvent.click(teamRadio);
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Report Name/i);
        fireEvent.change(nameInput, { target: { value: 'Test Report' } });
      });

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        const checkboxes = screen.getAllByRole('checkbox');
        fireEvent.click(checkboxes[0]);
      });

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Select both custom and site benchmarks
      await waitFor(() => {
        const custom1 = screen.getByLabelText(/Club Average - Boys/i);
        const custom2 = screen.getByLabelText(/Elite Level - Girls/i);
        const site1 = screen.getByLabelText(/D1 College Standard/i);

        fireEvent.click(custom1);
        fireEvent.click(custom2);
        fireEvent.click(site1);
      });

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      const createButton = screen.getByRole('button', { name: /Create Report/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockCreateReportMutate).toHaveBeenCalled();
      });

      const callArgs = mockCreateReportMutate.mock.calls[0][0];

      // Should use benchmarkId, not the organization_benchmarks id
      expect(callArgs.config.benchmarks.custom).toEqual([
        'custom-bench-1',
        'custom-bench-2',
      ]);
      expect(callArgs.config.benchmarks.site).toEqual(['site-bench-1']);

      // Should NOT contain organization_benchmarks IDs
      expect(callArgs.config.benchmarks.custom).not.toContain('org-bench-1');
      expect(callArgs.config.benchmarks.custom).not.toContain('org-bench-2');
    });

    it('should handle empty custom benchmarks', async () => {
      mockApiRequest.mockImplementation((method: string, url: string) => {
        if (url.includes('/benchmarks')) {
          return Promise.resolve({
            ok: true,
            json: async () => [],
          });
        }
        return Promise.resolve({ ok: true, json: async () => [] });
      });

      // Override the mock to return empty benchmarks
      mockUseOrganizationBenchmarks.mockReturnValue({
        data: [],
        isLoading: false,
        error: null,
      });

      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      const teamRadio = screen.getByLabelText(/Team Report/i, { exact: false });
      fireEvent.click(teamRadio);
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        const nameInput = screen.getByLabelText(/Report Name/i);
        fireEvent.change(nameInput, { target: { value: 'Test Report' } });
      });

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Should show "no benchmarks" message
      await waitFor(() => {
        expect(screen.getByText(/No enabled benchmarks available/i)).toBeInTheDocument();
      });
    });
  });
});
