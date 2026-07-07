import React from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Card, ThemedText, Wordmark } from '@/components';
import { colors, radius, spacing, type } from '@/theme';
import { useSubscription } from '@/providers/SubscriptionProvider';

const TOOLS = [
  {
    key: 'stylist',
    href: '/style/stylist',
    icon: 'color-wand-outline',
    title: 'Style me',
    body: 'Pick pieces and let your AI stylist build the perfect outfit.',
  },
  {
    key: 'get-the-look',
    href: '/style/get-the-look',
    icon: 'camera-outline',
    title: 'Get the look',
    body: 'Snap any outfit and break it into shoppable pieces.',
  },
  {
    key: 'try-on',
    href: '/style/try-on',
    icon: 'body-outline',
    title: 'Virtual try-on',
    body: 'See a saved outfit on you before you commit.',
  },
] as const;

export default function CreateScreen() {
  const router = useRouter();
  const insets = useSafeAreaInsets();
  const { tier } = useSubscription();

  return (
    <ScrollView
      style={styles.root}
      contentContainerStyle={[styles.content, { paddingTop: insets.top + spacing.xl }]}
      showsVerticalScrollIndicator={false}
    >
      <ThemedText style={type.eyebrow} color={colors.blushDeep}>
        Create with
      </ThemedText>
      <Wordmark size={44} />
      <ThemedText variant="bodyItalic" color={colors.inkMuted} style={styles.intro}>
        Your private stylist, in your pocket. You're on the {tier.name} plan.
      </ThemedText>

      <View style={styles.tools}>
        {TOOLS.map((t) => (
          <Pressable key={t.key} onPress={() => router.push(t.href as any)}>
            <Card style={styles.tool}>
              <View style={styles.toolIcon}>
                <Ionicons name={t.icon as any} size={26} color={colors.ink} />
              </View>
              <View style={styles.toolText}>
                <ThemedText variant="h3">{t.title}</ThemedText>
                <ThemedText variant="labelSmall" color={colors.inkMuted}>
                  {t.body}
                </ThemedText>
              </View>
              <Ionicons name="chevron-forward" size={22} color={colors.blushDeep} />
            </Card>
          </Pressable>
        ))}
      </View>

      <Pressable style={styles.upsell} onPress={() => router.push('/paywall')}>
        <Ionicons name="star" size={18} color={colors.pinkWarm} />
        <ThemedText variant="label" color={colors.ink} style={styles.upsellText}>
          {tier.entitlement === 'business'
            ? "You're on our top plan — enjoy!"
            : 'Unlock more outfits & try-ons'}
        </ThemedText>
        {tier.entitlement !== 'business' ? (
          <ThemedText variant="label" color={colors.pinkWarm}>
            Upgrade
          </ThemedText>
        ) : null}
      </Pressable>
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
  intro: { marginTop: spacing.sm, marginBottom: spacing.xl, maxWidth: 320 },
  tools: { gap: spacing.md },
  tool: { flexDirection: 'row', alignItems: 'center', gap: spacing.lg },
  toolIcon: {
    width: 52,
    height: 52,
    borderRadius: 26,
    backgroundColor: colors.pinkWarmGlow,
    alignItems: 'center',
    justifyContent: 'center',
  },
  toolText: { flex: 1, gap: 2 },
  upsell: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginTop: spacing.xl,
    padding: spacing.lg,
    borderRadius: radius.md,
    backgroundColor: colors.pinkWarmGlow,
    borderWidth: 1,
    borderColor: colors.pinkWarmSoft,
  },
  upsellText: { flex: 1 },
});
