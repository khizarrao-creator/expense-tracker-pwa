/**
 * Haptic feedback utility for mobile touch interactions using Web Vibration API.
 * Safely degrades if navigator.vibrate is not supported or permission is denied.
 */

export const haptic = {
  /** Light tap (button clicks, tab switches) */
  tap: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(10);
      } catch {}
    }
  },

  /** Selection / Toggle switch */
  selection: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate(15);
      } catch {}
    }
  },

  /** Success action (transaction saved, goal met) */
  success: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([10, 40, 20]);
      } catch {}
    }
  },

  /** Warning alert */
  warning: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([25, 50, 25]);
      } catch {}
    }
  },

  /** Error / Destructive action (delete transaction, clear db) */
  error: () => {
    if (typeof window !== 'undefined' && 'vibrate' in navigator) {
      try {
        navigator.vibrate([40, 60, 40, 60]);
      } catch {}
    }
  }
};
