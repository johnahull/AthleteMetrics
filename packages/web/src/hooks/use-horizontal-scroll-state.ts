import { useCallback, useEffect, useState } from "react";

interface HorizontalScrollState {
  hasOverflow: boolean;
  canScrollLeft: boolean;
  canScrollRight: boolean;
}

/** One grid metric column: kept as overlap between pages, and the least a page scrolls */
const SCROLL_COLUMN_PX = 104;

const NO_OVERFLOW: HorizontalScrollState = { hasOverflow: false, canScrollLeft: false, canScrollRight: false };

/**
 * Tracks whether a horizontal scroller can scroll further left or right, so the
 * page can show edge fades and a "scroll sideways" hint that do not depend on the
 * OS scrollbar (overlay scrollbars stay hidden until the user scrolls).
 *
 * Returns a callback ref for the scroller; it re-checks on scroll and when the
 * scroller or its first child (the table) is resized. scrollByPage scrolls by the
 * visible width less `reservedPx` (a pinned column) and one column of overlap.
 */
export function useHorizontalScrollState() {
  const [node, setNode] = useState<HTMLElement | null>(null);
  const [state, setState] = useState<HorizontalScrollState>(NO_OVERFLOW);

  useEffect(() => {
    if (!node) {
      setState(NO_OVERFLOW);
      return;
    }

    const update = () => {
      const maxScroll = node.scrollWidth - node.clientWidth;
      const next = {
        // > 1, not > 0: a 1px fractional-rounding overflow is not worth showing the hint for
        hasOverflow: maxScroll > 1,
        canScrollLeft: node.scrollLeft > 1,
        canScrollRight: node.scrollLeft < maxScroll - 1,
      };
      setState((prev) =>
        prev.hasOverflow === next.hasOverflow &&
        prev.canScrollLeft === next.canScrollLeft &&
        prev.canScrollRight === next.canScrollRight
          ? prev
          : next
      );
    };

    update();
    node.addEventListener("scroll", update, { passive: true });

    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== "undefined") {
      observer = new ResizeObserver(update);
      observer.observe(node);
      // The scroller's first element child must be the table (TooltipProvider renders no DOM element)
      if (node.firstElementChild) observer.observe(node.firstElementChild);
    }

    return () => {
      node.removeEventListener("scroll", update);
      observer?.disconnect();
    };
  }, [node]);

  const scrollByPage = useCallback(
    (direction: -1 | 1, reservedPx = 0) => {
      if (!node) return;
      const reduceMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
      node.scrollBy({
        left: direction * Math.max(SCROLL_COLUMN_PX, node.clientWidth - reservedPx - SCROLL_COLUMN_PX),
        behavior: reduceMotion ? "auto" : "smooth",
      });
    },
    [node]
  );

  return { ref: setNode, scrollByPage, ...state };
}
