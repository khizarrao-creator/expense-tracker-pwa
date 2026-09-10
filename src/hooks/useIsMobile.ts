import { useState, useEffect } from 'react';

/**
 * Detects whether the current viewport is considered "mobile".
 * Uses matchMedia for real-time updates without polling.
 * 
 * @param breakpoint - Max width in px to be considered mobile (default 768)
 * @returns boolean — true if viewport width ≤ breakpoint
 */
export function useIsMobile(breakpoint = 768): boolean {
  const [isMobile, setIsMobile] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia(`(max-width: ${breakpoint}px)`).matches;
  });

  useEffect(() => {
    const mql = window.matchMedia(`(max-width: ${breakpoint}px)`);
    const handler = (e: MediaQueryListEvent) => setIsMobile(e.matches);
    mql.addEventListener('change', handler);
    // Sync initial value
    setIsMobile(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, [breakpoint]);

  return isMobile;
}

/**
 * Detects whether the device has touch capabilities (no hover).
 * Useful for showing/hiding hover-only UI elements.
 */
export function useIsTouch(): boolean {
  const [isTouch, setIsTouch] = useState(() => {
    if (typeof window === 'undefined') return false;
    return window.matchMedia('(hover: none)').matches;
  });

  useEffect(() => {
    const mql = window.matchMedia('(hover: none)');
    const handler = (e: MediaQueryListEvent) => setIsTouch(e.matches);
    mql.addEventListener('change', handler);
    setIsTouch(mql.matches);
    return () => mql.removeEventListener('change', handler);
  }, []);

  return isTouch;
}
