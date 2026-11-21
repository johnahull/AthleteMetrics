import { describe, it, expect, vi, afterEach } from 'vitest';
import { createCustomOrgMetric, updateCustomOrgMetric } from '../custom-metrics-api';

afterEach(() => vi.unstubAllGlobals());

const failWith = (body: unknown) =>
  vi.stubGlobal('fetch', vi.fn(async () => ({ ok: false, json: async () => body }) as any));

describe('custom metric API errors', () => {
  const body = { error: 'Validation failed', details: { meaning: ['Meaning text must not contain injury or pain wording.'] } };

  it('create appends field messages from details', async () => {
    failWith(body);
    await expect(createCustomOrgMetric('o', { label: 'x' } as any)).rejects.toThrow(/Validation failed: Meaning text must not contain injury/);
  });

  it('update appends field messages, and works without details', async () => {
    failWith(body);
    await expect(updateCustomOrgMetric('o', 'C', {})).rejects.toThrow(/must not contain injury/);
    failWith({ error: 'Not found' });
    await expect(updateCustomOrgMetric('o', 'C', {})).rejects.toThrow(/^Not found$/);
  });

  it('separates several field messages with semicolons', async () => {
    const two = { error: 'Validation failed', details: { meaning: ['A.'], label: ['B.'] } };
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: false, status: 400, json: async () => two }));
    await expect(createCustomOrgMetric('o', { label: 'x' } as any)).rejects.toThrow('Validation failed: A.; B.');
  });
});
