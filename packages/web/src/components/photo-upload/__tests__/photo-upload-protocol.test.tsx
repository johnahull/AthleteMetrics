/**
 * AM-FEAT-016 step 4: required, no-default "5-0-5 protocol" choice on the photo upload form.
 */
import React from 'react';
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { render, screen, fireEvent, waitFor, within, cleanup } from '@testing-library/react';
import '@testing-library/jest-dom';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { PhotoUpload } from '../../photo-upload';
import { OCRResults } from '../ocr-results';

vi.mock('@/lib/auth', () => ({
  useAuth: () => ({ userOrganizations: [{ organizationId: 'org-1' }] }),
}));
vi.mock('@/hooks/use-metric-labels', () => ({
  useMetricLabels: () => ({ getLabel: (c: string) => c, labels: {}, isLoading: false }),
}));

const PROTOCOL_MSG = 'Choose meters or yards for 5-0-5 readings';

function successResponse() {
  return {
    success: true,
    message: 'OCR processing completed',
    results: {
      totalExtracted: 2,
      successful: 1,
      failed: 1,
      ocrConfidence: 90,
      extractedText: 'John Smith vertical 30.5',
      processedData: [
        {
          measurement: { metric: 'VERTICAL_JUMP', value: '30.5', date: '2026-01-01' },
          athlete: 'John Smith',
          rawText: 'John Smith vertical 30.5',
          confidence: 90,
        },
      ],
      errors: [{ row: 2, error: 'Athlete not found: Jane Doe', data: { rawText: 'Jane Doe 5-0-5 2.45' } }],
      warnings: [],
    },
  };
}

function ok(body: unknown) {
  return { ok: true, status: 200, statusText: 'OK', json: async () => body };
}

function protocolRequired422() {
  return {
    ok: false,
    status: 422,
    statusText: 'Unprocessable Entity',
    json: async () => ({ message: PROTOCOL_MSG, code: 'PROTOCOL_505_REQUIRED' }),
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

function selectFile(container: HTMLElement, name = 'sheet.png') {
  const input = container.querySelector('input[type="file"]') as HTMLInputElement;
  const file = new File(['x'], name, { type: 'image/png' });
  fireEvent.change(input, { target: { files: [file] } });
}

function sentOptions(call: number) {
  const fetchMock = globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
  const body = fetchMock.mock.calls[call][1].body as FormData;
  return JSON.parse(body.get('options') as string);
}

const UPLOAD = /extract & import data/i;

function fetchMock() {
  return globalThis.fetch as unknown as ReturnType<typeof vi.fn>;
}

describe('PhotoUpload 5-0-5 protocol', () => {
  beforeEach(() => {
    globalThis.fetch = vi.fn().mockResolvedValue(ok(successResponse())) as any;
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

  it('keeps Upload enabled with no protocol and does not send protocol505', async () => {
    const { container } = renderForm();
    selectFile(container);
    const upload = screen.getByRole('button', { name: UPLOAD });
    expect(upload).toBeEnabled();
    fireEvent.click(upload);
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(sentOptions(0)).not.toHaveProperty('protocol505');
  });

  it('sends protocol505 once a choice is made', async () => {
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('radio', { name: /yards/i }));
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(sentOptions(0).protocol505).toBe('YD');
  });

  it('selecting a new file resets the choice: protocol505 is not sent for file B', async () => {
    const { container } = renderForm();
    selectFile(container, 'a.png');
    fireEvent.click(screen.getByRole('radio', { name: /yards/i }));
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(1), { timeout: 5000 });
    expect(sentOptions(0).protocol505).toBe('YD');
    await screen.findByText('OCR Results', {}, { timeout: 5000 });

    selectFile(container, 'b.png');
    expect(screen.getByRole('radio', { name: /yards/i })).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(sentOptions(1)).not.toHaveProperty('protocol505');
  });

  it('Clear resets the choice', () => {
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('radio', { name: /meters/i }));
    expect(screen.getByRole('radio', { name: /meters/i })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: /clear/i }));
    expect(screen.getByRole('radio', { name: /meters/i })).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByRole('radio', { name: /yards/i })).toHaveAttribute('aria-checked', 'false');
  });

  it('a 422 shows an inline alert tied to the picker, focuses it, keeps file and Upload, no results card', async () => {
    fetchMock().mockResolvedValueOnce(protocolRequired422());
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));

    const alert = await screen.findByRole('alert', {}, { timeout: 5000 });
    expect(alert).toHaveTextContent(PROTOCOL_MSG);
    expect(alert).toHaveTextContent(/nothing was saved/i);

    const group = screen.getByRole('radiogroup', { name: /5-0-5 protocol/i });
    expect(group).toHaveAttribute('aria-describedby', alert.id);
    await waitFor(() => expect(group.contains(document.activeElement)).toBe(true));

    expect(screen.queryByText('OCR Results')).toBeNull();
    expect(screen.getByRole('button', { name: UPLOAD })).toBeEnabled();
    expect(screen.getByText('sheet.png')).toBeInTheDocument();
  });

  it('retry after a 422 sends the same file with the chosen protocol, then clears the file', async () => {
    fetchMock().mockResolvedValueOnce(protocolRequired422());
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    await screen.findByRole('alert', {}, { timeout: 5000 });

    fireEvent.click(screen.getByRole('radio', { name: /meters/i }));
    // the choice survives the retry of the same file
    expect(screen.getByRole('radio', { name: /meters/i })).toHaveAttribute('aria-checked', 'true');
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));

    await waitFor(() => expect(fetchMock()).toHaveBeenCalledTimes(2), { timeout: 5000 });
    expect(sentOptions(1).protocol505).toBe('M');
    const second = fetchMock().mock.calls[1][1].body as FormData;
    expect((second.get('file') as File).name).toBe('sheet.png');

    expect(await screen.findByText('OCR Results', {}, { timeout: 5000 })).toBeInTheDocument();
    expect(screen.queryByRole('alert', { name: /5-0-5/ })).toBeNull();
    // successful import clears the selected file so it cannot be re-imported by accident
    await waitFor(() => expect(screen.getByRole('button', { name: UPLOAD })).toBeDisabled());
  });

  it('a successful import clears the selected file', async () => {
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    expect(await screen.findByText('OCR Results', {}, { timeout: 5000 })).toBeInTheDocument();
    await waitFor(() => expect(screen.getByRole('button', { name: UPLOAD })).toBeDisabled());
    expect(screen.queryByText('sheet.png')).toBeNull();
  });

  it('never tells the user not to upload again or offers a partial-import retry', async () => {
    const { container } = renderForm();
    selectFile(container);
    fireEvent.click(screen.getByRole('button', { name: UPLOAD }));
    await screen.findByText('OCR Results', {}, { timeout: 5000 });
    expect(screen.queryByText(/do not upload/i)).toBeNull();
    expect(screen.queryByText(/already imported/i)).toBeNull();
    expect(screen.queryByRole('button', { name: /retry with selection/i })).toBeNull();
  });

  it('OCRResults has no partial-import dead end, even for a legacy protocol error row', () => {
    const base = successResponse();
    const result = {
      ...base,
      results: {
        ...base.results,
        errors: [{ row: 2, error: PROTOCOL_MSG, code: 'PROTOCOL_505_REQUIRED', data: { rawText: 'x' } }],
      },
    };
    render(<OCRResults result={result as any} />);
    expect(screen.queryByText(/do not upload/i)).toBeNull();
    expect(screen.queryByText(/5-0-5 protocol needed/i)).toBeNull();
  });
});
