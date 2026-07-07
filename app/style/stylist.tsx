import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { StackHeader, Button, ThemedText, EmptyState } from '@/components';
import { colors, radius, spacing, fillObject } from '@/theme';
import { useWardrobe } from '@/hooks/useWardrobe';
import { useOutfits } from '@/hooks/useOutfits';
import { useAIAction } from '@/hooks/useAIAction';
import { generateOutfit } from '@/lib/api';

const OCCASIONS = ['Everyday', 'Work', 'Date night', 'Party', 'Weekend', 'Formal'];
const VIBES = ['Classic', 'Trendy', 'Cozy', 'Bold', 'Minimal', 'Romantic'];

export default function StylistScreen() {
  const { items } = useWardrobe();
  const { save } = useOutfits();
  const { run, running } = useAIAction();
  const [selected, setSelected] = useState<string[]>([]);
  const [occasion, setOccasion] = useState<string>('Everyday');
  const [vibe, setVibe] = useState<string>('Classic');
  const [result, setResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);

  const toggle = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  const onGenerate = async () => {
    setResult(null);
    setSaved(false);
    const res = await run(() =>
      generateOutfit({ itemIds: selected, occasion, vibe }),
    );
    if (res?.image_url) setResult(res.image_url);
  };

  const onSave = async () => {
    if (!result) return;
    await save({ name: `${vibe} ${occasion}`, image_url: result, item_ids: selected, occasion });
    setSaved(true);
  };

  return (
    <View style={styles.root}>
      <StackHeader title="Style me" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {result ? (
          <View style={styles.resultWrap}>
            <Image source={{ uri: result }} style={styles.result} contentFit="cover" transition={250} />
            <View style={styles.resultActions}>
              <Button
                label={saved ? 'Saved to library' : 'Save to library'}
                onPress={onSave}
                variant={saved ? 'outline' : 'primary'}
                disabled={saved}
              />
              <View style={{ height: spacing.sm }} />
              <Button label="Start over" variant="ghost" onPress={() => setResult(null)} />
            </View>
          </View>
        ) : (
          <>
            <ThemedText variant="label" color={colors.inkMuted} style={styles.sectionLabel}>
              PICK PIECES
            </ThemedText>
            {items.length === 0 ? (
              <View style={styles.empty}>
                <EmptyState
                  icon="shirt-outline"
                  title="Add pieces first"
                  body="Your closet is empty — add a few pieces to style an outfit."
                />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pieces}>
                {items.map((it) => {
                  const on = selected.includes(it.id);
                  return (
                    <Pressable key={it.id} onPress={() => toggle(it.id)} style={styles.pieceWrap}>
                      <View style={[styles.piece, on && styles.pieceOn]}>
                        {it.signedUrl ? (
                          <Image source={{ uri: it.signedUrl }} style={styles.pieceImg} contentFit="cover" />
                        ) : (
                          <View style={[styles.pieceImg, styles.piecePh]}>
                            <Ionicons name="shirt-outline" size={22} color={colors.blushDeep} />
                          </View>
                        )}
                        {on ? (
                          <View style={styles.check}>
                            <Ionicons name="checkmark" size={16} color={colors.cream} />
                          </View>
                        ) : null}
                      </View>
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            <ThemedText variant="label" color={colors.inkMuted} style={styles.sectionLabel}>
              OCCASION
            </ThemedText>
            <ChipRow options={OCCASIONS} value={occasion} onChange={setOccasion} />

            <ThemedText variant="label" color={colors.inkMuted} style={styles.sectionLabel}>
              VIBE
            </ThemedText>
            <ChipRow options={VIBES} value={vibe} onChange={setVibe} />
          </>
        )}
      </ScrollView>

      {!result ? (
        <View style={styles.footer}>
          <Button
            label={running ? 'Styling your look…' : 'Generate outfit'}
            onPress={onGenerate}
            loading={running}
            disabled={selected.length === 0}
            icon={!running ? <Ionicons name="color-wand" size={18} color={colors.cream} /> : undefined}
          />
        </View>
      ) : null}

      {running ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.pinkWarm} />
        </View>
      ) : null}
    </View>
  );
}

function ChipRow({
  options,
  value,
  onChange,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => {
        const on = o === value;
        return (
          <Pressable key={o} onPress={() => onChange(o)} style={[styles.chip, on && styles.chipOn]}>
            <ThemedText variant="label" color={on ? colors.cream : colors.ink}>
              {o}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
  sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 1 },
  empty: { height: 200 },
  pieces: { gap: spacing.sm, paddingVertical: spacing.xs },
  pieceWrap: {},
  piece: {
    width: 92,
    height: 112,
    borderRadius: radius.md,
    borderWidth: 2,
    borderColor: colors.border,
    overflow: 'hidden',
    backgroundColor: colors.white,
  },
  pieceOn: { borderColor: colors.pinkWarm },
  pieceImg: { width: '100%', height: '100%' },
  piecePh: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pearl },
  check: {
    position: 'absolute',
    top: 6,
    right: 6,
    width: 24,
    height: 24,
    borderRadius: 12,
    backgroundColor: colors.pinkWarm,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: { gap: spacing.sm, paddingVertical: spacing.xs },
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
  footer: {
    padding: spacing.lg,
    borderTopWidth: 1,
    borderTopColor: colors.border,
    backgroundColor: colors.cream,
  },
  resultWrap: { gap: spacing.lg },
  result: { width: '100%', aspectRatio: 0.8, borderRadius: radius.lg, backgroundColor: colors.pearl },
  resultActions: {},
  overlay: {
    ...fillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250,243,231,0.5)',
  },
});
