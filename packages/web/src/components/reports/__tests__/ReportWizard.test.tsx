import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
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

// Benchmark sets and report templates: state the tests below set per case
const wiz = vi.hoisted(() => ({
  sets: [] as any[],
  setsLoading: false,
  setDetails: {} as Record<string, () => Promise<any>>,
  templates: [] as any[],
  createTemplate: vi.fn(),
  updateTemplate: vi.fn(),
}));
vi.mock('@/lib/benchmark-sets-api', async (importOriginal) => ({
  ...(await importOriginal<any>()),
  useBenchmarkSets: () => ({ data: wiz.setsLoading ? undefined : wiz.sets, isLoading: wiz.setsLoading, error: null }),
  fetchBenchmarkSet: (_org: string, id: string) => wiz.setDetails[id](),
}));
vi.mock('@/lib/report-templates-api', () => ({
  useReportTemplates: () => ({ data: wiz.templates }),
  useCreateReportTemplate: () => ({ mutateAsync: wiz.createTemplate, isPending: false }),
  useUpdateReportTemplate: () => ({ mutateAsync: wiz.updateTemplate, isPending: false }),
  useDeleteReportTemplate: () => ({ mutate: vi.fn(), isPending: false }),
}));
// The real combobox is covered by its own test; here one button adds each set
vi.mock('@/components/benchmark-sets/BenchmarkSetCombobox', () => ({
  BenchmarkSetCombobox: ({ onChange }: { onChange: (id: string) => void }) => (
    <div>
      {wiz.sets.map((set) => (
        <button key={set.id} type="button" onClick={() => onChange(set.id)}>{`add ${set.name}`}</button>
      ))}
    </div>
  ),
}));

