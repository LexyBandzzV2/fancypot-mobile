/**
 * Fancy Pot brand palette.
 *
 * The web app (closet-conjurer-app) defines its palette in oklch inside
 * src/styles.css. React Native's StyleSheet does not understand oklch, so the
 * values below are faithful sRGB/hex conversions of those same tokens. Keep
 * these in sync with the web `@theme` block if the brand ever shifts.
 */
export const colors = {
  // Neutrals / surfaces
  cream: '#FAF3E7', // --cream, also the native splash + status bar color
  pearl: '#F7F3EC', // --pearl
  beige: '#E7D9C3', // --beige
  tissue: '#F8E4E1', // --tissue (AP wrapping pink)

  // Blush accents
  blush: '#F2C9C4', // --blush
  blushDeep: '#D69B93', // --blush-deep (primary accent / active states)

  // Warm pink ("Mean Girls" accent — hero CTAs, highlights)
  pinkWarm: '#FF73B6', // --pink-warm (also PWA theme_color)
  pinkWarmSoft: '#F7A9C4', // --pink-warm-soft
  pinkWarmGlow: '#FBD3E0', // --pink-warm-glow

  // Text / ink
  ink: '#241E1C', // --ink (primary text + primary button fill)
  onyx: '#1A1614', // --onyx (deepest)
  inkMuted: '#6E625C', // muted body text

  // Utility
  white: '#FFFFFF',
  border: '#E7DCCB', // hairline on cream
  borderStrong: '#D8C9B2',
  overlay: 'rgba(26, 22, 20, 0.45)',
  success: '#3F8A5B',
  danger: '#C4553F',
  danger_soft: '#F4D9D2',
} as const;

/**
 * Semantic aliases so screens read intent, not raw swatches.
 */
export const semantic = {
  background: colors.cream,
  surface: colors.white,
  surfaceMuted: colors.pearl,
  textPrimary: colors.ink,
  textSecondary: colors.inkMuted,
  primary: colors.ink, // primary buttons are ink-on-cream per web
  primaryText: colors.cream,
  accent: colors.pinkWarm,
  accentSoft: colors.pinkWarmGlow,
  border: colors.border,
  ring: colors.blushDeep,
} as const;

export type ColorName = keyof typeof colors;
