import { useMemo } from 'react';
import { useTheme } from '@/providers/ThemeProvider';
import type { Colors } from './colors';

/**
 * Build a theme-aware StyleSheet. Pass a factory that takes the active palette
 * and returns a `StyleSheet.create({...})` object; it's rebuilt whenever the
 * theme flips. Lets screens keep the familiar `styles.x` pattern while still
 * reacting to light/dark at runtime.
 *
 *   const makeStyles = (c: Colors) => StyleSheet.create({ root: { backgroundColor: c.cream } });
 *   // inside the component:
 *   const styles = useThemedStyles(makeStyles);
 */
export function useThemedStyles<T>(factory: (c: Colors) => T): T {
  const { colors } = useTheme();
  return useMemo(() => factory(colors), [colors, factory]);
}
