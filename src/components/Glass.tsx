import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView, type BlurViewProps } from 'expo-blur';
import { fillObject } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';

interface GlassProps {
  /** expo-blur intensity, 0-100. Defaults to a subtle ~40. */
  intensity?: number;
  /** expo-blur tint. Defaults to the active theme (light→'light', dark→'dark'). */
  tint?: BlurViewProps['tint'];
  /**
   * Translucent color layered ON TOP of the blur — this is what actually
   * reads as "frosted glass" (the blur alone just softens what's behind; the
   * tint gives it the brand-colored glass body). Defaults to the theme's
   * `glassFill` token. Pass 'transparent' for a pure blur with no tint.
   */
  tintColor?: string;
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Reusable glassmorphism surface — wraps expo-blur's `BlurView` with
 * brand-consistent defaults: rounded-corner clipping, a translucent color
 * tint on top of the blur, and a hairline glass edge highlight. Pass `style`
 * for sizing/border-radius/positioning; it's applied to the clipping
 * container so the blur, tint, and border always match it.
 *
 * Theme-aware: blur tint, color tint, edge highlight, and the Android
 * fallback scrim all follow the current light/dark palette (see `glass*`
 * tokens in theme/colors.ts) — so a card frosts over cream in light mode and
 * over the warm plum-black in dark mode.
 *
 * Android caveat: Android's native blur support is weaker/less consistent
 * than iOS's (some OEM skins render it as a no-op). To compensate, on
 * Android we (1) pass the `dimezisBlurView` experimental method for a real
 * blur on more devices, and (2) always layer an extra translucent scrim on
 * top so the surface still reads "frosted" even if the blur itself renders
 * as nothing.
 */
export function Glass({ intensity = 40, tint, tintColor, style, children }: GlassProps) {
  const { colors } = useTheme();
  const resolvedTint = tintColor ?? colors.glassFill;
  return (
    <View style={[styles.container, { borderColor: colors.glassEdge }, style]}>
      <BlurView
        style={fillObject}
        intensity={intensity}
        tint={tint ?? colors.glassTint}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      />
      {resolvedTint !== 'transparent' ? (
        <View style={[fillObject, { backgroundColor: resolvedTint }]} pointerEvents="none" />
      ) : null}
      {Platform.OS === 'android' ? (
        <View style={[fillObject, { backgroundColor: colors.glassScrim }]} pointerEvents="none" />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
  },
});
