/**
 * AM-FEAT-016 step 4: required, no-default "5-0-5 protocol" choice on the photo upload form.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhotoUpload } from '../../photo-upload';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ userOrganizations: [{ organizationId: 'org-1' }] }),
}));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ getLabel: (c: string) => c, labels: {}, isLoading: false }),
}));

const PROTOCOL_MSG = 'Choose meters or yards for 5-0-5 readings';

function protocolErrorResponse() {
  return {
    success: true,
    message: 'OCR processing completed',
    results: {
      totalExtracted: 1,
      successful: 0,
      failed: 1,
      ocrConfidence: 90,
      extractedText: 'John Smith 5-0-5 2.45',
      processedData: [],
      errors: [
        {
          row: 1,
          error: PROTOCOL_MSG,
          code: 'PROTOCOL_505_REQUIRED',
          data: { rawText: 'John Smith 5-0-5 2.45' },
        },
      ],
      warnings: [],
    },
  };
}

function renderForm() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <PhotoUpload />
    </QueryClientProvider>,
  );
}

function selectFile(container: HTMLElement) {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], 'sheet.png', { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
}

function sentOptions(call: number) {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const body = fetchMock.mock.calls[call][1].body as FormData;
  return JSON.parse(body.get('options') as string);
}

describe('PhotoUpload 5-0-5 protocol', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue({
      ok: true,
      json: async () => protocolErrorResponse(),
    }) as any;
  });
  afterEach(() => cleanup());

  it('renders a labelled fieldset radio group with nothing selected', () => {
    renderForm();
    const group = screen.getByRole('radiogroup', { name: /5-0-5 protocol/i });
    expect(group.closest('fieldset')).not.toBeNull();
    const meters = within(group).getByRole('radio', { name: /meters/i });
    const yards = within(group).getByRole('radio', { name: /yards/i });
    expect(meters).toHaveAttribute('aria-checked', 'false');
    expect(yards).toHaveAttribute('aria-checked', 'false');
    expect(group).toHaveAttribute('aria-required', 'true');
  });

  it('does not send protocol505 before a choice is made', async () => {
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('button', { name: /extract & import data/i }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(sentOptions(0)).not.toHaveProperty('protocol505');
  });

  it('sends protocol505 once a choice is made', async () => {
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('radio', { name: /yards/i }));
    fireEvent.click(screen.getByRole('button', { name: /extract & import data/i }));
    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(sentOptions(0).protocol505).toBe('YD');
  });

  it('shows the protocol error and retries with the file still held, no re-upload', async () => {
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('button', { name: /extract & import data/i }));

    expect(await screen.findByText(PROTOCOL_MSG, {}, { timeout: 5000 })).toBeInTheDocument();

    const retry = screen.getByRole('button', { name: /retry with selection/i });
    expect(retry).toBeDisabled();

    fireEvent.click(screen.getByRole('radio', { name: /meters/i }));
    expect(retry).toBeEnabled();
    fireEvent.click(retry);

    await waitFor(() => expect(globalThis.fetch).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(sentOptions(1).protocol505).toBe('M');
    const second = (globalThis.fetch as any).mock.calls[1][1].body as FormData;
    expect((second.get('file') as File).name).toBe('sheet.png');
  });
});
