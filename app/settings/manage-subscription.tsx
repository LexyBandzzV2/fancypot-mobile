import React from 'react';
import { View, StyleSheet, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { StackHeader, Card, Button, ThemedText } from '@/components';
import { spacing, radius, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';

/**
 * RevenueCat purchases are billed and cancelled through the platform store, so
 * "manage" deep-links into the native subscription settings.
 */
export default function ManageSubscription() {
  const router = useRouter();
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { tier, restore } = useSubscription();

  const openStore = () => {
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions';
    Linking.openURL(url);
  };

  const [price, cadence] = tier.priceLabel.includes('/')
    ? tier.priceLabel.split('/')
    : [tier.priceLabel, null];

  return (
    <View style={styles.root}>
      <StackHeader title="Manage subscription" />
      <View style={styles.content}>
        <Card style={styles.hero}>
          <View style={styles.heroTop}>
            <ThemedText variant="eyebrow" color={colors.pinkWarm}>
              CURRENT PLAN
            </ThemedText>
            <View style={styles.badge}>
              <ThemedText variant="labelSmall" color={colors.pinkWarm}>
                {tier.name}
              </ThemedText>
            </View>
          </View>

          <View style={styles.priceRow}>
            <ThemedText variant="h1" style={styles.price}>
              {price}
            </ThemedText>
            {cadence ? (
              <ThemedText variant="body" color={colors.inkMuted} style={styles.cadence}>
                /{cadence}
              </ThemedText>
            ) : null}
          </View>

          <View style={styles.divider} />

          <View style={styles.perks}>
            {tier.perks.map((p) => (
              <View key={p} style={styles.perkRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.pinkWarm} />
                <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.perkText}>
                  {p}
                </ThemedText>
              </View>
            ))}
          </View>
        </Card>

        <View style={styles.actions}>
          {tier.entitlement !== 'business' ? (
            <Button label="Upgrade plan" variant="accent" onPress={() => router.push('/paywall')} />
          ) : null}
          <View style={{ height: spacing.sm }} />
          <Button label="Cancel or change in store" variant="outline" onPress={openStore} />
          <View style={{ height: spacing.sm }} />
          <Button label="Restore purchases" variant="ghost" onPress={() => restore()} />
        </View>
      </View>
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    content: { padding: spacing.lg },
    hero: { padding: spacing.xl },
    heroTop: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
    },
    badge: {
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
      backgroundColor: c.pinkWarmGlow,
    },
    priceRow: {
      flexDirection: 'row',
      alignItems: 'flex-end',
      marginTop: spacing.sm,
      marginBottom: spacing.lg,
    },
    price: { marginRight: spacing.xs },
    cadence: { marginBottom: spacing.xs },
    divider: { height: 1, backgroundColor: c.border, marginBottom: spacing.lg },
    perks: { gap: spacing.sm },
    perkRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    perkText: { flex: 1 },
    actions: { marginTop: spacing.xl },
  });
