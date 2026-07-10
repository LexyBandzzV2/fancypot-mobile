import React from 'react';
import { Platform, StyleSheet, View, type StyleProp, type ViewStyle } from 'react-native';
import { BlurView, type BlurViewProps } from 'expo-blur';
import { fillObject } from '@/theme';

interface GlassProps {
  /** expo-blur intensity, 0-100. Defaults to a subtle ~40. */
  intensity?: number;
  /** expo-blur tint. Defaults to 'light' to match the cream/pearl brand surfaces. */
  tint?: BlurViewProps['tint'];
  style?: StyleProp<ViewStyle>;
  children?: React.ReactNode;
}

/**
 * Reusable glassmorphism surface — wraps expo-blur's `BlurView` with
 * brand-consistent defaults: rounded-corner clipping and a hairline glass
 * edge highlight. Pass `style` for sizing/border-radius/positioning; it's
 * applied to the clipping container so the blur and border always match it.
 *
 * Android caveat: Android's native blur support is considerably weaker and
 * less consistent than iOS's (some OEM skins / older OS versions render it
 * as effectively a no-op), so a bare BlurView can end up looking plain
 * transparent instead of frosted. To compensate, on Android we (1) pass the
 * `dimezisBlurView` experimental blur method, which produces a real blur on
 * more devices than the default implementation, and (2) always layer a
 * translucent brand-cream scrim on top of the blur so the surface degrades
 * to a "frosted" look even in the worst case where the underlying blur
 * renders as nothing.
 */
export function Glass({ intensity = 40, tint = 'light', style, children }: GlassProps) {
  return (
    <View style={[styles.container, style]}>
      <BlurView
        style={fillObject}
        intensity={intensity}
        tint={tint}
        experimentalBlurMethod={Platform.OS === 'android' ? 'dimezisBlurView' : undefined}
      />
      {Platform.OS === 'android' ? (
        <View style={styles.androidScrim} pointerEvents="none" />
      ) : null}
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    overflow: 'hidden',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: 'rgba(255, 255, 255, 0.35)', // glass edge highlight
  },
  androidScrim: {
    ...fillObject,
    backgroundColor: 'rgba(250, 243, 231, 0.55)', // colors.cream @ 55% — frosted fallback
  },
});
