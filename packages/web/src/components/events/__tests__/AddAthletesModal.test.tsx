/**
 * AddAthletesModal: managers add organization athletes straight onto an event roster.
 */

import { describe, it, expect, vi, beforeEach, beforeAll } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { AddAthletesModal } from '../AddAthletesModal';

beforeAll(() => {
  if (typeof Element.prototype.hasPointerCapture === 'undefined') {
    Element.prototype.hasPointerCapture = function () { return false; };
  }
  if (typeof Element.prototype.setPointerCapture === 'undefined') {
    Element.prototype.setPointerCapture = function () {};
  }
  if (typeof Element.prototype.releasePointerCapture === 'undefined') {
    Element.prototype.releasePointerCapture = function () {};
  }
  if (typeof Element.prototype.scrollIntoView === 'undefined') {
    Element.prototype.scrollIntoView = function () {};
  }
});

const mockAthletes = [
  { id: 'user-1', fullName: 'John Smith', teamName: 'Varsity' },
  { id: 'user-2', fullName: 'Maria Garcia', teamName: 'Varsity' },
  { id: 'user-3', fullName: 'Tyler Johnson', teamName: 'JV' },
  { id: 'user-4', fullName: 'Sarah Williams', teamName: 'Varsity' },
];

let mockRegistrations: Array<{ id: string; userId: string; status: string }> = [];
const mockMutateAsync = vi.fn();
const mockToast = vi.fn();
let mockIsPending = false;

vi.mock('@/lib/api', () => ({
  queries: {
    athletes: () => ({
      queryKey: ['athletes', { organizationId: 'org-123' }],
      queryFn: () => Promise.resolve(mockAthletes),
    }),
  },
}));

vi.mock('@/lib/events-api', () => ({
  useEventRegistrations: () => ({ data: mockRegistrations, isLoading: false }),
  useAddEventAthletes: () => ({ mutateAsync: mockMutateAsync, isPending: mockIsPending }),
}));

vi.mock('@/hooks/use-toast', () => ({
  useToast: () => ({ toast: mockToast }),
}));

function createWrapper() {
  const queryClient = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
}

function renderModal(onClose = vi.fn()) {
  render(
    <AddAthletesModal
      eventId="event-123"
      eventName="Spring Combine"
      organizationId="org-123"
      isOpen={true}
      onClose={onClose}
    />,
    { wrapper: createWrapper() },
  );
  return onClose;
}

