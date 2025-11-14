import { useState, useEffect } from 'react';

export function useMediaQuery(query: string): boolean {
  const [matches, setMatches] = useState(false);

  useEffect(() => {
    const media = window.matchMedia(query);

    // Always sync on mount or query change
    setMatches(media.matches);

    const listener = (e: MediaQueryListEvent) => setMatches(e.matches);

    // Modern browsers
    if (media.addEventListener) {
      media.addEventListener('change', listener);
      return () => media.removeEventListener('change', listener);
    }
    // Fallback for older browsers
    else {
      media.addListener(listener);
      return () => media.removeListener(listener);
    }
  }, [query]); // Remove matches from dependencies to prevent infinite loop

  return matches;
}
