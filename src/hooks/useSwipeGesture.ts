import { useRef, useCallback } from 'react';

export interface SwipeHandlers {
  onTouchStart: (e: React.TouchEvent) => void;
  onTouchMove: (e: React.TouchEvent) => void;
  onTouchEnd: (e: React.TouchEvent) => void;
}

interface UseSwipeOptions {
  /** Minimum horizontal distance (px) to register a swipe. Default 80 */
  threshold?: number;
  /** Called when user swipes left beyond threshold */
  onSwipeLeft?: () => void;
  /** Called when user swipes right beyond threshold */
  onSwipeRight?: () => void;
  /** Called with current delta-X during move for live transform feedback */
  onMove?: (deltaX: number) => void;
  /** Called when swipe ends without reaching threshold (snap back) */
  onReset?: () => void;
  /** Max vertical delta to still consider it a horizontal swipe. Default 60 */
  maxVertical?: number;
}

/**
 * Hook for detecting horizontal swipe gestures on a touch element.
 * Returns event handlers to spread onto the target element.
 *
 * Usage:
 * ```tsx
 * const swipe = useSwipeGesture({
 *   onSwipeLeft: () => handleDelete(item.id),
 *   onMove: (dx) => setTranslateX(dx),
 *   onReset: () => setTranslateX(0),
 * });
 * <div {...swipe} style={{ transform: `translateX(${translateX}px)` }}>
 * ```
 */
export function useSwipeGesture(options: UseSwipeOptions): SwipeHandlers {
  const {
    threshold = 80,
    onSwipeLeft,
    onSwipeRight,
    onMove,
    onReset,
    maxVertical = 60,
  } = options;

  const startX = useRef(0);
  const startY = useRef(0);
  const swiping = useRef(false);

  const onTouchStart = useCallback((e: React.TouchEvent) => {
    const touch = e.touches[0];
    startX.current = touch.clientX;
    startY.current = touch.clientY;
    swiping.current = true;
  }, []);

  const onTouchMove = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return;
    const touch = e.touches[0];
    const deltaX = touch.clientX - startX.current;
    const deltaY = Math.abs(touch.clientY - startY.current);

    // If vertical movement exceeds threshold, cancel swipe detection
    if (deltaY > maxVertical) {
      swiping.current = false;
      onReset?.();
      return;
    }

    onMove?.(deltaX);
  }, [maxVertical, onMove, onReset]);

  const onTouchEnd = useCallback((e: React.TouchEvent) => {
    if (!swiping.current) return;
    swiping.current = false;

    const touch = e.changedTouches[0];
    const deltaX = touch.clientX - startX.current;

    if (deltaX < -threshold) {
      onSwipeLeft?.();
    } else if (deltaX > threshold) {
      onSwipeRight?.();
    } else {
      onReset?.();
    }
  }, [threshold, onSwipeLeft, onSwipeRight, onReset]);

  return { onTouchStart, onTouchMove, onTouchEnd };
}
