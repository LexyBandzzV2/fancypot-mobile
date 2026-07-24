import { useWindowDimensions } from 'react-native';
import { spacing } from '@/theme';

/**
 * Responsive breakpoint helper for phone vs. iPad layouts.
 *
 * The app was built phone-first. On a large iPad (esp. the 13" / 12.9" Pro at
 * 1024×1366pt) the phone layout stretches edge-to-edge and grids blow up to a
 * couple of huge tiles. This hook is the single source of truth for adapting:
 * screens read `isTablet` / `columns` / `contentMaxWidth` from here rather than
 * hard-coding `Dimensions.get('window')` at module load (which also never
 * reacts to rotation or multitasking split-view resizes).
 *
 * Breakpoints are width-based so they follow orientation AND iPad split-view:
 *  - phone:        width <  700  (all iPhones, plus a narrow split-view slice)
 *  - tablet:       width >= 700  (iPad portrait and up)
 *  - large tablet: width >= 1000 (13"/12.9" iPad portrait, any iPad landscape)
 */
export interface Responsive {
  width: number;
  height: number;
  /** width >= 700 — the phone layout should start adapting past this. */
  isTablet: boolean;
  /** width >= 1000 — roomy enough for the widest grids / two-pane feels. */
  isLargeTablet: boolean;
  /** Landscape orientation (width > height). */
  isLandscape: boolean;
  /** Sensible default column count for tile grids: 2 phone / 3 tablet / 4 large. */
  columns: number;
  /**
   * Max width for centered single-column content (forms, feed, detail, auth).
   * On phone this is the full width (no cap); on tablet it caps so text lines
   * and cards don't span an uncomfortably wide measure. Pair with
   * `<ResponsiveContent>` which centers to this by default.
   */
  contentMaxWidth: number;
  /** Horizontal page gutter — grows a little on tablet so content breathes. */
  gutter: number;
}

export const TABLET_MIN_WIDTH = 700;
export const LARGE_TABLET_MIN_WIDTH = 1000;

export function useResponsive(): Responsive {
  const { width, height } = useWindowDimensions();
  const isTablet = width >= TABLET_MIN_WIDTH;
  const isLargeTablet = width >= LARGE_TABLET_MIN_WIDTH;

  return {
    width,
    height,
    isTablet,
    isLargeTablet,
    isLandscape: width > height,
    columns: isLargeTablet ? 4 : isTablet ? 3 : 2,
    contentMaxWidth: isLargeTablet ? 960 : isTablet ? 760 : width,
    gutter: isLargeTablet ? spacing.xxl : isTablet ? spacing.xl : spacing.lg,
  };
}
