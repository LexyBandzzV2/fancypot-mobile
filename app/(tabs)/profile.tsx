import React from 'react';
import { View, StyleSheet, Pressable, ScrollView, Alert, Linking } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, ThemedText, Button } from '@/components';
import { colors, radius, spacing } from '@/theme';
import { useAuth } from '@/providers/AuthProvider';
import { useSubscription } from '@/providers/SubscriptionProvider';

const SUPPORT_EMAIL = 'support@fancypot.org';

export default function ProfileScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { user, profile, signOut } = useAuth();
  const { tier, restore } = useSubscription();

  const initials = (profile?.display_name ?? user?.email ?? 'F')
    .slice(0, 1)
    .toUpperCase();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      {/* Account card */}
      <Card style={styles.accountCard}>
        <View style={styles.avatar}>
          <ThemedText variant="h2" color={colors.cream}>
            {initials}
          </ThemedText>
        </View>
        <View style={styles.accountInfo}>
          <ThemedText variant="h3" numberOfLines={1}>
            {profile?.display_name ?? 'Your account'}
          </ThemedText>
          <ThemedText variant="labelSmall" color={colors.inkMuted} numberOfLines={1}>
            {user?.email}
          </ThemedText>
        </View>
        <View style={styles.planBadge}>
          <ThemedText variant="labelSmall" color={colors.pinkWarm}>
            {tier.name}
          </ThemedText>
        </View>
      </Card>

      {/* Plan / usage */}
      <ThemedText variant="label" color={colors.inkMuted} style={styles.sectionTitle}>
        YOUR PLAN
      </ThemedText>
      <Card>
        <Row
          icon="pricetags-outline"
          label={`${tier.name} — ${tier.priceLabel}`}
          value={`${tier.limits.outfitsPerMonth} outfits/mo`}
        />
        <Divider />
        <Button
          label={tier.entitlement === 'business' ? 'Manage subscription' : 'Upgrade plan'}
          variant={tier.entitlement === 'business' ? 'outline' : 'accent'}
          onPress={() =>
            tier.entitlement === 'business'
              ? router.push('/settings/manage-subscription')
              : router.push('/paywall')
          }
        />
        <View style={styles.restore}>
          <Pressable onPress={() => restore()} hitSlop={8}>
            <ThemedText variant="labelSmall" color={colors.blushDeep}>
              Restore purchases
            </ThemedText>
          </Pressable>
        </View>
      </Card>

      {/* Preferences */}
      <ThemedText variant="label" color={colors.inkMuted} style={styles.sectionTitle}>
        SETTINGS
      </ThemedText>
      <Card padded={false}>
        <LinkRow
          icon="options-outline"
          label="Style preferences"
          onPress={() => router.push('/settings/preferences')}
        />
        <Divider />
        <LinkRow
          icon={profile?.phone_verified ? 'checkmark-circle-outline' : 'call-outline'}
          label={profile?.phone_verified ? 'Phone verified' : 'Verify phone number'}
          onPress={() => router.push('/verify-phone')}
        />
      </Card>

      {/* Legal / support */}
      <ThemedText variant="label" color={colors.inkMuted} style={styles.sectionTitle}>
        SUPPORT
      </ThemedText>
      <Card padded={false}>
        <LinkRow icon="help-circle-outline" label="Contact support" onPress={() => Linking.openURL(`mailto:${SUPPORT_EMAIL}`)} />
        <Divider />
        <LinkRow icon="document-text-outline" label="Privacy policy" onPress={() => router.push('/legal/privacy')} />
        <Divider />
        <LinkRow icon="reader-outline" label="Terms of use" onPress={() => router.push('/legal/terms')} />
      </Card>

      {/* Danger zone */}
      <View style={styles.danger}>
        <Button label="Sign out" variant="outline" onPress={signOut} />
        <Pressable
          onPress={() => router.push('/settings/delete-account')}
          style={styles.deleteLink}
          hitSlop={8}
        >
          <ThemedText variant="labelSmall" color={colors.danger}>
            Delete account
          </ThemedText>
        </Pressable>
      </View>
    </ScrollView>
  );
}

function Row({ icon, label, value }: { icon: any; label: string; value?: string }) {
  return (
    <View style={styles.row}>
      <Ionicons name={icon} size={20} color={colors.ink} />
      <ThemedText variant="body" style={styles.rowLabel}>
        {label}
      </ThemedText>
      {value ? (
        <ThemedText variant="labelSmall" color={colors.inkMuted}>
          {value}
        </ThemedText>
      ) : null}
    </View>
  );
}

function LinkRow({ icon, label, onPress }: { icon: any; label: string; onPress: () => void }) {
  return (
    <Pressable
      onPress={onPress}
      style={({ pressed }) => [styles.linkRow, pressed && { opacity: 0.6 }]}
      accessibilityRole="button"
    >
      <Ionicons name={icon} size={20} color={colors.ink} />
      <ThemedText variant="body" style={styles.rowLabel}>
        {label}
      </ThemedText>
      <Ionicons name="chevron-forward" size={18} color={colors.borderStrong} />
    </Pressable>
  );
}

function Divider() {
  return <View style={styles.divider} />;
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  accountCard: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
  avatar: {
    width: 56,
    height: 56,
    borderRadius: 28,
    backgroundColor: colors.ink,
    alignItems: 'center',
    justifyContent: 'center',
  },
  accountInfo: { flex: 1 },
  planBadge: {
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.xs,
    borderRadius: radius.pill,
    backgroundColor: colors.pinkWarmGlow,
  },
  sectionTitle: { marginTop: spacing.xl, marginBottom: spacing.sm, letterSpacing: 1 },
  row: { flexDirection: 'row', alignItems: 'center', gap: spacing.md, paddingVertical: spacing.sm },
  rowLabel: { flex: 1 },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingHorizontal: spacing.lg,
  },
  divider: { height: 1, backgroundColor: colors.border, marginLeft: spacing.lg },
  restore: { alignItems: 'center', marginTop: spacing.md },
  danger: { marginTop: spacing.xxl, gap: spacing.md, alignItems: 'center' },
  deleteLink: { padding: spacing.sm },
});
