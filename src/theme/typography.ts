/**
 * Typography tokens mirroring the web app's font stack:
 *   --font-script  : Pinyon Script        (the "Fancy Pot" wordmark)
 *   --font-display : Cormorant Garamond    (page headings)
 *   --font-sans    : Inter                 (UI labels, uppercase tracked text)
 *
 * The matching @expo-google-fonts packages are loaded in app/_layout.tsx.
 * Font family keys below must equal the names registered with expo-font.
 */
export const fonts = {
  script: 'PinyonScript_400Regular',
  display: 'CormorantGaramond_500Medium',
  displaySemibold: 'CormorantGaramond_600SemiBold',
  displayItalic: 'CormorantGaramond_500Medium_Italic',
  sans: 'Inter_400Regular',
  sansMedium: 'Inter_500Medium',
  sansSemibold: 'Inter_600SemiBold',
} as const;

export const type = {
  // Big script wordmark, e.g. "Fancy Pot"
  wordmark: { fontFamily: fonts.script, fontSize: 52, lineHeight: 58 },
  // Cormorant display headings
  h1: { fontFamily: fonts.displaySemibold, fontSize: 34, lineHeight: 40 },
  h2: { fontFamily: fonts.displaySemibold, fontSize: 26, lineHeight: 32 },
  h3: { fontFamily: fonts.display, fontSize: 22, lineHeight: 28 },
  // Serif body
  body: { fontFamily: fonts.display, fontSize: 17, lineHeight: 25 },
  bodyItalic: { fontFamily: fonts.displayItalic, fontSize: 17, lineHeight: 25 },
  // Inter UI
  label: { fontFamily: fonts.sansMedium, fontSize: 15, lineHeight: 20 },
  labelSmall: { fontFamily: fonts.sans, fontSize: 13, lineHeight: 18 },
  // Uppercase tracked eyebrow ("BREAKFAST AT YOUR CLOSET")
  eyebrow: {
    fontFamily: fonts.sansMedium,
    fontSize: 12,
    lineHeight: 16,
    letterSpacing: 2.5,
    textTransform: 'uppercase' as const,
  },
  button: { fontFamily: fonts.sansSemibold, fontSize: 16, lineHeight: 20, letterSpacing: 0.5 },
} as const;

export const spacing = {
  xs: 4,
  sm: 8,
  md: 12,
  lg: 16,
  xl: 24,
  xxl: 32,
  xxxl: 48,
} as const;

export const radius = {
  sm: 10,
  md: 16,
  lg: 24,
  pill: 999,
} as const;

/** Minimum tap target per Apple HIG / Material — used across native buttons. */
export const TAP_TARGET = 48;

/**
 * Absolute-fill style object. RN 0.86's StyleSheet types dropped
 * `absoluteFillObject`, so we spread this instead of `...StyleSheet.absoluteFillObject`.
 */
export const fillObject = {
  position: 'absolute' as const,
  top: 0,
  left: 0,
  right: 0,
  bottom: 0,
};
