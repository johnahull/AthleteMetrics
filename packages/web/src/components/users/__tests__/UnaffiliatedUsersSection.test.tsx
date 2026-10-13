import React from 'react';
import { describe, it, expect, vi, afterEach, beforeAll } from 'vitest';
import { render, screen, cleanup, fireEvent, waitFor, within } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { UnaffiliatedUsersSection } from '../UnaffiliatedUsersSection';

const { apiRequestMock, toastMock } = vi.hoisted(() => ({ apiRequestMock: vi.fn(), toastMock: vi.fn() }));
vi.mock('@/lib/queryClient', () => ({ apiRequest: apiRequestMock, STALE_TIME: { REALTIME: 0 } }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }) }));

const users = [
  { id: 'u1', firstName: 'Lucy', lastName: 'Ortiz', username: 'lucyortiz', emails: ['lucy@example.com'], isActive: true, isParent: false },
  { id: 'u2', firstName: 'Pat', lastName: 'Parent', username: 'patp', emails: ['pat@example.com'], isActive: true, isParent: true },
];
const organizations = [
  { id: 'org-1', name: 'Big Time Athletes' },
  { id: 'org-2', name: 'Other Org' },
];

function renderSection(data: unknown[] = users) {
  const client = new QueryClient({
    defaultOptions: { queries: { retry: false, queryFn: async () => data } },
  });
  const invalidate = vi.spyOn(client, 'invalidateQueries');
  render(
    <QueryClientProvider client={client}>
      <UnaffiliatedUsersSection organizations={organizations} />
    </QueryClientProvider>,
  );
  return { invalidate };
}

describe('UnaffiliatedUsersSection', () => {
  beforeAll(() => {
    // Radix primitives under happy-dom
    Element.prototype.hasPointerCapture ??= () => false;
    Element.prototype.setPointerCapture ??= () => {};
    Element.prototype.releasePointerCapture ??= () => {};
    Element.prototype.scrollIntoView ??= () => {};
  });
  afterEach(() => {
    cleanup();
    apiRequestMock.mockReset();
    toastMock.mockReset();
  });

  it('lists unaffiliated users with name, username, email and a Parent badge', async () => {
    renderSection();
    expect(await screen.findByText('Lucy Ortiz')).toBeInTheDocument();
    expect(screen.getByText(/@lucyortiz/)).toBeInTheDocument();
    expect(screen.getByText(/lucy@example.com/)).toBeInTheDocument();
    expect(screen.getByText('Parent')).toBeInTheDocument();
  });

  it('disables Assign for a parent and explains why', async () => {
    renderSection();
    await screen.findByText('Pat Parent');
    const row = screen.getByTestId('unaffiliated-user-u2');
    expect(within(row).getByRole('button', { name: /assign to organization/i })).toBeDisabled();
    expect(within(row).getByText(/parents can't be assigned/i)).toBeInTheDocument();
  });

  it('assigns with the first org and athlete role by default, then refreshes both lists', async () => {
    apiRequestMock.mockResolvedValue({ ok: true, json: async () => ({}) });
    const { invalidate } = renderSection();
    await screen.findByText('Lucy Ortiz');

    fireEvent.click(within(screen.getByTestId('unaffiliated-user-u1')).getByRole('button', { name: /assign to organization/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));

    await waitFor(() =>
      expect(apiRequestMock).toHaveBeenCalledWith('POST', '/api/organizations/org-1/users/u1/assign', { role: 'athlete' }),
    );
    await waitFor(() => {
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['/api/users/unaffiliated'] });
      expect(invalidate).toHaveBeenCalledWith({ queryKey: ['/api/organizations-with-users'] });
    });
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ title: expect.stringMatching(/assigned/i) }));
  });

  it('shows the server error and keeps the user listed when assigning fails', async () => {
    apiRequestMock.mockRejectedValue(new Error('User already belongs to an organization'));
    renderSection();
    await screen.findByText('Lucy Ortiz');
    fireEvent.click(within(screen.getByTestId('unaffiliated-user-u1')).getByRole('button', { name: /assign to organization/i }));
    fireEvent.click(await screen.findByRole('button', { name: /^assign$/i }));

    await waitFor(() =>
      expect(toastMock).toHaveBeenCalledWith(
        expect.objectContaining({ variant: 'destructive', description: 'User already belongs to an organization' }),
      ),
    );
    expect(screen.getByText('Lucy Ortiz')).toBeInTheDocument();
  });

  it('shows an empty state', async () => {
    renderSection([]);
    expect(await screen.findByText(/no unaffiliated users/i)).toBeInTheDocument();
  });
});
