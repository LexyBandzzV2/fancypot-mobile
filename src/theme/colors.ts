/**
 * Fancy Pot brand palette — now theme-aware (light + dark).
 *
 * The web app (closet-conjurer-app) defines its palette in oklch inside
 * src/styles.css. React Native's StyleSheet does not understand oklch, so the
 * values below are faithful sRGB/hex conversions of those same tokens. Keep
 * these in sync with the web `@theme` block if the brand ever shifts.
 *
 * DARK MODE: the dark palette keeps the exact same brand DNA — the warm pink
 * "mean girl" accents (`pinkWarm`, `blush`), the Cormorant/Pinyon type, the
 * soft rounded surfaces — but swaps the cream paper for a deep warm plum-black
 * so the pink pops instead of washing out. Every key exists in BOTH palettes
 * with the SAME semantic ROLE (e.g. `cream` is always "the app background",
 * `ink` is always "primary text/fill", `white` is always "a raised surface"),
 * so components can keep referencing brand names and still flip correctly.
 */

/** Shape of a full palette. Both light and dark palettes implement this with
 * plain (widened) `string` types — using `typeof lightColors` here would lock
 * every key to its light-mode literal value and make `darkColors` fail to
 * typecheck, since e.g. `cream` would be typed as the literal `'#FAF3E7'`. */
export interface Colors {
  cream: string;
  pearl: string;
  beige: string;
  tissue: string;
  blush: string;
  blushDeep: string;
  pinkWarm: string;
  pinkWarmSoft: string;
  pinkWarmGlow: string;
  ink: string;
  onyx: string;
  inkMuted: string;
  white: string;
  border: string;
  borderStrong: string;
  overlay: string;
  /** Darker backdrop for sheets/drawers — needs more contrast than `overlay`. */
  scrim: string;
  success: string;
  /** Soft success surface (confirmation banners). */
  successSoft: string;
  danger: string;
  danger_soft: string;
  glassTint: 'light' | 'dark';
  glassScrim: string;
  glassEdge: string;
  glassFill: string;
}

// ---- LIGHT (the design-board palette: pearl white / blush pink / rich black) ----
export const lightColors: Colors = {
  // Neutrals / surfaces — pink-white, not beige (board bg)
  cream: '#FDF4F6', // app background (also native splash + status bar)
  pearl: '#F8ECF0', // muted surface
  beige: '#F0DCD4', // champagne warmth
  tissue: '#FBE3EC', // wrapping pink

  // Blush accents
  blush: '#F6C6D8',
  blushDeep: '#DE8BA9', // primary accent / active states — rosy, not terracotta

  // Warm pink ("Mean Girls" accent — hero CTAs, highlights)
  pinkWarm: '#F9539B', // board hot pink; also PWA theme_color
  pinkWarmSoft: '#FBA8CC',
  pinkWarmGlow: '#FDE0EC',

  // Text / ink — rich near-black (board), not warm brown
  ink: '#1C1518', // primary text + primary button fill
  onyx: '#100B0D', // deepest
  inkMuted: '#77626C', // muted body text (mauve-gray)

  // Utility
  white: '#FFFFFF', // a raised surface
  border: '#F2DCE4', // hairline on pink-white
  borderStrong: '#E5C3D1',
  overlay: 'rgba(28, 21, 24, 0.45)',
  scrim: 'rgba(0, 0, 0, 0.55)',
  success: '#3F8A5B',
  successSoft: '#E7F2EA',
  danger: '#C4553F',
  danger_soft: '#F6DCD8',

  // Glass tokens (frosted surfaces) — see components/Glass.tsx
  glassTint: 'light',
  glassScrim: 'rgba(253, 244, 246, 0.55)', // bg @ 55% — frosted fallback
  glassEdge: 'rgba(255, 255, 255, 0.55)', // top highlight on a glass edge
  glassFill: 'rgba(255, 255, 255, 0.60)', // translucent card body
};

// ---- DARK (same brand DNA on a deep warm plum-black) ----
export const darkColors: Colors = {
  // Neutrals / surfaces — warm, slightly plum-tinted blacks (never flat gray)
  cream: '#161012', // app background
  pearl: '#1E161A', // muted surface
  beige: '#2A2026',
  tissue: '#2E1F27', // deep wrapping-pink tint

  // Blush accents (kept vivid so the aesthetic survives on dark)
  blush: '#E7A9B7',
  blushDeep: '#E29AA6', // active states read brighter on dark

  // Warm pink — the hero accent, unchanged so branding is identical
  pinkWarm: '#F9539B',
  pinkWarmSoft: '#FBA8CC',
  pinkWarmGlow: '#3A2230', // on dark this becomes a soft pink-tinted glow surface

  // Text / ink — warm off-whites, not pure white
  ink: '#F7ECEF', // primary text / primary fill (inverts on dark)
  onyx: '#FFFFFF',
  inkMuted: '#B6A5AC', // muted body text

  // Utility
  white: '#241C21', // a raised surface (dark card)
  border: 'rgba(255, 255, 255, 0.10)',
  borderStrong: 'rgba(255, 255, 255, 0.18)',
  overlay: 'rgba(0, 0, 0, 0.55)',
  scrim: 'rgba(0, 0, 0, 0.65)',
  success: '#5CB37E',
  successSoft: 'rgba(92, 179, 126, 0.16)',
  danger: '#E27A66',
  danger_soft: '#3A211D',

  // Glass tokens
  glassTint: 'dark',
  glassScrim: 'rgba(22, 16, 18, 0.55)', // dark bg @ 55%
  glassEdge: 'rgba(255, 255, 255, 0.16)',
  glassFill: 'rgba(255, 255, 255, 0.06)',
};

export type ThemeScheme = 'light' | 'dark';

export function getColors(scheme: ThemeScheme): Colors {
  return scheme === 'dark' ? darkColors : lightColors;
}

/**
 * Static light palette — kept as the default export for backward compatibility.
 * Files that haven't migrated to `useTheme()` keep compiling and render in the
 * light palette. Prefer `const colors = useThemeColors()` in new/updated code.
 */
export const colors = lightColors;

/**
 * Semantic aliases so screens read intent, not raw swatches. Theme-aware
 * version is available via `useTheme().semantic`.
 */
export function getSemantic(c: Colors) {
  return {
    background: c.cream,
    surface: c.white,
    surfaceMuted: c.pearl,
    textPrimary: c.ink,
    textSecondary: c.inkMuted,
    primary: c.ink,
    primaryText: c.cream,
    accent: c.pinkWarm,
    accentSoft: c.pinkWarmGlow,
    border: c.border,
    ring: c.blushDeep,
  };
}

export const semantic = getSemantic(lightColors);

export type ColorName = keyof typeof lightColors;
