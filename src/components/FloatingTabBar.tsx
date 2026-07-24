import React from 'react';
import { View, Pressable, StyleSheet } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { fonts, spacing, radius, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useResponsive } from '@/hooks/useResponsive';
import { Glass } from './Glass';
import { ThemedText } from './Typography';

const BAR_HEIGHT = 64;
const CENTER_SIZE = 44;
// Tablet cap: on a 13" iPad the full-width bar would stretch to ~960+pt; this
// keeps it a comfortable, centered pill instead. Phone ignores this entirely.
const TABLET_BAR_MAX_WIDTH = 500;

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

// Keyed by route file name under app/(tabs). `create` is the in-bar center
// circle (web BottomNav's "big" Style item).
const TABS: Record<string, TabConfig> = {
  index: { label: 'Closet', icon: 'shirt-outline', active: 'shirt' },
  feed: { label: 'Feed', icon: 'heart-outline', active: 'heart' },
  create: { label: 'Style', icon: 'sparkles-outline', active: 'sparkles' },
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
 * Floating white pill navigation (ported from the web BottomNav): a rounded
 * card with a soft pink shadow and pink-blush border. Five destinations; the
 * central Style item sits INSIDE the bar as a blush circle that fills hot
 * pink when active. Preserves the existing tab routes and tabPress behavior
 * (emit → navigate).
 */
export function FloatingTabBar({ state, navigation }: FloatingTabBarProps) {
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { isTablet } = useResponsive();

  const go = (route: TabRoute, focused: boolean) => {
    Haptics.selectionAsync().catch(() => {});
    const event = navigation.emit({ type: 'tabPress', target: route.key, canPreventDefault: true });
    if (!focused && !event?.defaultPrevented) navigation.navigate(route.name);
  };

  const barBottom = insets.bottom + spacing.sm;

  return (
    <View
      style={[styles.root, isTablet && styles.rootTablet, { paddingBottom: barBottom }]}
      pointerEvents="box-none"
    >
      {/* ~95% white over blur — the web bar's bg-card/95 + backdrop-blur. */}
      <Glass
        intensity={60}
        tintColor={`${colors.white}F2`}
        style={[styles.bar, isTablet && styles.barTablet]}
      >
        {state.routes.map((route, i) => {
          const cfg = TABS[route.name];
          if (!cfg) return null;

          const focused = state.index === i;
          const isCenter = route.name === CENTER_ROUTE;
          const color = focused ? colors.pinkWarm : colors.inkMuted;

          return (
            <Pressable
              key={route.key}
              onPress={() => go(route, focused)}
              style={styles.slot}
              accessibilityRole="button"
              accessibilityState={{ selected: focused }}
              accessibilityLabel={cfg.label}
            >
              {isCenter ? (
                <View style={[styles.centerCircle, focused && styles.centerCircleOn]}>
                  <Ionicons
                    name={focused ? cfg.active : cfg.icon}
                    size={20}
                    color={focused ? colors.white : colors.pinkWarm}
                  />
                </View>
              ) : (
                <View style={styles.iconWrap}>
                  <Ionicons name={focused ? cfg.active : cfg.icon} size={19} color={color} />
                </View>
              )}
              <ThemedText
                variant="labelSmall"
                color={color}
                style={[styles.label, focused && styles.labelOn]}
              >
                {cfg.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </Glass>
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
      // Web: mx-4 (16) insets around the floating card.
      paddingHorizontal: spacing.lg,
    },
    // Tablet: root still spans the full width (so `bottom`/insets still work),
    // but centers its child instead of the default stretch so the capped bar
    // below floats in the middle rather than hugging the edges.
    rootTablet: {
      alignItems: 'center',
    },
    bar: {
      flexDirection: 'row',
      height: BAR_HEIGHT,
      borderRadius: radius.pill,
      alignItems: 'center',
      paddingHorizontal: spacing.sm,
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
      // Web: shadow-[0_10px_30px_-10px_rgba(232,90,140,0.25)] — blushDeep is
      // that exact rose (#E85A8C).
      shadowColor: c.blushDeep,
      shadowOpacity: 0.25,
      shadowRadius: 15,
      shadowOffset: { width: 0, height: 10 },
      elevation: 8,
    },
    barTablet: {
      width: '100%',
      maxWidth: TABLET_BAR_MAX_WIDTH,
      alignSelf: 'center',
    },
    slot: {
      flex: 1,
      alignItems: 'center',
      justifyContent: 'center',
      gap: 2,
      paddingVertical: 2,
    },
    iconWrap: {
      height: 28,
      minWidth: 36,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Center Style circle lives inside the bar: blush at rest, hot pink when
    // active (web: bg-[--pink-soft] text-primary / bg-primary + shadow-pink).
    centerCircle: {
      width: CENTER_SIZE,
      height: CENTER_SIZE,
      borderRadius: CENTER_SIZE / 2,
      backgroundColor: c.blush,
      alignItems: 'center',
      justifyContent: 'center',
    },
    centerCircleOn: {
      backgroundColor: c.pinkWarm,
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 5 },
      elevation: 6,
    },
    label: { fontSize: 10, lineHeight: 13 },
    labelOn: { fontFamily: fonts.sansMedium },
  });
