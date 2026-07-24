import React from 'react';
import { View, StyleSheet, Pressable, ScrollView, Linking } from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ResponsiveContent, ThemedText, SectionLabel, SettingsGroup, SettingsRow } from '@/components';
import type { Colors } from '@/theme/colors';
import { fonts, radius, spacing, useThemedStyles } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { useNavDrawer } from '@/providers/NavDrawerProvider';
import { useSignedAvatar } from '@/hooks/useSignedAvatar';
import { parseBirthDate, zodiacFor } from '@/lib/zodiac';

const SUPPORT_EMAIL = 'support@fancypot.org';

export default function ProfileScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut } = useAuth();
  const { tier, restore } = useSubscription();
  const { openDrawer } = useNavDrawer();

  const displayName = profile?.display_name ?? user?.email ?? '';
  const firstName = displayName.split(/[\s@]/)[0] || 'there';
  const initials = (displayName || 'F').slice(0, 1).toUpperCase();
  const isBusiness = tier.entitlement === 'business';
  const avatarUrl = useSignedAvatar(profile?.avatar_url);

  // Zodiac badge — only when a birthday is saved and the user hasn't hidden it.
  const prefs = (profile?.preferences ?? {}) as { birth_date?: string; show_zodiac?: boolean };
  const birthDate = parseBirthDate(prefs.birth_date);
  const zodiac = birthDate ? zodiacFor(birthDate.month, birthDate.day) : null;
  const showZodiac = !!zodiac && prefs.show_zodiac !== false;

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
      showsVerticalScrollIndicator={false}
    >
      <ResponsiveContent>
      {/* Greeting header — menu, "Hi, <name> ♥", avatar */}
      <View style={styles.header}>
        <Pressable
          onPress={openDrawer}
          hitSlop={12}
          style={styles.menuBtn}
          accessibilityRole="button"
          accessibilityLabel="Open menu"
        >
          <Ionicons name="menu" size={26} color={colors.ink} />
        </Pressable>
        <View style={styles.greeting}>
          <ThemedText variant="h1" numberOfLines={1}>
            Hi, {firstName} <ThemedText variant="h1" color={colors.pinkWarm}>♥</ThemedText>
          </ThemedText>
          <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.greetingSub}>
            You look amazing today.
          </ThemedText>
          {showZodiac && zodiac ? (
            <ThemedText variant="labelSmall" color={colors.pinkWarm} style={styles.zodiacBadge}>
              {zodiac.symbol} {zodiac.name}
            </ThemedText>
          ) : null}
        </View>
        <Pressable
          onPress={() => router.push('/settings/account')}
          style={({ pressed }) => [styles.avatar, pressed && styles.pressedDim]}
          accessibilityRole="button"
          accessibilityLabel="Edit your account"
        >
          {avatarUrl ? (
            <Image source={{ uri: avatarUrl }} style={styles.avatarImg} contentFit="cover" transition={150} />
          ) : (
            <ThemedText variant="h3" color={colors.blushDeep}>
              {initials}
            </ThemedText>
          )}
        </Pressable>
      </View>

      {/* Plan card — blush gradient with the Upgrade / Manage pill */}
      <SectionLabel>YOUR PLAN</SectionLabel>
      <LinearGradient
        colors={[colors.pinkWarmGlow, colors.beige]}
        start={{ x: 0, y: 0 }}
        end={{ x: 1, y: 1 }}
        style={styles.planCard}
      >
        <View style={styles.planTop}>
          <View style={styles.planTitleRow}>
            <Ionicons name="sparkles" size={16} color={colors.pinkWarm} />
            <View>
              <ThemedText style={styles.planName}>{tier.name} Plan</ThemedText>
              <ThemedText variant="labelSmall" color={colors.inkMuted}>
                {tier.priceLabel}
              </ThemedText>
            </View>
          </View>
          <Pressable
            onPress={() =>
              isBusiness ? router.push('/settings/manage-subscription') : router.push('/paywall')
            }
            style={({ pressed }) => [styles.planPill, pressed && styles.pressedDim]}
            accessibilityRole="button"
            accessibilityLabel={isBusiness ? 'Manage subscription' : 'Upgrade plan'}
          >
            <ThemedText variant="labelSmall" color={colors.white}>
              {isBusiness ? 'Manage' : 'Upgrade'}
            </ThemedText>
          </Pressable>
        </View>
        <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.planMeta}>
          {tier.limits.outfitsPerMonth} outfits/mo · {tier.limits.wardrobeItems} closet items ·{' '}
          {tier.limits.tryOnsPerWeek} try-ons/wk
        </ThemedText>
        <Pressable
          onPress={() => restore()}
          hitSlop={8}
          style={styles.restore}
          accessibilityRole="button"
        >
          <ThemedText variant="labelSmall" color={colors.blushDeep}>
            Restore purchases
          </ThemedText>
        </Pressable>
      </LinearGradient>

      {/* Settings */}
      <SectionLabel>SETTINGS</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon="person-circle-outline"
          label="Account"
          value="Name, photo, birthday"
          onPress={() => router.push('/settings/account')}
        />
        <SettingsRow
          icon="options-outline"
          label="Style preferences"
          onPress={() => router.push('/settings/preferences')}
        />
        <SettingsRow
          icon="key-outline"
          label="Change password"
          onPress={() => router.push('/settings/change-password')}
        />
        <SettingsRow
          icon={profile?.phone_verified ? 'shield-checkmark-outline' : 'call-outline'}
          label={profile?.phone_verified ? 'Phone verified' : 'Verify phone number'}
          value={profile?.phone_verified ? 'Verified' : undefined}
          onPress={() => router.push('/verify-phone')}
        />
      </SettingsGroup>

      {/* Support / legal */}
      <SectionLabel>SUPPORT</SectionLabel>
      <SettingsGroup>
        <SettingsRow
          icon="chatbubble-ellipses-outline"
          label="Contact support"
          onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)}
        />
        <SettingsRow
          icon="document-text-outline"
          label="Privacy policy"
          onPress={() => router.push('/legal/privacy')}
        />
        <SettingsRow
          icon="reader-outline"
          label="Terms of use"
          onPress={() => router.push('/legal/terms')}
        />
      </SettingsGroup>

      {/* Log out / delete — quiet card-style buttons, like the web */}
      <View style={styles.danger}>
        <Pressable
          onPress={signOut}
          style={({ pressed }) => [styles.quietBtn, pressed && styles.pressedDim]}
          accessibilityRole="button"
        >
          <ThemedText variant="label">Log Out</ThemedText>
        </Pressable>
        <Pressable
          onPress={() => router.push('/settings/delete-account')}
          style={({ pressed }) => [styles.quietBtn, pressed && styles.pressedDim]}
          accessibilityRole="button"
        >
          <ThemedText variant="label" color={colors.danger}>
            Delete Account
          </ThemedText>
        </Pressable>
      </View>
      </ResponsiveContent>
    </ScrollView>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
    header: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    menuBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      alignItems: 'center',
      justifyContent: 'center',
      marginLeft: -spacing.sm,
    },
    greeting: { flex: 1 },
    greetingSub: { marginTop: 2 },
    zodiacBadge: { marginTop: 2 },
    avatar: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: c.tissue,
      borderWidth: 2,
      borderColor: c.blush,
      alignItems: 'center',
      justifyContent: 'center',
      overflow: 'hidden',
    },
    avatarImg: { width: '100%', height: '100%' },
    planCard: {
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
      padding: spacing.lg,
    },
    planTop: { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between' },
    planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    planName: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24 },
    planPill: {
      backgroundColor: c.pinkWarm,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
    planMeta: { marginTop: spacing.md },
    restore: { marginTop: spacing.sm, alignSelf: 'flex-start' },
    pressedDim: { opacity: 0.7 },
    danger: { marginTop: spacing.xl, gap: spacing.sm },
    quietBtn: {
      minHeight: 48,
      borderRadius: radius.md,
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
      alignItems: 'center',
      justifyContent: 'center',
    },
  });
