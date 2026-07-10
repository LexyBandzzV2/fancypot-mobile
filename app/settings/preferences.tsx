import React, { useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, Alert } from 'react-native';
import { useRouter } from 'expo-router';
import { StackHeader, Button, ThemedText } from '@/components';
import { colors, radius, spacing } from '@/theme';
import { supabase } from '@/lib/supabase';
import { useAuth } from '@/providers/AuthProvider';

const STYLES = ['Classic', 'Minimal', 'Trendy', 'Streetwear', 'Romantic', 'Edgy', 'Preppy', 'Boho'];
const STORES = [
  'H&M',
  'Zara',
  'Aritzia',
  'Revolve',
  'ASOS',
  'Nike',
  'Lululemon',
  'Urban Outfitters',
  'Mango',
  'Uniqlo',
  'Nordstrom',
  'Reformation',
  'SSENSE',
  'Free People',
];
const BUDGETS = ['Budget', 'Mid-range', 'Premium', 'Luxury'];

/** Style profile editor — writes profiles.preferences (jsonb), same shape as web. */
export default function Preferences() {
  const router = useRouter();
  const { user, profile, refreshProfile } = useAuth();
  const prefs = (profile?.preferences ?? {}) as {
    styles?: string[];
    stores?: string[];
    budget?: string;
  };
  const [styles_, setStyles] = useState<string[]>(prefs.styles ?? []);
  const [stores, setStores] = useState<string[]>(prefs.stores ?? []);
  const [budget, setBudget] = useState<string>(prefs.budget ?? 'Mid-range');
  const [saving, setSaving] = useState(false);

  const toggle = (list: string[], set: (v: string[]) => void, value: string) =>
    set(list.includes(value) ? list.filter((v) => v !== value) : [...list, value]);

  const save = async () => {
    if (!user) return;
    setSaving(true);
    try {
      const { error } = await supabase
        .from('profiles')
        .update({ preferences: { ...prefs, styles: styles_, stores, budget, completed: true } })
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
    <View style={s.root}>
      <StackHeader title="Style preferences" />
      <ScrollView contentContainerStyle={s.content} showsVerticalScrollIndicator={false}>
        <Section title="YOUR STYLES">
          <Chips options={STYLES} selected={styles_} onToggle={(v) => toggle(styles_, setStyles, v)} />
        </Section>
        <Section title="FAVORITE STORES">
          <Chips options={STORES} selected={stores} onToggle={(v) => toggle(stores, setStores, v)} />
        </Section>
        <Section title="BUDGET">
          <Chips options={BUDGETS} selected={[budget]} onToggle={setBudget} single />
        </Section>
      </ScrollView>
      <View style={s.footer}>
        <Button label="Save preferences" onPress={save} loading={saving} />
      </View>
    </View>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <ThemedText variant="label" color={colors.inkMuted} style={s.sectionTitle}>
        {title}
      </ThemedText>
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
  return (
    <View style={s.chips}>
      {options.map((o) => {
        const on = selected.includes(o);
        return (
          <Pressable key={o} onPress={() => onToggle(o)} style={[s.chip, on && s.chipOn]}>
            <ThemedText variant="label" color={on ? colors.cream : colors.ink}>
              {o}
            </ThemedText>
          </Pressable>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  section: { marginBottom: spacing.xl },
  sectionTitle: { marginBottom: spacing.md, letterSpacing: 1 },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
  chip: {
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.sm,
    borderRadius: radius.pill,
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    minHeight: 40,
    justifyContent: 'center',
  },
  chipOn: { backgroundColor: colors.ink, borderColor: colors.ink },
  footer: { padding: spacing.lg, borderTopWidth: 1, borderTopColor: colors.border },
});
