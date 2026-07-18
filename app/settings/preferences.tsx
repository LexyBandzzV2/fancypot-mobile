import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StackHeader, Button, ThemedText, Card } from '@/components';
import { radius, spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme, type ThemePreference } from '@/providers/ThemeProvider';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';
import { STYLES, STORES, BUDGETS, resolveSavedBudgets } from '@/lib/brands';

const APPEARANCE_OPTIONS: { value: ThemePreference; label: string }[] = [
  { value: 'light', label: 'Light' },
  { value: 'dark', label: 'Dark' },
  { value: 'system', label: 'System' },
];

/** Style profile editor — writes profiles.preferences (jsonb), same shape as web. */
export default function Preferences() {
  const router = useRouter();
  const styles = useThemedStyles(makeStyles);
  const { user, profile, refreshProfile } = useAuth();
  const prefs = (profile?.preferences ?? {}) as {
    styles?: string[];
    stores?: string[];
    budget?: string;
    budgets?: string[];
  };
  const [styles_, setStyles] = useState<string[]>(prefs.styles ?? []);
  const [stores, setStores] = useState<string[]>(prefs.stores ?? []);
  // Multi-select price ranges. Reads both the new `budgets` array and the
  // legacy single `budget` (ceiling → that tier and cheaper). Empty = show all.
  const [budgets, setBudgets] = useState<string[]>(resolveSavedBudgets(prefs));
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      // Mirror the multi-select into the legacy single `budget` for the shared
      // web backend: use the highest selected tier (or Luxury when nothing is
      // selected, i.e. show-all) so the web app's ceiling model never hides
      // more than the mobile selection does.
      const legacyBudget =
        budgets.length === 0 ? 'Luxury' : (BUDGETS.filter((b) => budgets.includes(b)).pop() ?? 'Luxury');
      const { error } = await supabase
        .from('profiles')
        .update({
          preferences: { ...prefs, styles: styles_, stores, budgets, budget: legacyBudget, completed: true },
        })
        .eq('user_id', user.id);
      if (error) throw error;
      await refreshProfile();
      router.back();
    } catch (e: any) {
      Alert.alert('Could not save', e?.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <View style={styles.root}>
      <StackHeader title="Style preferences" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        <Section
          title="BUDGET"
          hint="Pick every price range you want to see — mix cheap and luxury freely. Leave all off to see everything."
        >
          <Chips
            options={BUDGETS}
            selected={budgets}
            onToggle={(v) => toggle(budgets, setBudgets, v)}
          />
        </Section>
        <Section title="YOUR STYLES">
          <Chips options={STYLES} selected={styles_} onToggle={(v) => toggle(styles_, setStyles, v)} />
        </Section>
        <Section title="FAVORITE STORES">
          <Chips options={STORES} selected={stores} onToggle={(v) => toggle(stores, setStores, v)} />
        </Section>
        <Section title="APPEARANCE">
          <AppearanceSelector />
        </Section>
      </ScrollView>
      <View style={styles.footer}>
        <Button label="Save preferences" onPress={save} loading={saving} />
      </View>
    </View>
  );
}

/** Three-way Light / Dark / System selector, backed by ThemeProvider's persisted preference. */
function AppearanceSelector() {
  const { colors, preference, setPreference } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Card style={styles.appearanceCard}>
      <View style={styles.appearanceRow}>
        {APPEARANCE_OPTIONS.map((opt) => {
          const on = preference === opt.value;
          return (
            <Pressable
              key={opt.value}
              onPress={() => setPreference(opt.value)}
              style={[styles.appearancePill, on && styles.appearancePillOn]}
              accessibilityRole="button"
              accessibilityState={{ selected: on }}
            >
              <ThemedText variant="label" color={on ? colors.cream : colors.ink}>
                {opt.label}
              </ThemedText>
            </Pressable>
          );
        })}
      </View>
    </Card>
  );
}

function Section({
  title,
  hint,
  children,
}: {
  title: string;
  hint?: string;
  children: React.ReactNode;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.section}>
      <ThemedText variant="label" color={colors.inkMuted} style={styles.sectionTitle}>
        {title}
      </ThemedText>
      {hint ? (
        <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.sectionHint}>
          {hint}
        </ThemedText>
      ) : null}
      {children}
    </View>
  );
}

function Chips({
  options,
  selected,
  onToggle,
  single,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
  single?: boolean;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <View style={styles.chips}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <Pressable key={o} onPress={() => onToggle(o)} style={[styles.chip, on && styles.chipOn]}>
            <ThemedText variant="label" color={on ? colors.cream : colors.ink}>
              {o}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    section: { marginBottom: spacing.xl },
    sectionTitle: { marginBottom: spacing.md, letterSpacing: 1 },
    sectionHint: { marginTop: -spacing.sm, marginBottom: spacing.md, lineHeight: 18 },
    chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    chip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.white,
      minHeight: 40,
      justifyContent: 'center',
    },
    chipOn: { backgroundColor: c.ink, borderColor: c.ink },
    footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: c.border },
    appearanceCard: { padding: spacing.xs },
    appearanceRow: {
      flexDirection: 'row',
      gap: spacing.sm,
    },
    appearancePill: {
      flex: 1,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    appearancePillOn: { backgroundColor: c.ink },
  });
