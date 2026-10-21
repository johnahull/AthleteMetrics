import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useLlmExport } from '../use-llm-export';

const built = { content: '# Local report', filename: 'a-b-2024-01-01.md', mimeType: 'text/markdown' };

describe('useLlmExport', () => {
  const fetchMock = vi.fn();
  let anchors: HTMLAnchorElement[];

  beforeEach(() => {
    fetchMock.mockReset();
    fetchMock.mockResolvedValue(new Response('# Server export', { status: 200 }));
    vi.stubGlobal('fetch', fetchMock);
    anchors = [];
    window.URL.createObjectURL = vi.fn(() => 'blob:x');
    window.URL.revokeObjectURL = vi.fn();
    const create = document.createElement.bind(document);
    vi.spyOn(document, 'createElement').mockImplementation((tag: string) => {
      const el = create(tag);
      if (tag === 'a') {
        vi.spyOn(el as HTMLAnchorElement, 'click').mockImplementation(() => {});
        anchors.push(el as HTMLAnchorElement);
      }
      return el;
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
    vi.unstubAllGlobals();
  });

  function setClipboard(writeText: ((t: string) => Promise<void>) | null) {
    Object.defineProperty(navigator, 'clipboard', { value: writeText ? { writeText } : undefined, configurable: true });
    Object.defineProperty(window, 'isSecureContext', { value: true, configurable: true });
  }

  it('with buildContent, copy writes the built text and never fetches', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    const buildContent = vi.fn().mockReturnValue(built);
    const { result } = renderHook(() => useLlmExport({ athleteId: 'a1', athleteName: 'A', buildContent }));
    let r: any;
    await act(async () => { r = await result.current.copy(); });
    expect(r).toEqual({ ok: true });
    expect(buildContent).toHaveBeenCalledWith('markdown');
    expect(writeText).toHaveBeenCalledWith('# Local report');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with buildContent, copy falls back to a download using the built filename', async () => {
    setClipboard(null);
    const { result } = renderHook(() => useLlmExport({ athleteId: 'a1', buildContent: () => built }));
    let r: any;
    await act(async () => { r = await result.current.copy(); });
    expect(r).toEqual({ ok: true, clipboardFallback: true });
    expect(anchors[0].download).toBe('a-b-2024-01-01.md');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('with buildContent, download passes the format and never fetches', async () => {
    const json = { content: '{}', filename: 'a-b-2024-01-01.json', mimeType: 'application/json' };
    const buildContent = vi.fn().mockReturnValue(json);
    const { result } = renderHook(() => useLlmExport({ athleteId: 'a1', buildContent }));
    let ok = false;
    await act(async () => { ok = await result.current.download('json'); });
    expect(ok).toBe(true);
    expect(buildContent).toHaveBeenCalledWith('json');
    expect(anchors[0].download).toBe('a-b-2024-01-01.json');
    expect(fetchMock).not.toHaveBeenCalled();
  });

  it('reports a buildContent error through onError', async () => {
    const onError = vi.fn();
    const { result } = renderHook(() =>
      useLlmExport({ athleteId: 'a1', onError, buildContent: () => { throw new Error('boom'); } }),
    );
    let r: any;
    await act(async () => { r = await result.current.copy(); });
    expect(r).toEqual({ ok: false });
    expect(onError).toHaveBeenCalledWith(expect.objectContaining({ message: 'boom' }));
  });

  it('without buildContent, still fetches the athlete export', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    setClipboard(writeText);
    const { result } = renderHook(() => useLlmExport({ athleteId: 'a1' }));
    await act(async () => { await result.current.copy(); });
    expect(fetchMock).toHaveBeenCalledWith('/api/athletes/a1/llm-export?format=markdown', expect.anything());
    expect(writeText).toHaveBeenCalledWith('# Server export');
  });
});
