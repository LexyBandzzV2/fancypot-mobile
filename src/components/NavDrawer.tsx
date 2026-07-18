import React, { useEffect, useRef } from 'react';
import {
  Modal,
  View,
  StyleSheet,
  Pressable,
  Animated,
  Easing,
  ScrollView,
  Dimensions,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import { useRouter, type Href } from 'expo-router';
import * as Haptics from 'expo-haptics';
import { spacing, radius, fillObject, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { ThemedText } from './Typography';
import { Glass } from './Glass';

const SCREEN_W = Dimensions.get('window').width;
const PANEL_WIDTH = Math.min(320, SCREEN_W * 0.84);

type IconName = keyof typeof Ionicons.glyphMap;
interface NavItem {
  icon: IconName;
  label: string;
  href: Href;
}

// The full map of destinations, so people can jump anywhere without hunting
// through tabs. Grouped: primary tabs first, then the style tools, then account.
const PRIMARY: NavItem[] = [
  { icon: 'shirt-outline', label: 'My Closet', href: '/(tabs)' },
  { icon: 'sparkles-outline', label: 'Style Feed', href: '/(tabs)/feed' },
  { icon: 'add-circle-outline', label: 'Style Studio', href: '/(tabs)/create' },
  { icon: 'bookmark-outline', label: 'Saved Looks', href: '/(tabs)/saved' },
  { icon: 'person-outline', label: 'Profile', href: '/(tabs)/profile' },
];

const TOOLS: NavItem[] = [
  { icon: 'color-wand-outline', label: 'AI Stylist', href: '/style/stylist' },
  { icon: 'camera-outline', label: 'Get the Look', href: '/style/get-the-look' },
  { icon: 'body-outline', label: 'Virtual Try-on', href: '/style/try-on' },
];

const ACCOUNT: NavItem[] = [
  { icon: 'options-outline', label: 'Style Preferences', href: '/settings/preferences' },
];

/**
 * Slide-out navigation drawer. Renders once at the root (via NavDrawerProvider)
 * and is opened from the header menu button on any screen. Bottom of the panel
 * pins the upgrade CTA and sign-out.
 */
export function NavDrawer({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const styles = useThemedStyles(makeStyles);
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const { user, profile, signOut } = useAuth();
  const { tier } = useSubscription();

  const translateX = useRef(new Animated.Value(-PANEL_WIDTH)).current;
  const backdrop = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    if (visible) {
      Animated.parallel([
        Animated.timing(translateX, {
          toValue: 0,
          duration: 260,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: true,
        }),
        Animated.timing(backdrop, { toValue: 1, duration: 260, useNativeDriver: true }),
      ]).start();
    } else {
      translateX.setValue(-PANEL_WIDTH);
      backdrop.setValue(0);
    }
  }, [visible, translateX, backdrop]);

  const go = (href: Href) => {
    Haptics.selectionAsync().catch(() => {});
    onClose();
    router.push(href);
  };

  const isBusiness = tier.entitlement === 'business';
  const initials = (profile?.display_name ?? user?.email ?? 'F').slice(0, 1).toUpperCase();

  return (
    <Modal visible={visible} transparent animationType="none" onRequestClose={onClose}>
      <View style={styles.root}>
        <Animated.View style={[styles.backdrop, { opacity: backdrop }]}>
          <Pressable style={StyleSheet.absoluteFill} onPress={onClose} accessibilityLabel="Close menu" />
        </Animated.View>
        <Animated.View style={[styles.panelWrap, { transform: [{ translateX }] }]}>
          <Glass style={[styles.panel, { paddingTop: insets.top + spacing.lg }]} intensity={60}>
            {/* Account summary */}
            <View style={styles.account}>
              <View style={styles.avatar}>
                <ThemedText variant="h3" color={colors.cream}>
                  {initials}
                </ThemedText>
              </View>
              <View style={styles.accountInfo}>
                <ThemedText variant="h3" numberOfLines={1}>
                  {profile?.display_name ?? 'Your account'}
                </ThemedText>
                <ThemedText variant="labelSmall" color={colors.inkMuted} numberOfLines={1}>
                  {tier.name} plan
                </ThemedText>
              </View>
            </View>

            <ScrollView
              style={styles.scroll}
              contentContainerStyle={styles.scrollContent}
              showsVerticalScrollIndicator={false}
            >
              {PRIMARY.map((item) => (
                <DrawerLink key={item.label} item={item} onPress={() => go(item.href)} />
              ))}
              <View style={styles.divider} />
              <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.groupLabel}>
                STYLE TOOLS
              </ThemedText>
              {TOOLS.map((item) => (
                <DrawerLink key={item.label} item={item} onPress={() => go(item.href)} />
              ))}
              <View style={styles.divider} />
              {ACCOUNT.map((item) => (
                <DrawerLink key={item.label} item={item} onPress={() => go(item.href)} />
              ))}
            </ScrollView>

            {/* Pinned footer: upgrade + sign out */}
            <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
              <Pressable
                style={styles.upgrade}
                onPress={() => go(isBusiness ? '/settings/manage-subscription' : '/paywall')}
                accessibilityRole="button"
              >
                <Ionicons
                  name={isBusiness ? 'settings-outline' : 'rocket-outline'}
                  size={20}
                  color={colors.cream}
                />
                <ThemedText variant="label" color={colors.cream}>
                  {isBusiness ? 'Manage subscription' : 'Upgrade plan'}
                </ThemedText>
              </Pressable>
              <Pressable
                style={styles.signOut}
                onPress={() => {
                  onClose();
                  signOut();
                }}
                accessibilityRole="button"
              >
                <Ionicons name="log-out-outline" size={20} color={colors.danger} />
                <ThemedText variant="label" color={colors.danger}>
                  Log out
                </ThemedText>
              </Pressable>
            </View>
          </Glass>
        </Animated.View>
      </View>
    </Modal>
  );
}

function DrawerLink({ item, onPress }: { item: NavItem; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.link, pressed && styles.linkPressed]}
      accessibilityRole="button"
      accessibilityLabel={item.label}
    >
      <Ionicons name={item.icon} size={22} color={colors.ink} />
      <ThemedText variant="body">{item.label}</ThemedText>
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, flexDirection: 'row' },
    backdrop: { ...fillObject, backgroundColor: 'rgba(0, 0, 0, 0.55)' },
    panelWrap: { width: PANEL_WIDTH, height: '100%' },
    panel: {
      flex: 1,
      borderTopRightRadius: radius.lg,
      borderBottomRightRadius: radius.lg,
      paddingHorizontal: spacing.lg,
      overflow: 'hidden',
    },
    account: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingBottom: spacing.lg,
    },
    avatar: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
    },
    accountInfo: { flex: 1 },
    scroll: { flex: 1 },
    scrollContent: { paddingVertical: spacing.sm },
    groupLabel: { letterSpacing: 1, marginTop: spacing.sm, marginBottom: spacing.xs, paddingHorizontal: spacing.sm },
    link: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      minHeight: 52,
      paddingHorizontal: spacing.sm,
      borderRadius: radius.md,
    },
    linkPressed: { backgroundColor: c.pearl },
    divider: { height: 1, backgroundColor: c.border, marginVertical: spacing.sm },
    footer: { gap: spacing.sm, paddingTop: spacing.md, borderTopWidth: 1, borderTopColor: c.border },
    upgrade: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      backgroundColor: c.pinkWarm,
      borderRadius: radius.pill,
      minHeight: 48,
    },
    signOut: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      minHeight: 44,
    },
  });
