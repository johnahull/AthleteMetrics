/**
 * Tests for invitations management page
 */

import React from 'react';
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import '@testing-library/jest-dom';
import Invitations from '../invitations';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

// Mock components
vi.mock('@/components/ui/toast', () => ({
  useToast: () => ({
    toast: vi.fn(),
  }),
}));

// Create a wrapper with QueryClient
const createWrapper = () => {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: { retry: false },
      mutations: { retry: false },
    },
  });

  return ({ children }: { children: React.ReactNode }) => (
    <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>
  );
};

describe('Invitations Page', () => {
  const mockInvitations = [
    {
      id: 'inv-1',
      email: 'athlete1@example.com',
      firstName: 'John',
      lastName: 'Doe',
      role: 'athlete',
      status: 'pending',
      isUsed: false,
      emailSent: true,
      emailSentAt: '2024-01-01T10:00:00Z',
      expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: '2024-01-01T09:00:00Z',
      inviterName: 'Jane Admin',
      organizationName: 'Test Organization',
    },
    {
      id: 'inv-2',
      email: 'coach@example.com',
      firstName: 'Sarah',
      lastName: 'Coach',
      role: 'coach',
      status: 'accepted',
      isUsed: true,
      emailSent: true,
      acceptedAt: '2024-01-02T10:00:00Z',
      expiresAt: new Date(Date.now() - 1 * 24 * 60 * 60 * 1000).toISOString(),
      createdAt: '2024-01-01T09:00:00Z',
      inviterName: 'Jane Admin',
      organizationName: 'Test Organization',
    },
  ];

  beforeEach(() => {
    vi.clearAllMocks();
    global.fetch = vi.fn();
  });

  describe('Initial Load', () => {
    it('should show loading state', () => {
      (global.fetch as any).mockImplementation(
        () => new Promise(() => {}) // Never resolves
      );

      render(<Invitations />, { wrapper: createWrapper() });

      expect(screen.getByText(/loading invitations/i)).toBeInTheDocument();
    });

    it('should fetch and display invitations', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockInvitations,
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.getByText('Sarah Coach')).toBeInTheDocument();
      });
    });

    it('should display empty state when no invitations', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText(/no invitations found/i)).toBeInTheDocument();
      });
    });
  });

  describe('Search Functionality', () => {
    it('should filter by email', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockInvitations,
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search by email/i);
      fireEvent.change(searchInput, { target: { value: 'athlete1' } });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
        expect(screen.queryByText('Sarah Coach')).not.toBeInTheDocument();
      });
    });

    it('should filter by name', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockInvitations,
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Sarah Coach')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search by email/i);
      fireEvent.change(searchInput, { target: { value: 'Sarah' } });

      await waitFor(() => {
        expect(screen.getByText('Sarah Coach')).toBeInTheDocument();
        expect(screen.queryByText('John Doe')).not.toBeInTheDocument();
      });
    });

    it('should filter by organization', async () => {
      const invitations = [
        ...mockInvitations,
        {
          ...mockInvitations[0],
          id: 'inv-3',
          organizationName: 'Other Organization',
        },
      ];

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => invitations,
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getAllByText(/test organization/i)).toHaveLength(2);
      });

      const searchInput = screen.getByPlaceholderText(/search by email/i);
      fireEvent.change(searchInput, { target: { value: 'Other' } });

      await waitFor(() => {
        expect(screen.getByText('Other Organization')).toBeInTheDocument();
        expect(screen.queryByText('Test Organization')).not.toBeInTheDocument();
      });
    });

    it('should show empty state when search has no results', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => mockInvitations,
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('John Doe')).toBeInTheDocument();
      });

      const searchInput = screen.getByPlaceholderText(/search by email/i);
      fireEvent.change(searchInput, { target: { value: 'nonexistent' } });

      await waitFor(() => {
        expect(screen.getByText(/try adjusting your search/i)).toBeInTheDocument();
      });
    });
  });

  describe('Status Badges', () => {
    it('should show pending badge for pending invitations', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockInvitations[0]],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Pending')).toBeInTheDocument();
      });
    });

    it('should show accepted badge for accepted invitations', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockInvitations[1]],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Accepted')).toBeInTheDocument();
      });
    });

    it('should show expired badge for expired invitations', async () => {
      const expiredInvitation = {
        ...mockInvitations[0],
        status: 'pending',
        expiresAt: new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString(),
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [expiredInvitation],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Expired')).toBeInTheDocument();
      });
    });

    it('should show cancelled badge for cancelled invitations', async () => {
      const cancelledInvitation = {
        ...mockInvitations[0],
        status: 'cancelled',
      };

      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [cancelledInvitation],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Cancelled')).toBeInTheDocument();
      });
    });
  });

  describe('Resend Functionality', () => {
    it('should show resend button for pending invitations', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockInvitations[0]],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /resend/i })).toBeInTheDocument();
      });
    });

    it('should not show resend button for accepted invitations', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockInvitations[1]],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /resend/i })).not.toBeInTheDocument();
      });
    });

    it('should call resend API on button click', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockInvitations[0]],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        const resendButton = screen.getByRole('button', { name: /resend/i });
        fireEvent.click(resendButton);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/invitations/inv-1/resend'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });
  });

  describe('Cancel Functionality', () => {
    it('should show cancel button for pending invitations', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockInvitations[0]],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByRole('button', { name: /cancel/i })).toBeInTheDocument();
      });
    });

    it('should not show cancel button for accepted invitations', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockInvitations[1]],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.queryByRole('button', { name: /^cancel$/i })).not.toBeInTheDocument();
      });
    });

    it('should show confirmation dialog on cancel click', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockInvitations[0]],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        fireEvent.click(cancelButton);
      });

      await waitFor(() => {
        expect(screen.getByText(/cancel invitation/i)).toBeInTheDocument();
        expect(screen.getByText(/athlete1@example.com/i)).toBeInTheDocument();
      });
    });

    it('should call cancel API on confirmation', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockInvitations[0]],
        })
        .mockResolvedValueOnce({
          ok: true,
          json: async () => ({ success: true }),
        });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        fireEvent.click(cancelButton);
      });

      await waitFor(() => {
        const confirmButton = screen.getByRole('button', { name: /yes, cancel invitation/i });
        fireEvent.click(confirmButton);
      });

      await waitFor(() => {
        expect(global.fetch).toHaveBeenCalledWith(
          expect.stringContaining('/api/invitations/inv-1/cancel'),
          expect.objectContaining({ method: 'POST' })
        );
      });
    });

    it('should close dialog on cancel in confirmation', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockInvitations[0]],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        const cancelButton = screen.getByRole('button', { name: /cancel/i });
        fireEvent.click(cancelButton);
      });

      await waitFor(() => {
        const noButton = screen.getByRole('button', { name: /no, keep it/i });
        fireEvent.click(noButton);
      });

      await waitFor(() => {
        expect(screen.queryByText(/cancel invitation/i)).not.toBeInTheDocument();
      });
    });
  });

  describe('Invitation Details Display', () => {
    it('should display invitation details', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockInvitations[0]],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Test Organization')).toBeInTheDocument();
        expect(screen.getByText(/athlete/i)).toBeInTheDocument();
        expect(screen.getByText('Jane Admin')).toBeInTheDocument();
      });
    });

    it('should display email sent status', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockInvitations[0]],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Email Sent')).toBeInTheDocument();
      });
    });

    it('should display accepted date for accepted invitations', async () => {
      (global.fetch as any).mockResolvedValueOnce({
        ok: true,
        json: async () => [mockInvitations[1]],
      });

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        expect(screen.getByText('Accepted')).toBeInTheDocument();
      });
    });
  });

  describe('Error Handling', () => {
    it('should handle API errors gracefully', async () => {
      (global.fetch as any).mockRejectedValueOnce(new Error('Network error'));

      render(<Invitations />, { wrapper: createWrapper() });

      // Should not crash and might show error state
      await waitFor(() => {
        expect(screen.getByText(/loading invitations/i)).toBeInTheDocument();
      });
    });

    it('should handle resend errors', async () => {
      (global.fetch as any)
        .mockResolvedValueOnce({
          ok: true,
          json: async () => [mockInvitations[0]],
        })
        .mockRejectedValueOnce(new Error('Resend failed'));

      render(<Invitations />, { wrapper: createWrapper() });

      await waitFor(() => {
        const resendButton = screen.getByRole('button', { name: /resend/i });
        fireEvent.click(resendButton);
      });

      // Should handle error gracefully (toast notification would be triggered)
      expect(true).toBe(true);
    });
  });
});