describe('AddAthletesModal', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockRegistrations = [];
    mockIsPending = false;
    mockMutateAsync.mockResolvedValue({ added: [], updated: [], alreadyOnEvent: [], rejected: [] });
  });

  it('lists the organization athletes and the silent-add note', async () => {
    renderModal();
    expect(await screen.findByText('John Smith')).toBeInTheDocument();
    expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
    expect(screen.getByText('Tyler Johnson')).toBeInTheDocument();
    expect(screen.getByText(/not emailed or notified/i)).toBeInTheDocument();
  });

  it('filters the list with the search box', async () => {
    renderModal();
    await screen.findByText('John Smith');
    await userEvent.setup().type(screen.getByPlaceholderText(/search athletes/i), 'maria');
    expect(screen.queryByText('John Smith')).not.toBeInTheDocument();
    expect(screen.getByText('Maria Garcia')).toBeInTheDocument();
  });

  it('disables the button at 0 and shows the selected count once athletes are ticked', async () => {
    renderModal();
    await screen.findByText('John Smith');
    const user = userEvent.setup();
    expect(screen.getByRole('button', { name: /^add athletes$/i })).toBeDisabled();
    await user.click(screen.getByRole('checkbox', { name: 'John Smith' }));
    expect(screen.getByRole('button', { name: 'Add 1 athlete' })).toBeEnabled();
    await user.click(screen.getByRole('checkbox', { name: 'Maria Garcia' }));
    expect(screen.getByRole('button', { name: 'Add 2 athletes' })).toBeEnabled();
  });

  it('has "Check them in now" on by default and sends checkIn true with ONE request for all selected ids', async () => {
    const onClose = renderModal();
    await screen.findByText('John Smith');
    const user = userEvent.setup();
    const toggle = screen.getByRole('switch', { name: /check them in now/i });
    expect(toggle).toBeChecked();
    await user.click(screen.getByRole('checkbox', { name: 'John Smith' }));
    await user.click(screen.getByRole('checkbox', { name: 'Tyler Johnson' }));
    await user.click(screen.getByRole('button', { name: 'Add 2 athletes' }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalledTimes(1));
    expect(mockMutateAsync).toHaveBeenCalledWith({
      eventId: 'event-123',
      userIds: ['user-1', 'user-3'],
      checkIn: true,
    });
    await waitFor(() => expect(onClose).toHaveBeenCalled());
  });

  it('sends checkIn false when the switch is turned off', async () => {
    renderModal();
    await screen.findByText('John Smith');
    const user = userEvent.setup();
    await user.click(screen.getByRole('switch', { name: /check them in now/i }));
    await user.click(screen.getByRole('checkbox', { name: 'John Smith' }));
    await user.click(screen.getByRole('button', { name: 'Add 1 athlete' }));
    await waitFor(() => expect(mockMutateAsync).toHaveBeenCalled());
    expect(mockMutateAsync.mock.calls[0][0].checkIn).toBe(false);
  });

  it('shows one toast naming added and already-on-event athletes', async () => {
    mockMutateAsync.mockResolvedValue({
      added: ['user-1', 'user-2', 'user-3'],
      updated: ['user-4'],
      alreadyOnEvent: ['user-5', 'user-6'],
      rejected: [],
    });
    renderModal();
    await screen.findByText('John Smith');
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'John Smith' }));
    await user.click(screen.getByRole('button', { name: 'Add 1 athlete' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    expect(mockToast.mock.calls[0][0].description).toBe('Added 4 athletes (2 were already on the event)');
  });

  it('mentions rejected athletes and over-capacity plainly', async () => {
    mockMutateAsync.mockResolvedValue({
      added: ['user-1'],
      updated: [],
      alreadyOnEvent: [],
      rejected: [{ userId: 'x', reason: 'not_in_organization' }],
      overCapacity: true,
    });
    renderModal();
    await screen.findByText('John Smith');
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'John Smith' }));
    await user.click(screen.getByRole('button', { name: 'Add 1 athlete' }));
    await waitFor(() => expect(mockToast).toHaveBeenCalledTimes(1));
    const text = mockToast.mock.calls[0][0].description as string;
    expect(text).toContain('Added 1 athlete');
    expect(text).toMatch(/1 could not be added/i);
    expect(text).toMatch(/over capacity/i);
  });

  it('shows an inline error and stays open when the request fails', async () => {
    mockMutateAsync.mockRejectedValue(new Error('Event is cancelled and cannot take new athletes'));
    const onClose = renderModal();
    await screen.findByText('John Smith');
    const user = userEvent.setup();
    await user.click(screen.getByRole('checkbox', { name: 'John Smith' }));
    await user.click(screen.getByRole('button', { name: 'Add 1 athlete' }));
    expect(await screen.findByRole('alert')).toHaveTextContent('Event is cancelled and cannot take new athletes');
    expect(onClose).not.toHaveBeenCalled();
    expect(mockToast).not.toHaveBeenCalled();
  });

  it('shows a loading label and disables the button while saving', async () => {
    mockIsPending = true;
    renderModal();
    await screen.findByText('John Smith');
    expect(screen.getByRole('button', { name: /adding/i })).toBeDisabled();
  });

  it('badges athletes already checked in (not selectable) and selectable ones with other states', async () => {
    mockRegistrations = [
      { id: 'r1', userId: 'user-1', status: 'checked_in' },
      { id: 'r2', userId: 'user-2', status: 'pending' },
    ];
    renderModal();
    await screen.findByText('John Smith');
    expect(screen.getByText('Checked in')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'John Smith' })).toBeDisabled();
    expect(screen.getByText('Pending approval')).toBeInTheDocument();
    expect(screen.getByRole('checkbox', { name: 'Maria Garcia' })).toBeEnabled();
  });
});
