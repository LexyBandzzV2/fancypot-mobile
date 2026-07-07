import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Button, ThemedText, Wordmark } from '@/components';
import { colors, radius, spacing, type } from '@/theme';
import { ORDERED_TIERS, type Tier } from '@/lib/plans';
import { useSubscription } from '@/providers/SubscriptionProvider';

export default function Paywall() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
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
          <Ionicons name="close" size={26} color={colors.ink} />
        </Pressable>

        <View style={styles.header}>
          <ThemedText style={type.eyebrow} color={colors.blushDeep} center>
            Upgrade your stylist
          </ThemedText>
          <Wordmark size={40} />
          <ThemedText variant="bodyItalic" color={colors.inkMuted} center style={styles.sub}>
            More outfits, more try-ons, no ads.
          </ThemedText>
        </View>

        {ORDERED_TIERS.map((t) => {
          const isCurrent = t.entitlement === currentTier.entitlement;
          const isSelected = t.entitlement === selected.entitlement;
          const selectable = !!t.rcPackageId && !isCurrent;
          return (
            <Pressable
              key={t.entitlement}
              onPress={() => selectable && setSelected(t)}
              style={[
                styles.plan,
                isSelected && selectable && styles.planSelected,
                isCurrent && styles.planCurrent,
              ]}
            >
              <View style={styles.planHeader}>
                <View>
                  <ThemedText variant="h3">{t.name}</ThemedText>
                  <ThemedText variant="label" color={colors.inkMuted}>
                    {t.priceLabel}
                  </ThemedText>
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
              <View style={styles.perks}>
                {t.perks.map((p) => (
                  <View key={p} style={styles.perk}>
                    <Ionicons name="checkmark" size={16} color={colors.blushDeep} />
                    <ThemedText variant="labelSmall" color={colors.ink}>
                      {p}
                    </ThemedText>
                  </View>
                ))}
              </View>
            </Pressable>
          );
        })}

        <ThemedText variant="labelSmall" color={colors.inkMuted} center style={styles.fine}>
          Payment is charged to your App Store / Google Play account. Subscriptions
          auto-renew unless turned off at least 24 hours before the period ends. Manage
          or cancel anytime in your store account settings. Prices may vary by region.
        </ThemedText>

        {/* Apple 3.1.2 / Google Play: functional Terms + Privacy links on the purchase screen. */}
        <View style={styles.legalLinks}>
          <Pressable onPress={() => router.push('/legal/terms')} hitSlop={8}>
            <ThemedText variant="labelSmall" color={colors.blushDeep}>
              Terms of Use
            </ThemedText>
          </Pressable>
          <ThemedText variant="labelSmall" color={colors.inkMuted}>
            ·
          </ThemedText>
          <Pressable onPress={() => router.push('/legal/privacy')} hitSlop={8}>
            <ThemedText variant="labelSmall" color={colors.blushDeep}>
              Privacy Policy
            </ThemedText>
          </Pressable>
        </View>
      </ScrollView>

      <View style={[styles.footer, { paddingBottom: insets.bottom + spacing.md }]}>
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
          <ThemedText variant="labelSmall" color={colors.blushDeep}>
            Restore purchases
          </ThemedText>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: spacing.lg, paddingBottom: spacing.xxl },
  close: { alignSelf: 'flex-end', width: 44, height: 44, alignItems: 'center', justifyContent: 'center' },
  header: { alignItems: 'center', marginBottom: spacing.lg },
  sub: { marginTop: spacing.xs },
  plan: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 2,
    borderColor: colors.border,
    padding: spacing.lg,
    marginBottom: spacing.md,
  },
  planSelected: { borderColor: colors.pinkWarm },
  planCurrent: { borderColor: colors.ink, opacity: 0.85 },
  planHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  currentBadge: {
    backgroundColor: colors.ink,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
  },
  perks: { marginTop: spacing.md, gap: spacing.sm },
  perk: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
  fine: { marginTop: spacing.md, maxWidth: 340, alignSelf: 'center' },
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
    borderTopColor: colors.border,
    backgroundColor: colors.cream,
  },
  restore: { alignSelf: 'center', marginTop: spacing.md },
});
