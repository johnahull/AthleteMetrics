/**
 * useHorizontalScrollState: can a horizontal scroller scroll further left / right?
 * Drives the edge fades and the "scroll sideways" hint on the event data-entry grid.
 * happy-dom has no layout, so the sizes are stubbed and ResizeObserver is mocked.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { renderHook, act } from '@testing-library/react';
import { useHorizontalScrollState } from '../use-horizontal-scroll-state';

let resizeCallbacks: Array<() => void>;
const observe = vi.fn();
const disconnect = vi.fn();

class MockResizeObserver {
  constructor(cb: () => void) {
    resizeCallbacks.push(cb);
  }
  observe = observe;
  unobserve = vi.fn();
  disconnect = disconnect;
}

function scroller({ scrollWidth, clientWidth, scrollLeft = 0 }: { scrollWidth: number; clientWidth: number; scrollLeft?: number }) {
  const el = document.createElement('div');
  el.appendChild(document.createElement('table'));
  Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => scrollWidth });
  Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => clientWidth });
  el.scrollLeft = scrollLeft;
  return el;
}

function attach(el: HTMLElement) {
  const hook = renderHook(() => useHorizontalScrollState());
  act(() => hook.result.current.ref(el));
  return hook;
}

beforeEach(() => {
  resizeCallbacks = [];
  observe.mockClear();
  disconnect.mockClear();
  vi.stubGlobal('ResizeObserver', MockResizeObserver);
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('useHorizontalScrollState', () => {
  it('reports no overflow before a scroller is attached', () => {
    const { result } = renderHook(() => useHorizontalScrollState());
    expect(result.current).toMatchObject({ hasOverflow: false, canScrollLeft: false, canScrollRight: false });
  });

  it('reports no overflow when the content fits', () => {
    const { result } = attach(scroller({ scrollWidth: 500, clientWidth: 500 }));
    expect(result.current).toMatchObject({ hasOverflow: false, canScrollLeft: false, canScrollRight: false });
  });

  it('at the start it can scroll right only', () => {
    const { result } = attach(scroller({ scrollWidth: 1200, clientWidth: 500 }));
    expect(result.current).toMatchObject({ hasOverflow: true, canScrollLeft: false, canScrollRight: true });
  });

  it('updates on scroll: middle can scroll both ways, the end only left', () => {
    const el = scroller({ scrollWidth: 1200, clientWidth: 500 });
    const { result } = attach(el);

    act(() => {
      el.scrollLeft = 300;
      el.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toMatchObject({ canScrollLeft: true, canScrollRight: true });

    act(() => {
      el.scrollLeft = 700;
      el.dispatchEvent(new Event('scroll'));
    });
    expect(result.current).toMatchObject({ canScrollLeft: true, canScrollRight: false });
  });

  it('treats a sub-pixel remainder at the end as the end', () => {
    const { result } = attach(scroller({ scrollWidth: 1200, clientWidth: 500, scrollLeft: 699.5 }));
    expect(result.current.canScrollRight).toBe(false);
  });

  it('re-checks when the scroller or its table is resized', () => {
    let clientWidth = 500;
    const el = document.createElement('div');
    const table = document.createElement('table');
    el.appendChild(table);
    Object.defineProperty(el, 'scrollWidth', { configurable: true, get: () => 1200 });
    Object.defineProperty(el, 'clientWidth', { configurable: true, get: () => clientWidth });
    const { result } = attach(el);
    expect(observe).toHaveBeenCalledWith(el);
    expect(observe).toHaveBeenCalledWith(table);
    expect(result.current.hasOverflow).toBe(true);

    clientWidth = 1200;
    act(() => resizeCallbacks.forEach((cb) => cb()));
    expect(result.current).toMatchObject({ hasOverflow: false, canScrollRight: false });
  });

  it('works without ResizeObserver and cleans up on unmount', () => {
    vi.stubGlobal('ResizeObserver', undefined);
    const el = scroller({ scrollWidth: 1200, clientWidth: 500 });
    const remove = vi.spyOn(el, 'removeEventListener');
    const { result, unmount } = attach(el);
    expect(result.current.canScrollRight).toBe(true);
    unmount();
    expect(remove).toHaveBeenCalledWith('scroll', expect.any(Function));
  });

  it('disconnects the observer on unmount', () => {
    const { unmount } = attach(scroller({ scrollWidth: 1200, clientWidth: 500 }));
    unmount();
    expect(disconnect).toHaveBeenCalled();
  });

  describe('scrollByPage', () => {
    const scrollBy = vi.fn();
    beforeEach(() => {
      scrollBy.mockClear();
      (Element.prototype as any).scrollBy = scrollBy;
    });
    afterEach(() => {
      delete (Element.prototype as any).scrollBy;
    });

    it('scrolls one visible page minus the reserved width and one column of overlap, smoothly', () => {
      vi.stubGlobal('matchMedia', () => ({ matches: false }));
      const { result } = attach(scroller({ scrollWidth: 1200, clientWidth: 600 }));
      act(() => result.current.scrollByPage(1, 176));
      expect(scrollBy).toHaveBeenCalledWith({ left: 600 - 176 - 104, behavior: 'smooth' });
      act(() => result.current.scrollByPage(-1, 176));
      expect(scrollBy).toHaveBeenLastCalledWith({ left: -(600 - 176 - 104), behavior: 'smooth' });
    });

    it('scrolls at least one column on a narrow scroller', () => {
      vi.stubGlobal('matchMedia', () => ({ matches: false }));
      const { result } = attach(scroller({ scrollWidth: 1200, clientWidth: 300 }));
      act(() => result.current.scrollByPage(1, 176));
      expect(scrollBy).toHaveBeenCalledWith({ left: 104, behavior: 'smooth' });
    });

    it('jumps without animation when the user prefers reduced motion', () => {
      vi.stubGlobal('matchMedia', (q: string) => ({ matches: q === '(prefers-reduced-motion: reduce)' }));
      const { result } = attach(scroller({ scrollWidth: 1200, clientWidth: 600 }));
      act(() => result.current.scrollByPage(1));
      expect(scrollBy).toHaveBeenCalledWith({ left: 600 - 104, behavior: 'auto' });
    });

    it('works without matchMedia and does nothing before a scroller is attached', () => {
      vi.stubGlobal('matchMedia', undefined);
      const detached = renderHook(() => useHorizontalScrollState());
      act(() => detached.result.current.scrollByPage(1));
      expect(scrollBy).not.toHaveBeenCalled();
      const { result } = attach(scroller({ scrollWidth: 1200, clientWidth: 600 }));
      act(() => result.current.scrollByPage(1));
      expect(scrollBy).toHaveBeenCalledWith({ left: 600 - 104, behavior: 'smooth' });
    });
  });
});
