import { useEffect, useState } from 'react';
import { AccessibilityInfo } from 'react-native';

/**
 * True when the OS-level "reduce motion" accessibility setting is on.
 * Animated components should collapse decorative motion (slides, springs,
 * shimmer sweeps) to instant/opacity-only transitions when this is set.
 * Defaults to false until the async check resolves — motion-first, then
 * corrects, which avoids a visible pop for the overwhelming majority of users.
 */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled()
      .then((v) => {
        if (mounted) setReduced(v);
      })
      .catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', (v) => {
      setReduced(v);
    });
    return () => {
      mounted = false;
      sub.remove();
    };
  }, []);

  return reduced;
}
