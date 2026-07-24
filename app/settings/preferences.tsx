import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StackHeader, Button, ResponsiveContent, ThemedText, Chip, ChipWrap, SectionLabel } from '@/components';
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
        <ResponsiveContent>
          {/* Order runs shortest → longest so the long store list stays last:
              Appearance, Your Styles, Budget, then Favorite Stores. Everything is
              center-aligned for the editorial "mean girl" look. */}
          <SectionLabel center style={styles.firstLabel}>APPEARANCE</SectionLabel>
          <AppearanceSelector />
          <SectionLabel center>YOUR STYLES</SectionLabel>
          <OptionChips
            options={STYLES}
            selected={styles_}
            onToggle={(v) => toggle(styles_, setStyles, v)}
          />
          <SectionLabel center hint="Leave all off to see every price.">BUDGET</SectionLabel>
          <OptionChips
            options={BUDGETS}
            selected={budgets}
            onToggle={(v) => toggle(budgets, setBudgets, v)}
          />
          <SectionLabel center hint="Optional.">FAVORITE STORES</SectionLabel>
          <OptionChips
            options={STORES}
            selected={stores}
            onToggle={(v) => toggle(stores, setStores, v)}
          />
        </ResponsiveContent>
      </ScrollView>
      <View style={styles.footer}>
        <ResponsiveContent>
          <Button label="Save preferences" onPress={save} loading={saving} />
        </ResponsiveContent>
      </View>
    </View>
  );
}

/** Blush pill chips for one option group — the shared web-styled Chip. */
function OptionChips({
  options,
  selected,
  onToggle,
}: {
  options: string[];
  selected: string[];
  onToggle: (v: string) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <ChipWrap style={styles.chips}>
      {options.map((o) => (
        <Chip key={o} label={o} selected={selected.includes(o)} onPress={() => onToggle(o)} />
      ))}
    </ChipWrap>
  );
}

/** Three-way Light / Dark / System selector, backed by ThemeProvider's persisted preference. */
function AppearanceSelector() {
  const { colors, preference, setPreference } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
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
            <ThemedText variant="label" color={on ? colors.white : colors.ink}>
              {opt.label}
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
    firstLabel: { marginTop: 0 },
    // Center the wrapped chips (incl. a lone chip on the last row) for the
    // middle-aligned look rather than the generic left-aligned grid.
    chips: { marginBottom: spacing.md, justifyContent: 'center' },
    footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: c.border },
    // Segmented pill on a blush track — same pink-fill selection language as
    // the web chips (the web app has no appearance control; this keeps ours,
    // restyled to match).
    appearanceRow: {
      flexDirection: 'row',
      gap: spacing.xs,
      backgroundColor: c.pinkWarmGlow,
      borderRadius: radius.pill,
      padding: spacing.xs,
      marginBottom: spacing.md,
    },
    appearancePill: {
      flex: 1,
      paddingVertical: spacing.sm,
      minHeight: 40,
      borderRadius: radius.pill,
      alignItems: 'center',
      justifyContent: 'center',
    },
    appearancePillOn: { backgroundColor: c.pinkWarm },
  });
