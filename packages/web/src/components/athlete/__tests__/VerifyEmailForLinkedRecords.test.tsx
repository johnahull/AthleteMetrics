import React from 'react';
import { describe, it, expect, vi } from 'vitest';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const apiRequest = vi.hoisted(() => vi.fn());
vi.mock('@/lib/queryClient', () => ({ apiRequest }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: vi.fn() }) }));

import { VerifyEmailForLinkedRecords } from '../VerifyEmailForLinkedRecords';

describe('VerifyEmailForLinkedRecords', () => {
  it('asks the server to email the signed-in account its own address, with no address of its own choosing', async () => {
    apiRequest.mockResolvedValue({ json: async () => ({ success: true }) });
    render(
      <QueryClientProvider client={new QueryClient()}>
        <VerifyEmailForLinkedRecords />
      </QueryClientProvider>
    );

    await userEvent.click(screen.getByRole('button', { name: /verify your email to restore linked records/i }));

    expect(apiRequest).toHaveBeenCalledWith('POST', '/api/enhanced-auth/request-email-verification', {});
    await waitFor(() => expect(screen.getByRole('button', { name: /email sent/i })).toBeDisabled());
  });
});
