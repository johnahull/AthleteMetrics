import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { ShareReportDialog } from '../ShareReportDialog';
import { addDays, format } from 'date-fns';

// Mock hooks
const mockCreateSnapshotMutate = vi.fn();
const mockRevokeSnapshotMutate = vi.fn();
const mockUseCreateSnapshot = vi.fn();
const mockUseReportSnapshots = vi.fn();
const mockUseRevokeSnapshot = vi.fn();

vi.mock('@/hooks/use-reports', () => ({
  useCreateSnapshot: () => mockUseCreateSnapshot(),
  useReportSnapshots: () => mockUseReportSnapshots(),
  useRevokeSnapshot: () => mockUseRevokeSnapshot(),
}));

// Mock toast
const mockToast = vi.fn();
vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

// Mock clipboard API
Object.defineProperty(navigator, 'clipboard', {
  value: {
    writeText: vi.fn(),
  },
  writable: true,
  configurable: true,
});

describe('ShareReportDialog Component', () => {
  let queryClient: QueryClient;
  const mockOnClose = vi.fn();
  const testReportId = 'report-123';

  const mockSnapshots = [
    {
      id: 'snapshot-1',
      reportId: testReportId,
      publicToken: 'token-abc-123',
      createdAt: new Date('2025-01-01').toISOString(),
      expiresAt: addDays(new Date('2025-01-01'), 7).toISOString(),
      viewCount: 5,
      isActive: true,
      revokedAt: null,
    },
    {
      id: 'snapshot-2',
      reportId: testReportId,
      publicToken: 'token-def-456',
      createdAt: new Date('2025-01-05').toISOString(),
      expiresAt: addDays(new Date('2025-01-05'), 30).toISOString(),
      viewCount: 12,
      isActive: true,
      revokedAt: null,
    },
    {
      id: 'snapshot-3-revoked',
      reportId: testReportId,
      publicToken: 'token-revoked',
      createdAt: new Date('2024-12-01').toISOString(),
      expiresAt: addDays(new Date('2024-12-01'), 7).toISOString(),
      viewCount: 3,
      isActive: false,
      revokedAt: new Date('2024-12-05').toISOString(),
    },
  ];

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
    mockUseCreateSnapshot.mockReturnValue({
      mutateAsync: mockCreateSnapshotMutate,
      isPending: false,
    });

    mockUseReportSnapshots.mockReturnValue({
      data: mockSnapshots,
      isLoading: false,
    });

    mockUseRevokeSnapshot.mockReturnValue({
      mutateAsync: mockRevokeSnapshotMutate,
    });

    mockCreateSnapshotMutate.mockResolvedValue({
      id: 'new-snapshot',
      publicToken: 'new-token-xyz',
      expiresAt: addDays(new Date(), 7).toISOString(),
    });

    mockRevokeSnapshotMutate.mockResolvedValue({ success: true });

    vi.clearAllMocks();
  });

  afterEach(() => {
    queryClient.clear();
  });

  describe('Rendering', () => {
    it('should render dialog when open', () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      expect(screen.getByText('Share Report')).toBeInTheDocument();
      expect(screen.getByText('Create a public link to share this report with others')).toBeInTheDocument();
    });

    it('should not render when closed', () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={false} onClose={mockOnClose} />
      );

      expect(screen.queryByText('Share Report')).not.toBeInTheDocument();
    });

    it('should display create new link section', () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      expect(screen.getByText('Create New Share Link')).toBeInTheDocument();
      expect(screen.getByLabelText(/Link Expiration/i)).toBeInTheDocument();
      expect(screen.getByRole('button', { name: /Create Link/i })).toBeInTheDocument();
    });

    it('should display active share links section', () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      expect(screen.getByText('Active Share Links')).toBeInTheDocument();
    });
  });

  describe('Creating Share Links', () => {
    it('should create link with 7 days expiration (default)', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      const createButton = screen.getByRole('button', { name: /Create Link/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockCreateSnapshotMutate).toHaveBeenCalled();
      });

      const callArgs = mockCreateSnapshotMutate.mock.calls[0][0];
      const expiresAt = new Date(callArgs.expiresAt);
      const expectedExpiration = addDays(new Date(), 7);

      // Allow 1-second tolerance for test execution time
      const timeDiff = Math.abs(expiresAt.getTime() - expectedExpiration.getTime());
      expect(timeDiff).toBeLessThan(2000);
    });

    it('should create link with 1 day expiration', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      // Select 1 day expiration
      const select = screen.getByRole('combobox');
      fireEvent.click(select);

      await waitFor(() => {
        const option = screen.getByRole('option', { name: '1 day' });
        fireEvent.click(option);
      });

      const createButton = screen.getByRole('button', { name: /Create Link/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockCreateSnapshotMutate).toHaveBeenCalled();
      });

      const callArgs = mockCreateSnapshotMutate.mock.calls[0][0];
      const expiresAt = new Date(callArgs.expiresAt);
      const expectedExpiration = addDays(new Date(), 1);

      const timeDiff = Math.abs(expiresAt.getTime() - expectedExpiration.getTime());
      expect(timeDiff).toBeLessThan(2000);
    });

    it('should create link with 30 days expiration', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      // Select 30 days expiration
      const select = screen.getByRole('combobox');
      fireEvent.click(select);

      await waitFor(() => {
        const option = screen.getByRole('option', { name: '30 days' });
        fireEvent.click(option);
      });

      const createButton = screen.getByRole('button', { name: /Create Link/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockCreateSnapshotMutate).toHaveBeenCalled();
      });

      const callArgs = mockCreateSnapshotMutate.mock.calls[0][0];
      const expiresAt = new Date(callArgs.expiresAt);
      const expectedExpiration = addDays(new Date(), 30);

      const timeDiff = Math.abs(expiresAt.getTime() - expectedExpiration.getTime());
      expect(timeDiff).toBeLessThan(2000);
    });

    it('should show custom date input when custom is selected', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      const select = screen.getByRole('combobox');
      fireEvent.click(select);

      await waitFor(() => {
        const option = screen.getByRole('option', { name: 'Custom date' });
        fireEvent.click(option);
      });

      await waitFor(() => {
        expect(screen.getByLabelText(/Custom Expiration Date/i)).toBeInTheDocument();
      });
    });

    it('should show error when custom date is not provided', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      const select = screen.getByRole('combobox');
      fireEvent.click(select);

      await waitFor(() => {
        const option = screen.getByRole('option', { name: 'Custom date' });
        fireEvent.click(option);
      });

      const createButton = screen.getByRole('button', { name: /Create Link/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Error',
          description: 'Please select a custom expiration date',
          variant: 'destructive',
        });
      });

      expect(mockCreateSnapshotMutate).not.toHaveBeenCalled();
    });

    it('should create link with custom date', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      const select = screen.getByRole('combobox');
      fireEvent.click(select);

      await waitFor(() => {
        const option = screen.getByRole('option', { name: 'Custom date' });
        fireEvent.click(option);
      });

      const customDate = '2025-12-31';
      const customDateInput = screen.getByLabelText(/Custom Expiration Date/i);
      fireEvent.change(customDateInput, { target: { value: customDate } });

      const createButton = screen.getByRole('button', { name: /Create Link/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(mockCreateSnapshotMutate).toHaveBeenCalled();
      });

      const callArgs = mockCreateSnapshotMutate.mock.calls[0][0];
      expect(callArgs.expiresAt).toContain('2025-12-31');
    });

    it('should display generated URL after creation', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      const createButton = screen.getByRole('button', { name: /Create Link/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Generated Link')).toBeInTheDocument();
      });

      const generatedUrl = `${window.location.origin}/public/reports/new-token-xyz`;
      const urlInput = screen.getByDisplayValue(generatedUrl);
      expect(urlInput).toBeInTheDocument();
    });
  });

  describe('Copying Links', () => {
    it('should copy generated URL to clipboard', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      const createButton = screen.getByRole('button', { name: /Create Link/i });
      fireEvent.click(createButton);

      await waitFor(() => {
        expect(screen.getByText('Generated Link')).toBeInTheDocument();
      });

      const copyButtons = screen.getAllByRole('button', { name: '' });
      const generatedUrlCopyButton = copyButtons.find(btn =>
        btn.querySelector('svg')?.classList.contains('lucide-copy')
      );

      fireEvent.click(generatedUrlCopyButton!);

      await waitFor(() => {
        const expectedUrl = `${window.location.origin}/public/reports/new-token-xyz`;
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expectedUrl);
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Success',
          description: 'Link copied to clipboard',
        });
      });
    });

    it('should copy existing snapshot URL to clipboard', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      // Wait for the snapshots table to render
      await waitFor(() => {
        expect(screen.getByText('Jan 1, 2025')).toBeInTheDocument();
      });

      // Find copy buttons in the table (there should be 2 active snapshots)
      let snapshotCopyButtons: HTMLElement[] = [];
      await waitFor(() => {
        const copyButtons = screen.getAllByRole('button', { name: '' });
        snapshotCopyButtons = copyButtons.filter(btn =>
          btn.querySelector('svg')?.classList.contains('lucide-copy')
        );
        expect(snapshotCopyButtons.length).toBeGreaterThan(0);
      });

      // Click the first snapshot's copy button
      fireEvent.click(snapshotCopyButtons[0]);

      await waitFor(() => {
        const expectedUrl = `${window.location.origin}/public/reports/token-abc-123`;
        expect(navigator.clipboard.writeText).toHaveBeenCalledWith(expectedUrl);
        expect(mockToast).toHaveBeenCalledWith({
          title: 'Success',
          description: 'Link copied to clipboard',
        });
      });
    });
  });

  describe('Revoking Links', () => {
    it('should revoke snapshot when trash icon is clicked', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      // Wait for the snapshots table to render
      await waitFor(() => {
        expect(screen.getByText('Jan 1, 2025')).toBeInTheDocument();
      });

      // Find trash buttons in the table
      let snapshotTrashButtons: HTMLElement[] = [];
      await waitFor(() => {
        const trashButtons = screen.getAllByRole('button', { name: '' });
        snapshotTrashButtons = trashButtons.filter(btn =>
          btn.querySelector('svg')?.classList.contains('lucide-trash-2')
        );
        expect(snapshotTrashButtons.length).toBeGreaterThan(0);
      });

      // Click the first snapshot's trash button
      fireEvent.click(snapshotTrashButtons[0]);

      await waitFor(() => {
        expect(mockRevokeSnapshotMutate).toHaveBeenCalledWith('snapshot-1');
      });
    });
  });

  describe('Active Links Display', () => {
    it('should display loading state while fetching snapshots', () => {
      mockUseReportSnapshots.mockReturnValue({
        data: undefined,
        isLoading: true,
      });

      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      // Check for loading spinner (it's a div with specific className)
      const loadingSpinners = document.querySelectorAll('.animate-spin');
      expect(loadingSpinners.length).toBeGreaterThan(0);
    });

    it('should display "No active share links" when no snapshots', () => {
      mockUseReportSnapshots.mockReturnValue({
        data: [],
        isLoading: false,
      });

      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      expect(screen.getByText('No active share links')).toBeInTheDocument();
    });

    it('should display table of active snapshots', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      // Check table headers
      expect(screen.getByText('Created')).toBeInTheDocument();
      expect(screen.getByText('Expires')).toBeInTheDocument();
      expect(screen.getByText('Views')).toBeInTheDocument();
      expect(screen.getByText('Actions')).toBeInTheDocument();

      // Wait for snapshots to load and check first snapshot data
      await waitFor(() => {
        expect(screen.getByText('Jan 1, 2025')).toBeInTheDocument();
        expect(screen.getByText('5')).toBeInTheDocument();
      });

      // Check second snapshot data
      await waitFor(() => {
        expect(screen.getByText('Jan 5, 2025')).toBeInTheDocument();
        expect(screen.getByText('12')).toBeInTheDocument();
      });
    });

    it('should filter out revoked snapshots', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      // Wait for snapshots to load - only 2 active snapshots should be displayed
      await waitFor(() => {
        expect(screen.getByText('Jan 1, 2025')).toBeInTheDocument();
        expect(screen.getByText('Jan 5, 2025')).toBeInTheDocument();
      });

      // Revoked snapshot should not be displayed
      expect(screen.queryByText('Dec 1, 2024')).not.toBeInTheDocument();
    });

    it('should display snapshot expiration dates', async () => {
      renderWithQueryClient(
        <ShareReportDialog reportId={testReportId} open={true} onClose={mockOnClose} />
      );

      // Check expiration dates (7 days after Jan 1, 30 days after Jan 5)
      const expirationDate1 = format(addDays(new Date('2025-01-01'), 7), 'MMM d, yyyy');
      const expirationDate2 = format(addDays(new Date('2025-01-05'), 30), 'MMM d, yyyy');

      await waitFor(() => {
        expect(screen.getByText(expirationDate1)).toBeInTheDocument();
        expect(screen.getByText(expirationDate2)).toBeInTheDocument();
      });
    });
  });
});