// Selector stub: one button picks an athlete so an individual report can be submitted
vi.mock('@/components/ui/team-athlete-selector', () => ({
  TeamAthleteSelector: ({ onSelectionChange }: { onSelectionChange: (ids: string[]) => void }) => (
    <button type="button" onClick={() => onSelectionChange(['ath-1'])}>pick-athlete</button>
  ),
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
        // Site and custom benchmarks share one searchable list
        expect(screen.getByRole('searchbox', { name: /search benchmarks/i })).toBeInTheDocument();
        expect(screen.getByText('D1 College Standard')).toBeInTheDocument();
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

    it('splits the merged selection back into site and custom benchmarks by type', async () => {
      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Team Report')).toBeInTheDocument();
      });

      fireEvent.click(screen.getByLabelText(/Team Report/i, { exact: false }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        fireEvent.change(screen.getByLabelText(/Report Name/i), { target: { value: 'Test Report' } });
      });

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      await waitFor(() => {
        fireEvent.click(screen.getAllByRole('checkbox')[0]);
      });

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));

      // Interleave: custom, site, custom
      await waitFor(() => {
        expect(screen.getByLabelText(/Club Average - Boys/i)).toBeInTheDocument();
      });
      fireEvent.click(screen.getByLabelText(/Club Average - Boys/i));
      fireEvent.click(screen.getByLabelText(/D1 College Standard/i));
      fireEvent.click(screen.getByLabelText(/Elite Level - Girls/i));

      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Next/i }));
      fireEvent.click(screen.getByRole('button', { name: /Create Report/i }));

      await waitFor(() => {
        expect(mockCreateReportMutate).toHaveBeenCalled();
      });

      const { benchmarks } = mockCreateReportMutate.mock.calls[0][0].config;
      expect(benchmarks.site).toEqual(['site-bench-1']);
      expect(benchmarks.custom).toEqual(['custom-bench-1', 'custom-bench-2']);
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
  describe('Group comparison switch', () => {
    const next = () => fireEvent.click(screen.getByRole('button', { name: /Next/i }));

    // Walks to step 7 (filters). Individual: type -> athletes -> name -> timeframe -> metrics -> benchmarks -> filters.
    const goToFilters = async (type: 'individual' | 'team') => {
      await waitFor(() => expect(screen.getByText('Individual Report')).toBeInTheDocument());
      fireEvent.click(screen.getByLabelText(new RegExp(`${type} Report`, 'i'), { exact: false }));
      next();
      if (type === 'individual') {
        fireEvent.click(screen.getByText('pick-athlete'));
        next();
      }
      await waitFor(() => fireEvent.change(screen.getByLabelText(/Report Name/i), { target: { value: 'GC Test' } }));
      next();
      next();
      await waitFor(() => fireEvent.click(screen.getAllByRole('checkbox')[0]));
      next();
      next();
    };

    const submit = async () => {
      next();
      fireEvent.click(screen.getByRole('button', { name: /Create Report/i }));
      await waitFor(() => expect(mockCreateReportMutate).toHaveBeenCalled());
      return mockCreateReportMutate.mock.calls[0][0];
    };

    it('individual report defaults to no comparison: explicit false, no filters, hidden filter inputs', async () => {
      renderWithQueryClient(<ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      await goToFilters('individual');

      expect(screen.getByRole('switch', { name: /Compare to a group/i })).not.toBeChecked();
      expect(screen.queryByLabelText('Gender')).not.toBeInTheDocument();

      const payload = await submit();
      expect(payload.config.groupComparison).toBe(false);
      expect(payload.config).not.toHaveProperty('filters');
      expect(payload.config.charts.radar).toBe(false);
      expect(payload.config.charts.distribution).toBe(false);
    });

    it('individual report with the switch on sends groupComparison: true and shows filters', async () => {
      renderWithQueryClient(<ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      await goToFilters('individual');

      fireEvent.click(screen.getByRole('switch', { name: /Compare to a group/i }));
      await waitFor(() => expect(screen.getByText('Gender')).toBeInTheDocument());

      const payload = await submit();
      expect(payload.config.groupComparison).toBe(true);
    });

    it('team report has no switch, keeps filters and sends no groupComparison', async () => {
      renderWithQueryClient(<ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />);
      await goToFilters('team');

      expect(screen.queryByRole('switch', { name: /Compare to a group/i })).not.toBeInTheDocument();
      await waitFor(() => expect(screen.getByLabelText('Team A')).toBeInTheDocument());
      fireEvent.click(screen.getByLabelText('Team A'));

      const payload = await submit();
      expect(payload.config.filters).toMatchObject({ teamIds: ['team-1'] });
      expect(payload.config).not.toHaveProperty('groupComparison');
    });
  });
  describe('Templates and multiple benchmark sets', () => {
    const bench = (benchmarkId: string, benchmarkType: string, name: string, tierGroupId: string | null = null) => ({
      id: `org-${benchmarkId}`, benchmarkId, benchmarkType, name, metricCode: 'FLY10_TIME', tierGroupId, isEnabled: true,
    });
    const setWith = (id: string, name: string, items: Array<[string, string]>) => ({
      id, name, items: items.map(([benchmarkId, benchmarkType]) => ({ id: `${id}-${benchmarkId}`, benchmarkId, benchmarkType })),
    });
    const next = () => fireEvent.click(screen.getByRole('button', { name: /Next/i }));
    const loaded = (value: any) => () => Promise.resolve(value);

    beforeEach(() => {
      Element.prototype.scrollIntoView ??= () => {};
      Element.prototype.hasPointerCapture ??= () => false;
      Element.prototype.releasePointerCapture ??= () => {};
      mockUseOrganizationBenchmarks.mockReturnValue({
        data: [
          bench('site-bench-1', 'site', 'D1 College Standard', 'g1'),
          bench('custom-bench-1', 'custom', 'Club Average - Boys', 'g2'),
          bench('custom-bench-2', 'custom', 'Elite Level - Girls'),
        ],
        isLoading: false,
        error: null,
      });
      wiz.sets = [];
      wiz.setsLoading = false;
      wiz.setDetails = {};
      wiz.templates = [];
      wiz.createTemplate.mockReset();
      wiz.updateTemplate.mockReset();
    });

    // Team report: type -> name -> timeframe -> metrics (picks FLY10_TIME unless prefilled) -> benchmarks
    const toBenchmarks = async (pickMetric = true) => {
      await waitFor(() => expect(screen.getByText('Team Report')).toBeInTheDocument());
      next();
      await waitFor(() => fireEvent.change(screen.getByLabelText(/Report Name/i), { target: { value: 'Tpl Test' } }));
      next();
      next();
      if (pickMetric) await waitFor(() => fireEvent.click(document.getElementById('FLY10_TIME')!));
      next();
    };
    const toLastStep = () => { next(); next(); };
    const addSet = async (name: string) => {
      fireEvent.click(screen.getByRole('button', { name: `add ${name}` }));
      await waitFor(() => expect(screen.getByText(`Benchmarks from set: ${name}`)).toBeInTheDocument());
    };
    const render_ = () => renderWithQueryClient(<ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />);

    it('tells the coach where to create a template when the organization has none', async () => {
      wiz.templates = [];
      render_();
      expect(await screen.findByText(/No templates yet/i)).toBeInTheDocument();
      expect(screen.getByText(/Save as template/i)).toBeInTheDocument();
      expect(screen.queryByRole('combobox', { name: /Start from template/i })).not.toBeInTheDocument();
    });

    it('prefills metrics, sets, picks and charts from a template and notes what is gone', async () => {
      wiz.sets = [{ id: 'set-a', name: 'Set A' }];
      wiz.setDetails['set-a'] = loaded(setWith('set-a', 'Set A', [['custom-bench-1', 'custom']]));
      wiz.templates = [{
        id: 't1', name: 'Speed', description: null, metrics: ['FLY10_TIME', 'GONE_METRIC'],
        benchmarkSetIds: ['set-a'], siteBenchmarkIds: ['site-bench-1'], customBenchmarkIds: [],
        charts: { team: { trends: false } },
      }];
      const user = userEvent.setup();
      render_();
      await user.click(await screen.findByRole('combobox', { name: /Start from template/i }));
      await user.click(await screen.findByRole('option', { name: 'Speed' }));
      expect(screen.getByText(/1 item is no longer available/i)).toBeInTheDocument();

      await toBenchmarks(false);
      expect(screen.getByRole('button', { name: 'Remove Set A' })).toBeInTheDocument();
      await waitFor(() => expect(screen.getByText('Benchmarks from set: Set A')).toBeInTheDocument());
      toLastStep();
      fireEvent.click(screen.getByRole('button', { name: /Create Report/i }));

      await waitFor(() => expect(mockCreateReportMutate).toHaveBeenCalled());
      const { config } = mockCreateReportMutate.mock.calls[0][0];
      expect(config.metrics).toEqual(['FLY10_TIME']);
      expect(config.benchmarks).toEqual({
        site: ['site-bench-1'], custom: ['custom-bench-1'], setIds: ['set-a'], setNames: ['Set A'],
      });
      expect(config.charts.trends).toBe(false);
    });

    it('submits the deduped union of two sets and the individual picks', async () => {
      wiz.sets = [{ id: 'set-a', name: 'Set A' }, { id: 'set-b', name: 'Set B' }];
      wiz.setDetails['set-a'] = loaded(setWith('set-a', 'Set A', [['site-bench-1', 'site'], ['custom-bench-1', 'custom']]));
      wiz.setDetails['set-b'] = loaded(setWith('set-b', 'Set B', [['custom-bench-1', 'custom'], ['custom-bench-2', 'custom']]));
      render_();
      await toBenchmarks();
      await addSet('Set A');
      await addSet('Set B');
      fireEvent.click(screen.getByLabelText(/D1 College Standard/i)); // also in Set A
      toLastStep();
      fireEvent.click(screen.getByRole('button', { name: /Create Report/i }));

      await waitFor(() => expect(mockCreateReportMutate).toHaveBeenCalled());
      expect(mockCreateReportMutate.mock.calls[0][0].config.benchmarks).toEqual({
        site: ['site-bench-1'],
        custom: ['custom-bench-1', 'custom-bench-2'],
        setIds: ['set-a', 'set-b'],
        setNames: ['Set A', 'Set B'],
      });
    });

    it('keeps Create disabled until a slow set has loaded', async () => {
      let finish!: (v: any) => void;
      wiz.sets = [{ id: 'set-a', name: 'Set A' }];
      wiz.setDetails['set-a'] = () => new Promise((resolve) => { finish = resolve; });
      render_();
      await toBenchmarks();
      fireEvent.click(screen.getByRole('button', { name: 'add Set A' }));
      toLastStep();
      expect(screen.getByRole('button', { name: /Create Report/i })).toBeDisabled();
      expect(screen.getByRole('button', { name: /Save as template/i })).toBeDisabled();

      finish(setWith('set-a', 'Set A', [['site-bench-1', 'site']]));
      await waitFor(() => expect(screen.getByRole('button', { name: /Create Report/i })).toBeEnabled());
    });

    it('shows an error and blocks Create when a set fails to load', async () => {
      wiz.sets = [{ id: 'set-a', name: 'Set A' }];
      wiz.setDetails['set-a'] = () => Promise.reject(new Error('boom'));
      render_();
      await toBenchmarks();
      fireEvent.click(screen.getByRole('button', { name: 'add Set A' }));
      await waitFor(() => expect(screen.getByText(/Failed to load a benchmark set/i)).toBeInTheDocument());
      toLastStep();
      expect(screen.getByRole('button', { name: /Create Report/i })).toBeDisabled();
    });

    it('warns when the chosen sets give more than one tier group for a metric', async () => {
      wiz.sets = [{ id: 'set-a', name: 'Set A' }, { id: 'set-b', name: 'Set B' }];
      wiz.setDetails['set-a'] = loaded(setWith('set-a', 'Set A', [['site-bench-1', 'site']]));
      wiz.setDetails['set-b'] = loaded(setWith('set-b', 'Set B', [['custom-bench-1', 'custom']]));
      render_();
      await toBenchmarks();
      await addSet('Set A');
      expect(screen.queryByText(/more than one tier group/i)).not.toBeInTheDocument();
      await addSet('Set B');
      expect(await screen.findByText(/more than one tier group/i)).toBeInTheDocument();
    });

    it('saves a template from the chosen metrics, sets and charts', async () => {
      wiz.sets = [{ id: 'set-a', name: 'Set A' }];
      wiz.setDetails['set-a'] = loaded(setWith('set-a', 'Set A', [['site-bench-1', 'site']]));
      wiz.createTemplate.mockResolvedValue({ id: 't-new', name: 'My template', charts: {} });
      render_();
      await toBenchmarks();
      await addSet('Set A');
      fireEvent.click(screen.getByLabelText(/Club Average/i));
      toLastStep();
      fireEvent.click(screen.getByRole('button', { name: /Save as template/i }));
      fireEvent.change(await screen.findByLabelText(/Template name/i), { target: { value: 'My template' } });
      fireEvent.click(screen.getByRole('button', { name: /Save template/i }));

      await waitFor(() => expect(wiz.createTemplate).toHaveBeenCalled());
      expect(wiz.createTemplate.mock.calls[0][0]).toMatchObject({
        name: 'My template',
        metrics: ['FLY10_TIME'],
        benchmarkSetIds: ['set-a'],
        siteBenchmarkIds: [],
        customBenchmarkIds: ['custom-bench-1'],
        charts: { team: { benchmarkStanding: true, trends: true, boxSwarm: true, leaderboard: true, tierDistribution: true } },
      });
      expect(mockCreateReportMutate).not.toHaveBeenCalled();
    });

    it('shows an inline error when the template name is taken (409)', async () => {
      wiz.createTemplate.mockRejectedValue(new Error('409: duplicate'));
      render_();
      await toBenchmarks();
      toLastStep();
      fireEvent.click(screen.getByRole('button', { name: /Save as template/i }));
      fireEvent.change(await screen.findByLabelText(/Template name/i), { target: { value: 'Dup' } });
      fireEvent.click(screen.getByRole('button', { name: /Save template/i }));
      expect(await screen.findByText(/already exists/i)).toBeInTheDocument();
    });

    const speedTemplate = (over: object = {}) => ({
      id: 't1', name: 'Speed', description: 'old', metrics: ['FLY10_TIME'],
      benchmarkSetIds: ['set-a'], siteBenchmarkIds: [], customBenchmarkIds: [], charts: {}, ...over,
    });
    const pickTemplate = async (user: ReturnType<typeof userEvent.setup>) => {
      await user.click(await screen.findByRole('combobox', { name: /Start from template/i }));
      await user.click(await screen.findByRole('option', { name: 'Speed' }));
    };

    it('disables the template select until the lists have loaded, then keeps the items', async () => {
      wiz.sets = [{ id: 'set-a', name: 'Set A' }];
      wiz.setDetails['set-a'] = loaded(setWith('set-a', 'Set A', [['site-bench-1', 'site']]));
      wiz.templates = [speedTemplate()];
      wiz.setsLoading = true;
      const user = userEvent.setup();
      const { rerender } = render_();
      expect(await screen.findByRole('combobox', { name: /Start from template/i })).toBeDisabled();

      wiz.setsLoading = false;
      rerender(<QueryClientProvider client={queryClient}><ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} /></QueryClientProvider>);
      await waitFor(() => expect(screen.getByRole('combobox', { name: /Start from template/i })).toBeEnabled());
      await pickTemplate(user);
      expect(screen.queryByText(/no longer available/i)).not.toBeInTheDocument();
    });

    it('drops a set that returns 404 and counts it as no longer available', async () => {
      wiz.sets = [{ id: 'set-a', name: 'Set A' }];
      wiz.setDetails['set-a'] = () => Promise.reject(Object.assign(new Error('not found'), { status: 404 }));
      wiz.templates = [speedTemplate()];
      const user = userEvent.setup();
      render_();
      await pickTemplate(user);
      expect(await screen.findByText(/1 item is no longer available/i)).toBeInTheDocument();
      next(); next(); next(); next();
      expect(screen.queryByRole('button', { name: 'Remove Set A' })).not.toBeInTheDocument();
    });

    it('keeps blocking on a non-404 set error and offers Retry', async () => {
      let calls = 0;
      wiz.sets = [{ id: 'set-a', name: 'Set A' }];
      wiz.setDetails['set-a'] = () =>
        ++calls === 1
          ? Promise.reject(Object.assign(new Error('boom'), { status: 500 }))
          : Promise.resolve(setWith('set-a', 'Set A', [['site-bench-1', 'site']]));
      render_();
      await toBenchmarks();
      fireEvent.click(screen.getByRole('button', { name: 'add Set A' }));
      fireEvent.click(await screen.findByRole('button', { name: 'Retry' }));
      await waitFor(() => expect(screen.getByText('Benchmarks from set: Set A')).toBeInTheDocument());
    });

    it('sends description null when it is cleared on update, and omits it on create', async () => {
      wiz.sets = [{ id: 'set-a', name: 'Set A' }];
      wiz.setDetails['set-a'] = loaded(setWith('set-a', 'Set A', [['site-bench-1', 'site']]));
      wiz.templates = [speedTemplate()];
      wiz.updateTemplate.mockResolvedValue(speedTemplate());
      wiz.createTemplate.mockResolvedValue(speedTemplate());
      const user = userEvent.setup();
      render_();
      await pickTemplate(user);
      await toBenchmarks(false);
      toLastStep();
      await waitFor(() => expect(screen.getByRole('button', { name: /Save as template/i })).toBeEnabled());
      fireEvent.click(screen.getByRole('button', { name: /Save as template/i }));
      fireEvent.change(await screen.findByLabelText(/Description/i), { target: { value: '' } });
      fireEvent.click(screen.getByRole('button', { name: /Save template/i }));
      await waitFor(() => expect(wiz.updateTemplate).toHaveBeenCalled());
      expect(wiz.updateTemplate.mock.calls[0][0]).toMatchObject({ id: 't1', data: { description: null } });
    });

    it('omits description on create when it is empty', async () => {
      wiz.createTemplate.mockResolvedValue(speedTemplate());
      render_();
      await toBenchmarks();
      toLastStep();
      fireEvent.click(screen.getByRole('button', { name: /Save as template/i }));
      fireEvent.change(await screen.findByLabelText(/Template name/i), { target: { value: 'N' } });
      fireEvent.click(screen.getByRole('button', { name: /Save template/i }));
      await waitFor(() => expect(wiz.createTemplate).toHaveBeenCalled());
      expect(wiz.createTemplate.mock.calls[0][0].description).toBeUndefined();
    });

    it('disables Save as template with no metrics and shows the server message on a 400', async () => {
      render_();
      await toBenchmarks(false);
      toLastStep();
      expect(screen.getByRole('button', { name: /Save as template/i })).toBeDisabled();
    });

    it('shows the server message when saving fails with a 400', async () => {
      // The real route answers { error: "Invalid template", details: zod.flatten() }
      wiz.createTemplate.mockRejectedValue(new Error('400: {"error":"Invalid template","details":{"formErrors":[],"fieldErrors":{"name":["Name is too long"]}}}'));
      render_();
      await toBenchmarks();
      toLastStep();
      fireEvent.click(screen.getByRole('button', { name: /Save as template/i }));
      fireEvent.change(await screen.findByLabelText(/Template name/i), { target: { value: 'X' } });
      fireEvent.click(screen.getByRole('button', { name: /Save template/i }));
      expect(await screen.findByText('Name is too long')).toBeInTheDocument();
    });
  });
});
