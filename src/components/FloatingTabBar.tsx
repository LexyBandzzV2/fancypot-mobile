import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { spacing, radius, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { Glass } from './Glass';
import { ThemedText } from './Typography';

const BAR_HEIGHT = 64;
const CENTER_SIZE = 58;

/**
 * Space the floating bar occupies above the bottom safe-area inset. Screens
 * pad their scroll content by at least this much so nothing hides behind the
 * bar. (Kept ≤ the 120 most tab screens already reserve.)
 */
export const FLOATING_TAB_BAR_HEIGHT = BAR_HEIGHT + spacing.md;

type IconName = keyof typeof Ionicons.glyphMap;
interface TabConfig {
  label: string;
  icon: IconName;
  active: IconName;
}

// Keyed by route file name under app/(tabs). `create` is the elevated center.
const TABS: Record<string, TabConfig> = {
  index: { label: 'Closet', icon: 'shirt-outline', active: 'shirt' },
  feed: { label: 'Feed', icon: 'sparkles-outline', active: 'sparkles' },
  create: { label: 'Style', icon: 'add', active: 'add' },
  saved: { label: 'Saved', icon: 'bookmark-outline', active: 'bookmark' },
  profile: { label: 'Profile', icon: 'person-outline', active: 'person' },
};
const CENTER_ROUTE = 'create';

interface TabRoute {
  key: string;
  name: string;
}
// Minimal structural subset of react-navigation's BottomTabBarProps — avoids a
// direct dependency on @react-navigation/bottom-tabs (not a top-level package).
// `state` is read directly so it stays strongly typed; `emit`/`navigate` take
// `any` args only because react-navigation's generic signatures resist a
// hand-written structural match (the runtime contract is exact).
interface FloatingTabBarProps {
  state: { index: number; routes: TabRoute[] };
  navigation: {
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    emit: (event: any) => any;
    // eslint-disable-next-line @typescript-eslint/no-explicit-any
    navigate: (name: any) => void;
  };
}

/**
 * Floating frosted-glass pill navigation. Sits above the safe area, five
 * thumb-reachable destinations, with the central Style action raised into an
 * illuminated pink circle. Preserves the existing tab routes and tabPress
 * behavior (emit → navigate).
 */
export function FloatingTabBar({ state, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  const go = (route: TabRoute, focused: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event?.defaultPrevented) navigation.navigate(route.name);
  };

  const activeName = state.routes[state.index]?.name;
  const centerRoute = state.routes.find((r) => r.name === CENTER_ROUTE);
  const centerFocused = activeName === CENTER_ROUTE;
  const barBottom = insets.bottom + spacing.sm;

  return (
    <View style={[styles.root, { paddingBottom: barBottom }]} pointerEvents="box-none">
      <Glass intensity={60} style={styles.bar}>
        {state.routes.map((route, i) => {
          const cfg = TABS[route.name];
          if (!cfg) return null;

          if (route.name === CENTER_ROUTE) {
            // Reserve the slot; the raised circle is an overlay (Glass clips).
            return (
              <View key={route.key} style={styles.slot} pointerEvents="none">
                <View style={styles.centerSpacer} />
                <ThemedText
                  variant="labelSmall"
                  color={centerFocused ? colors.pinkWarm : colors.inkMuted}
                  style={styles.label}
                >
                  {cfg.label}
                </ThemedText>
              </View>
            );
          }

          const focused = state.index === i;
          const color = focused ? colors.ink : colors.inkMuted;
          return (
            <Pressable
              key={route.key}
              onPress={() => go(route, focused)}
              style={styles.slot}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={cfg.label}
            >
              <View style={[styles.iconWrap, focused && styles.iconWrapOn]}>
                <Ionicons name={focused ? cfg.active : cfg.icon} size={22} color={color} />
              </View>
              <ThemedText variant="labelSmall" color={color} style={styles.label}>
                {cfg.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </Glass>

      {/* Raised, illuminated center Style action — outside Glass so it isn't
          clipped, and width-constrained so it only intercepts its own taps. */}
      {centerRoute ? (
        <View
          style={[styles.centerOverlay, { bottom: barBottom + BAR_HEIGHT - CENTER_SIZE + 14 }]}
          pointerEvents="box-none"
        >
          <Pressable
            onPress={() => go(centerRoute, centerFocused)}
            accessibilityRole="button"
            accessibilityState={{ selected: centerFocused }}
            accessibilityLabel="Style"
            style={({ pressed }) => [styles.centerButton, pressed && styles.centerPressed]}
          >
            <Ionicons name="add" size={30} color={colors.cream} />
          </Pressable>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.xl,
    },
    bar: {
      flexDirection: 'row',
      height: BAR_HEIGHT,
      borderRadius: radius.pill,
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      // Soft lift so the pill reads as floating above the content.
      shadowColor: c.ink,
      shadowOpacity: 0.12,
      shadowRadius: 16,
      shadowOffset: { width: 0, height: 6 },
      elevation: 8,
    },
    slot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingVertical: spacing.xs,
    },
    iconWrap: {
      minWidth: 44,
      height: 28,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
      paddingHorizontal: spacing.md,
    },
    iconWrapOn: { backgroundColor: c.pinkWarmGlow },
    label: { fontSize: 11, lineHeight: 14 },
    centerSpacer: { height: 26 },
    centerOverlay: {
      position: 'absolute',
      left: 0,
      right: 0,
      alignItems: 'center',
    },
    centerButton: {
      width: CENTER_SIZE,
      height: CENTER_SIZE,
      borderRadius: CENTER_SIZE / 2,
      backgroundColor: c.pinkWarm,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 3,
      borderColor: c.cream,
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.45,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 10,
    },
    centerPressed: { transform: [{ scale: 0.94 }] },
  });
