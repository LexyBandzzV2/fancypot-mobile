import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, Card, ThemedText, Wordmark } from '@/components';
import { Glass } from '@/components/Glass';
import { spacing, radius, type, useThemedStyles } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import type { Colors } from '@/theme/colors';
import { ORDERED_TIERS, type Tier } from '@/lib/plans';
import { useSubscription } from '@/providers/SubscriptionProvider';

/** Best-value tier, called out with a badge + pink glow border. */
const RECOMMENDED: Tier['entitlement'] = 'pro';

const TIER_ICON: Record<Tier['entitlement'], keyof typeof Ionicons.glyphMap> = {
  free: 'pricetags-outline',
  pro: 'sparkles',
  business: 'diamond-outline',
};

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
        <Pressable onPress={() => router.back()} hitSlop={12} style={styles.close}>
          <Ionicons name="close" size={24} color={colors.ink} />
        </Pressable>

        <View style={styles.header}>
          <View style={styles.heroGlowWrap} pointerEvents="none">
            <Glass
              intensity={60}
              tintColor={colors.pinkWarmGlow}
              style={styles.heroGlow}
            />
          </View>
          <ThemedText style={type.eyebrow} color={colors.pinkWarm} center>
            Upgrade your stylist
          </ThemedText>
          <Wordmark size={44} />
          <ThemedText variant="bodyItalic" color={colors.inkMuted} center style={styles.sub}>
            Unlock unlimited outfits, more try-ons, and zero ads.
          </ThemedText>
        </View>

        <View style={styles.plans}>
          {ORDERED_TIERS.map((t) => {
            const isCurrent = t.entitlement === currentTier.entitlement;
            const isSelected = t.entitlement === selected.entitlement;
            const isRecommended = t.entitlement === RECOMMENDED;
            const selectable = !!t.rcPackageId && !isCurrent;
            return (
              <Pressable
                key={t.entitlement}
                onPress={() => selectable && setSelected(t)}
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
                  glass
                  style={StyleSheet.flatten([
                    styles.plan,
                    isSelected && selectable && styles.planSelected,
                    isRecommended && styles.planRecommended,
                    isCurrent && styles.planCurrent,
                  ])}
                >
                  <View style={styles.planHeader}>
                    <View style={styles.planTitleRow}>
                      <View
                        style={[
                          styles.planIcon,
                          isRecommended && styles.planIconRecommended,
                        ]}
                      >
                        <Ionicons
                          name={TIER_ICON[t.entitlement]}
                          size={18}
                          color={isRecommended ? colors.white : colors.blushDeep}
                        />
                      </View>
                      <ThemedText variant="h3">{t.name}</ThemedText>
                    </View>
                    {isCurrent ? (
                      <View style={styles.currentBadge}>
                        <ThemedText variant="labelSmall" color={colors.cream}>
                          Current
                        </ThemedText>
                      </View>
                    ) : isSelected && selectable ? (
                      <Ionicons name="checkmark-circle" size={26} color={colors.pinkWarm} />
                    ) : selectable ? (
                      <Ionicons name="ellipse-outline" size={26} color={colors.borderStrong} />
                    ) : null}
                  </View>

                  <View style={styles.priceRow}>
                    <ThemedText variant="h2" color={colors.ink}>
                      {t.priceLabel.split('/')[0]}
                    </ThemedText>
                    {t.priceLabel.includes('/') ? (
                      <ThemedText variant="label" color={colors.inkMuted} style={styles.pricePeriod}>
                        /{t.priceLabel.split('/')[1]}
                      </ThemedText>
                    ) : null}
                  </View>

                  <View style={styles.perks}>
                    {t.perks.map((p) => (
                      <View key={p} style={styles.perk}>
                        <Ionicons name="checkmark" size={16} color={colors.pinkWarm} />
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

        <ThemedText variant="labelSmall" color={colors.inkMuted} center style={styles.fine}>
          Payment is charged to your App Store / Google Play account. Subscriptions
          auto-renew unless turned off at least 24 hours before the period ends. Manage
          or cancel anytime in your store account settings. Prices may vary by region.
        </ThemedText>

        {/* Apple 3.1.2 / Google Play: functional Terms + Privacy links on the purchase screen. */}
        <View style={styles.legalLinks}>
          <Pressable onPress={() => router.push('/legal/terms')} hitSlop={8}>
            <ThemedText variant="labelSmall" color={colors.inkMuted}>
              Terms of Use
            </ThemedText>
          </Pressable>
          <ThemedText variant="labelSmall" color={colors.inkMuted}>
            ·
          </ThemedText>
          <Pressable onPress={() => router.push('/legal/privacy')} hitSlop={8}>
            <ThemedText variant="labelSmall" color={colors.inkMuted}>
              Privacy Policy
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>

      <Glass intensity={50} style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
        <Button
          label={
            selected.entitlement === currentTier.entitlement
              ? 'Your current plan'
              : `Continue with ${selected.name}`
          }
          onPress={onSubscribe}
          loading={busy}
          disabled={!selected.rcPackageId || selected.entitlement === currentTier.entitlement}
          variant="accent"
        />
        <Pressable onPress={() => restore()} hitSlop={8} style={styles.restore}>
          <ThemedText variant="labelSmall" color={colors.inkMuted}>
            Restore purchases
          </ThemedText>
        </Pressable>
      </Glass>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
    close: {
      alignSelf: 'flex-end',
      width: 40,
      height: 40,
      alignItems: 'center',
      justifyContent: 'center',
      borderRadius: radius.pill,
      backgroundColor: c.pearl,
    },
    header: { alignItems: 'center', marginTop: spacing.sm, marginBottom: spacing.xxl },
    heroGlowWrap: {
      position: 'absolute',
      top: -60,
      alignItems: 'center',
      justifyContent: 'center',
      width: '100%',
    },
    heroGlow: { width: 220, height: 220, borderRadius: 110 },
    sub: { marginTop: spacing.sm, maxWidth: 280 },
    plans: { gap: spacing.xl, marginTop: spacing.sm },
    planShadow: {
      borderRadius: radius.lg,
      shadowColor: c.ink,
      shadowOpacity: 0.08,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    planShadowSelected: {
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.28,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    planShadowRecommended: {
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.22,
      shadowRadius: 22,
      shadowOffset: { width: 0, height: 10 },
      elevation: 5,
    },
    plan: {
      borderWidth: 1.5,
      borderColor: c.border,
      padding: spacing.xl,
    },
    planSelected: { borderColor: c.pinkWarm },
    planRecommended: { borderColor: c.pinkWarmSoft },
    planCurrent: { borderColor: c.borderStrong, opacity: 0.75 },
    badge: {
      alignSelf: 'center',
      backgroundColor: c.pinkWarm,
      paddingHorizontal: spacing.md,
      paddingVertical: 6,
      borderRadius: radius.pill,
      marginBottom: -14,
      zIndex: 2,
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.35,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 4 },
      elevation: 6,
    },
    badgeText: { letterSpacing: 1.2 },
    planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    planTitleRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    planIcon: {
      width: 32,
      height: 32,
      borderRadius: radius.pill,
      backgroundColor: c.tissue,
      alignItems: 'center',
      justifyContent: 'center',
    },
    planIconRecommended: { backgroundColor: c.pinkWarm },
    priceRow: { flexDirection: 'row', alignItems: 'flex-end', marginTop: spacing.sm },
    pricePeriod: { marginLeft: 2, marginBottom: 3 },
    currentBadge: {
      backgroundColor: c.ink,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
    },
    perks: { marginTop: spacing.lg, gap: spacing.md },
    perk: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    perkText: { flex: 1 },
    fine: { marginTop: spacing.xxl, maxWidth: 340, alignSelf: 'center' },
    legalLinks: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    footer: {
      padding: spacing.lg,
      borderTopWidth: 1,
      borderTopColor: c.glassEdge,
      borderTopLeftRadius: radius.lg,
      borderTopRightRadius: radius.lg,
    },
    restore: { alignSelf: 'center', marginTop: spacing.md },
  });
