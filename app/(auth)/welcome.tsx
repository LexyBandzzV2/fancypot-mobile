import React from 'react';
import { View, StyleSheet, Pressable, Text } from 'react-native';
import { useRouter } from 'expo-router';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import * as Haptics from 'expo-haptics';
import { ThemedText } from '@/components';
import { fonts, radius, spacing, type, TAP_TARGET, fillObject } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';

/**
 * Splash / landing — mirrors the web splash: bottom-anchored script
 * "Fancy Pot" wordmark, the tagline, a hot-pink Get Started pill, and the
 * log-in link. The web uses a full-bleed stock photo; no such asset ships
 * with the app, so a soft blush gradient carries the mood instead.
 */
export default function Welcome() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();

  const getStarted = () => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light).catch(() => {});
    router.push('/(auth)/sign-up');
  };

  return (
    <View style={[styles.root, { backgroundColor: colors.cream }]}>
      <LinearGradient
        colors={[colors.pinkWarmGlow, colors.tissue, colors.cream]}
        locations={[0, 0.45, 1]}
        style={styles.bg}
        pointerEvents="none"
      />
      <View style={[styles.content, { paddingBottom: insets.bottom + spacing.xl }]}>
        <Text
          style={[styles.wordmark, { color: colors.pinkWarm }]}
          accessibilityRole="header"
          accessibilityLabel="Fancy Pot"
        >
          Fancy{'\n'}Pot
        </Text>
        <ThemedText variant="bodyItalic" style={styles.tagline}>
          Your AI stylist.{'\n'}Always in your corner.
        </ThemedText>

        <Pressable
          onPress={getStarted}
          accessibilityRole="button"
          accessibilityLabel="Get Started"
          style={({ pressed }) => [styles.ctaWrap, pressed && styles.pressed]}
        >
          <LinearGradient
            colors={[colors.pinkWarm, colors.pinkWarmSoft]}
            start={{ x: 0, y: 0 }}
            end={{ x: 1, y: 0 }}
            style={[styles.cta, { shadowColor: colors.pinkWarm }]}
          >
            <Text style={[styles.ctaLabel, { color: colors.white }]}>Get Started</Text>
          </LinearGradient>
        </Pressable>

        <View style={styles.loginRow}>
          <ThemedText variant="labelSmall" color={colors.inkMuted}>
            Already have an account?{' '}
          </ThemedText>
          <Pressable
            onPress={() => router.push('/(auth)/sign-in')}
            hitSlop={8}
            accessibilityRole="link"
            accessibilityLabel="Log in"
          >
            <ThemedText variant="labelSmall" color={colors.pinkWarm} style={styles.loginLink}>
              Log in
            </ThemedText>
          </Pressable>
        </View>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1 },
  bg: { ...fillObject },
  content: { flex: 1, justifyContent: 'flex-end', paddingHorizontal: spacing.xxl },
  wordmark: {
    fontFamily: fonts.script,
    fontSize: 88,
    lineHeight: 92,
  },
  tagline: { marginTop: spacing.xl },
  ctaWrap: { marginTop: spacing.xxl, borderRadius: radius.pill },
  cta: {
    minHeight: TAP_TARGET + 4,
    borderRadius: radius.pill,
    alignItems: 'center',
    justifyContent: 'center',
    shadowOpacity: 0.4,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 8,
  },
  ctaLabel: { ...type.button },
  pressed: { opacity: 0.9, transform: [{ scale: 0.99 }] },
  loginRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.lg,
  },
  loginLink: { textDecorationLine: 'underline' },
});
