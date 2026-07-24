import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, ResponsiveContent, ThemedText, Wordmark } from '@/components';
import { Glass } from '@/components/Glass';
import { spacing, radius, useThemedStyles } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import type { Colors } from '@/theme/colors';
import { ORDERED_TIERS, type Tier } from '@/lib/plans';
import { useSubscription } from '@/providers/SubscriptionProvider';

/** Best-value tier, called out with the "Most Popular" badge + pink border. */
const RECOMMENDED: Tier['entitlement'] = 'pro';

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { tier: currentTier, purchase, restore } = useSubscription();
  const [selected, setSelected] = useState<Tier>(
    ORDERED_TIERS.find((t) => t.entitlement === 'pro') ?? ORDERED_TIERS[1],
  );
  const [busy, setBusy] = useState(false);

  const onSubscribe = async () => {
    if (!selected.rcPackageId) return;
    setBusy(true);
    try {
      await purchase(selected.rcPackageId);
      Alert.alert("You're all set", `Welcome to ${selected.name}!`);
      router.back();
    } catch (e: any) {
      // User cancellation is not an error worth alerting about.
      if (!/cancel/i.test(e?.message ?? '')) {
        Alert.alert('Purchase not completed', e?.message ?? 'Please try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.root}>
      <ScrollView
        contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.md }]}
        showsVerticalScrollIndicator={false}
      >
        <ResponsiveContent>
        {/* Header row — title centered, close on the right (modal context) */}
        <View style={styles.headerRow}>
          <View style={styles.headerSpacer} />
          <ThemedText variant="h3" center style={styles.headerTitle}>
            Upgrade Your Stylist
          </ThemedText>
          <Pressable
            onPress={() => router.back()}
            hitSlop={12}
            style={styles.close}
            accessibilityRole="button"
            accessibilityLabel="Close"
          >
            <Ionicons name="close" size={20} color={colors.ink} />
          </Pressable>
        </View>

        {/* Script wordmark hero, like the web upgrade page */}
        <View style={styles.header}>
          <Wordmark size={52} color={colors.pinkWarm} />
          <ThemedText variant="labelSmall" color={colors.inkMuted} center style={styles.sub}>
            Unlock more looks, smarter styling,{'\n'}and premium features.
          </ThemedText>
        </View>

        <View style={styles.plans}>
          {ORDERED_TIERS.map((t) => {
            const isCurrent = t.entitlement === currentTier.entitlement;
            const isSelected = t.entitlement === selected.entitlement;
            const isRecommended = t.entitlement === RECOMMENDED;
            const selectable = !!t.rcPackageId && !isCurrent;
            const [priceMain, pricePeriod] = t.priceLabel.split('/');
            return (
              <Pressable
                key={t.entitlement}
                onPress={() => selectable && setSelected(t)}
                accessibilityRole="button"
                accessibilityLabel={`${t.name} plan, ${t.priceLabel}`}
                accessibilityState={{ selected: isSelected, disabled: !selectable }}
                style={[
                  styles.planShadow,
                  isSelected && selectable && styles.planShadowSelected,
                  isRecommended && styles.planShadowRecommended,
                ]}
              >
                {isRecommended ? (
                  <View style={styles.badge}>
                    <ThemedText variant="labelSmall" color={colors.white} style={styles.badgeText}>
                      MOST POPULAR
                    </ThemedText>
                  </View>
                ) : null}
                <Card
                  glass={false}
                  style={StyleSheet.flatten([
                    styles.plan,
                    isSelected && selectable && styles.planSelected,
                    isCurrent && styles.planCurrent,
                  ])}
                >
                  <View style={styles.planHeader}>
                    <View style={styles.planTitleRow}>
                      {selectable ? (
                        <View style={[styles.radio, isSelected && styles.radioOn]}>
                          {isSelected ? <View style={styles.radioDot} /> : null}
                        </View>
                      ) : null}
                      <ThemedText variant="h3">{t.name}</ThemedText>
                      {isCurrent ? (
                        <View style={styles.currentBadge}>
                          <ThemedText variant="labelSmall" color={colors.cream}>
                            Current
                          </ThemedText>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.priceRow}>
                      <ThemedText variant="h3">{priceMain}</ThemedText>
                      {pricePeriod ? (
                        <ThemedText variant="labelSmall" color={colors.inkMuted}>
                          /{pricePeriod}
                        </ThemedText>
                      ) : null}
                    </View>
                  </View>

                  <View style={styles.perks}>
                    {t.perks.map((p) => (
                      <View key={p} style={styles.perk}>
                        <Ionicons name="checkmark" size={15} color={colors.pinkWarm} />
                        <ThemedText variant="labelSmall" color={colors.ink} style={styles.perkText}>
                          {p}
                        </ThemedText>
                      </View>
                    ))}
                  </View>
                </Card>
              </Pressable>
            );
          })}
        </View>

        <Pressable onPress={() => restore()} hitSlop={8} style={styles.restore} accessibilityRole="button">
          <ThemedText variant="labelSmall" color={colors.pinkWarm} style={styles.restoreText}>
            Restore Purchases
          </ThemedText>
        </Pressable>

        <ThemedText variant="labelSmall" color={colors.inkMuted} center style={styles.fine}>
          Payment is charged to your App Store / Google Play account. Subscriptions
          auto-renew unless turned off at least 24 hours before the period ends. Manage
          or cancel anytime in your store account settings. Prices may vary by region.
        </ThemedText>
        </ResponsiveContent>
      </ScrollView>

      <Glass intensity={50} style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <ResponsiveContent>
          <View style={styles.ctaGlow}>
            <Button
              label={
                selected.entitlement === currentTier.entitlement
                  ? 'Your current plan'
                  : `Continue with ${selected.name}`
              }
              onPress={onSubscribe}
              loading={busy}
              disabled={!selected.rcPackageId || selected.entitlement === currentTier.entitlement}
              variant="primary"
              icon={<Ionicons name="sparkles" size={16} color={colors.cream} />}
            />
          </View>
          {/* Apple 3.1.2 / Google Play: functional Terms + Privacy links on the purchase screen. */}
          <View style={styles.legalLinks}>
            <ThemedText variant="labelSmall" color={colors.inkMuted}>
              By continuing, you agree to our{' '}
            </ThemedText>
            <Pressable onPress={() => router.push('/legal/terms')} hitSlop={8} accessibilityRole="link">
              <ThemedText variant="labelSmall" color={colors.pinkWarm} style={styles.legalLink}>
                Terms
              </ThemedText>
            </Pressable>
            <ThemedText variant="labelSmall" color={colors.inkMuted}>
              {' '}and{' '}
            </ThemedText>
            <Pressable onPress={() => router.push('/legal/privacy')} hitSlop={8} accessibilityRole="link">
              <ThemedText variant="labelSmall" color={colors.pinkWarm} style={styles.legalLink}>
                Privacy Policy
              </ThemedText>
            </Pressable>
          </View>
        </ResponsiveContent>
      </Glass>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    headerRow: { flexDirection: 'row', alignItems: 'center' },
    headerSpacer: { width: 36 },
    headerTitle: { flex: 1 },
    close: {
      width: 36,
      height: 36,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
      backgroundColor: c.white,
    },
    header: { alignItems: 'center', marginTop: spacing.lg, marginBottom: spacing.xl },
    sub: { marginTop: spacing.sm },
    plans: { gap: spacing.lg, marginTop: spacing.sm },
    planShadow: {
      borderRadius: radius.lg,
      shadowColor: c.ink,
      shadowOpacity: 0.06,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    planShadowSelected: {
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.3,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    planShadowRecommended: {
      shadowColor: c.blushDeep,
      shadowOpacity: 0.22,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
    plan: {
      borderWidth: 1.5,
      borderColor: c.pinkWarmGlow,
      padding: spacing.lg,
      // Card's flat style brings its own subtle shadow; borders here rule.
      shadowOpacity: 0,
      elevation: 0,
    },
    planSelected: { borderColor: c.pinkWarm, backgroundColor: c.pinkWarmGlow },
    planCurrent: { borderColor: c.borderStrong, opacity: 0.8 },
    badge: {
      alignSelf: 'center',
      backgroundColor: c.pinkWarm,
      paddingHorizontal: spacing.md,
      paddingVertical: 5,
      borderRadius: radius.pill,
      marginBottom: -12,
      zIndex: 2,
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    badgeText: { letterSpacing: 1.2, fontSize: 11 },
    planHeader: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
    },
    planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm, flexShrink: 1 },
    radio: {
      width: 20,
      height: 20,
      borderRadius: 10,
      borderWidth: 2,
      borderColor: c.borderStrong,
      alignItems: 'center',
      justifyContent: 'center',
    },
    radioOn: { borderColor: c.pinkWarm },
    radioDot: { width: 10, height: 10, borderRadius: 5, backgroundColor: c.pinkWarm },
    priceRow: { flexDirection: 'row', alignItems: 'baseline', gap: 1 },
    currentBadge: {
      backgroundColor: c.ink,
      paddingHorizontal: spacing.sm,
      paddingVertical: 3,
      borderRadius: radius.pill,
    },
    perks: { marginTop: spacing.md, gap: spacing.sm },
    perk: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    perkText: { flex: 1 },
    restore: { alignSelf: 'center', marginTop: spacing.lg, padding: spacing.xs },
    restoreText: { textDecorationLine: 'underline' },
    fine: { marginTop: spacing.lg, maxWidth: 340, alignSelf: 'center' },
    footer: {
      padding: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: c.glassEdge,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
    },
    // Pink glow under the big black CTA.
    ctaGlow: {
      borderRadius: radius.pill,
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.4,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 8,
    },
    legalLinks: {
      flexDirection: 'row',
      flexWrap: 'wrap',
      justifyContent: 'center',
      alignItems: 'center',
      marginTop: spacing.md,
    },
    legalLink: { textDecorationLine: 'underline' },
  });
