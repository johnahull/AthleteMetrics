/**
 * RequestModal: the "Anytime" (standing) send mode (AM-FEAT-027)
 */

import { describe, it, expect, beforeEach, vi } from 'vitest';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import RequestModal from '../RequestModal';

const mockMutateAsync = vi.fn();
const mockToast = vi.fn();

vi.mock('@/hooks/use-wellness-requests', () => ({
  useCreateWellnessRequest: () => ({ mutateAsync: mockMutateAsync, isPending: false }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

vi.mock('@/components/ui/team-athlete-selector', () => ({
  TeamAthleteSelector: ({ onSelectionChange }: any) => (
    <button type="button" data-testid="mock-select-athletes" onClick={() => onSelectionChange(['athlete-1'])}>
      Pick athletes
    </button>
  ),
}));

vi.mock('../QRCodeGenerator', () => ({ default: () => null }));

// Only the template Select is rendered outside recurring mode; clicking it picks the first template
vi.mock('@/components/ui/select', () => ({
  Select: ({ children, onValueChange }: any) => (
    <div>
      <button type="button" data-testid="mock-select-template" onClick={() => onValueChange?.('template-1')}>
        Pick template
      </button>
      {children}
    </div>
  ),
  SelectTrigger: ({ children }: any) => <div>{children}</div>,
  SelectValue: () => null,
  SelectContent: () => null,
  SelectItem: () => null,
}));

const templates = [{ id: 'template-1', name: 'Daily check-in' }] as any;

function renderModal() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={queryClient}>
      <RequestModal isOpen onClose={vi.fn()} organizationId="org-1" templates={templates} />
    </QueryClientProvider>
  );
}

describe('RequestModal - Anytime mode', () => {
  beforeEach(() => {
    mockMutateAsync.mockReset();
    mockMutateAsync.mockResolvedValue({ id: 'request-1' });
    mockToast.mockReset();
  });

  it('offers an Anytime send mode that hides the expiry and schedule inputs', async () => {
    const user = userEvent.setup();
    renderModal();

    expect(screen.getByTestId('input-expiry-date')).toBeInTheDocument();

    await user.click(screen.getByTestId('send-mode-anytime'));

    expect(screen.queryByTestId('input-expiry-date')).not.toBeInTheDocument();
    expect(screen.queryByTestId('input-scheduled-datetime')).not.toBeInTheDocument();
    expect(screen.queryByTestId('input-schedule-time')).not.toBeInTheDocument();
    expect(screen.getByText(/sent once, never expires/i)).toBeInTheDocument();
  });

  it('sends a standing athlete_account request with no expiry or schedule', async () => {
    const user = userEvent.setup();
    renderModal();

    // The default distribution method is magic_link; Anytime must override it
    await user.click(screen.getByTestId('mock-select-template'));
    await user.click(screen.getByTestId('mock-select-athletes'));
    await user.click(screen.getByTestId('send-mode-anytime'));
    await user.click(screen.getByTestId('button-send-request-submit'));

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    expect(mockMutateAsync).toHaveBeenCalledWith({
      templateId: 'template-1',
      distributionMethod: 'athlete_account',
      targetAthleteIds: ['athlete-1'],
      isStanding: true,
    });
  });

  it('requires at least one athlete in Anytime mode', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId('mock-select-template'));
    await user.click(screen.getByTestId('send-mode-anytime'));
    await user.click(screen.getByTestId('button-send-request-submit'));

    expect(mockMutateAsync).not.toHaveBeenCalled();
    expect(mockToast).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });

  it('keeps the Send now payload unchanged', async () => {
    const user = userEvent.setup();
    renderModal();

    await user.click(screen.getByTestId('mock-select-template'));
    await user.click(screen.getByTestId('mock-select-athletes'));
    await user.click(screen.getByTestId('button-send-request-submit'));

    expect(mockMutateAsync).toHaveBeenCalledTimes(1);
    const payload = mockMutateAsync.mock.calls[0][0];
    expect(payload).toEqual({
      templateId: 'template-1',
      distributionMethod: 'magic_link',
      targetAthleteIds: ['athlete-1'],
      expiresAt: expect.any(String),
    });
  });
});
