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

// Mock apiRequest
const mockApiRequest = vi.fn();
vi.mock('@/lib/queryClient', () => ({
  apiRequest: (...args: any[]) => mockApiRequest(...args),
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
        expect(screen.getByText('Coach Report')).toBeInTheDocument();
      });

      // Select coach report type
      const coachRadio = screen.getByLabelText(/Coach Report/i, { exact: false });
      fireEvent.click(coachRadio);

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
        expect(screen.getByText('Coach Report')).toBeInTheDocument();
      });

      // Try to submit form
      const coachRadio = screen.getByLabelText(/Coach Report/i, { exact: false });
      fireEvent.click(coachRadio);

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
        expect(screen.getByText('Coach Report')).toBeInTheDocument();
      });

      // Select coach report
      const coachRadio = screen.getByLabelText(/Coach Report/i, { exact: false });
      fireEvent.click(coachRadio);
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
        reportType: 'coach',
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
        expect(screen.getByText('Coach Report')).toBeInTheDocument();
      });

      // Quick navigation through wizard
      const coachRadio = screen.getByLabelText(/Coach Report/i, { exact: false });
      fireEvent.click(coachRadio);
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
        expect(mockApiRequest).toHaveBeenCalledWith(
          'GET',
          `/api/organizations/${mockOrganizationContext}/metrics?enabledOnly=true`
        );
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
        expect(mockApiRequest).toHaveBeenCalledWith(
          'GET',
          `/api/organizations/${mockOrganizationContext}/benchmarks/custom`
        );
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
        expect(screen.getByText('Coach Report')).toBeInTheDocument();
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

      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      // Navigate to metrics step
      await waitFor(() => {
        expect(screen.getByText('Coach Report')).toBeInTheDocument();
      });

      const coachRadio = screen.getByLabelText(/Coach Report/i, { exact: false });
      fireEvent.click(coachRadio);
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

      renderWithQueryClient(
        <ReportWizard open={true} onClose={mockOnClose} onSuccess={mockOnSuccess} />
      );

      await waitFor(() => {
        expect(screen.getByText('Coach Report')).toBeInTheDocument();
      });

      // Navigate to metrics step
      const coachRadio = screen.getByLabelText(/Coach Report/i, { exact: false });
      fireEvent.click(coachRadio);
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
});
