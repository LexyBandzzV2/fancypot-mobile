import React from 'react';
import { View, StyleSheet, Platform, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { StackHeader, Card, Button, ThemedText } from '@/components';
import { colors, spacing } from '@/theme';
import { useSubscription } from '@/providers/SubscriptionProvider';

/**
 * RevenueCat purchases are billed and cancelled through the platform store, so
 * "manage" deep-links into the native subscription settings.
 */
export default function ManageSubscription() {
  const router = useRouter();
  const { tier, restore } = useSubscription();

  const openStore = () => {
    const url =
      Platform.OS === 'ios'
        ? 'https://apps.apple.com/account/subscriptions'
        : 'https://play.google.com/store/account/subscriptions';
    Linking.openURL(url);
  };

  return (
    <View style={styles.root}>
      <StackHeader title="Manage subscription" />
      <View style={styles.content}>
        <Card>
          <ThemedText variant="labelSmall" color={colors.inkMuted}>
            CURRENT PLAN
          </ThemedText>
          <ThemedText variant="h2" style={styles.plan}>
            {tier.name} · {tier.priceLabel}
          </ThemedText>
          <View style={styles.perks}>
            {tier.perks.map((p) => (
              <ThemedText key={p} variant="labelSmall" color={colors.inkMuted}>
                • {p}
              </ThemedText>
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

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg },
  plan: { marginTop: spacing.xs, marginBottom: spacing.md },
  perks: { gap: spacing.xs },
  actions: { marginTop: spacing.xl },
});
