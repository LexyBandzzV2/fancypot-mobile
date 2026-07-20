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
import { StackHeader, Button, Chip, ThemedText, EmptyState, Card, SectionLabel } from '@/components';
import { Glass } from '@/components/Glass';
import { radius, spacing, fillObject, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useWardrobe } from '@/hooks/useWardrobe';
import { useOutfits } from '@/hooks/useOutfits';
import { useAIAction } from '@/hooks/useAIAction';
import { useAds } from '@/providers/AdsProvider';
import { generateOutfit, recommendPieces } from '@/lib/api';
import { openProductUrl } from '@/lib/affiliate';

const OCCASIONS = ['Everyday', 'Work', 'Date night', 'Party', 'Weekend', 'Formal'];
const VIBES = ['Classic', 'Trendy', 'Cozy', 'Bold', 'Minimal', 'Romantic'];

type Mode = 'mix' | 'pick' | 'mood' | 'cook';

const MODES: { key: Mode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'mix', label: 'Mix me up', icon: 'shuffle' },
  { key: 'pick', label: 'Pick a piece', icon: 'pricetag-outline' },
  { key: 'mood', label: 'Set the mood', icon: 'sparkles-outline' },
  { key: 'cook', label: 'Let it cook', icon: 'flame-outline' },
];

type PieceSuggestion = Awaited<ReturnType<typeof recommendPieces>>[number];

interface GenerateParams {
  itemIds: string[];
  items: string[];
  occasion: string;
  vibe: string;
}

export default function StylistScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { items, loading: closetLoading } = useWardrobe();
  const { save } = useOutfits();
  const { run, running } = useAIAction();
  const { maybeShowInterstitial } = useAds();
  const [mode, setMode] = useState<Mode>('mood');
  const [selected, setSelected] = useState<string[]>([]);
  const [occasion, setOccasion] = useState<string>('Everyday');
  const [vibe, setVibe] = useState<string>('Classic');
  const [result, setResult] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [lastParams, setLastParams] = useState<GenerateParams | null>(null);
  const [suggestion, setSuggestion] = useState<PieceSuggestion | null>(null);

  // Distinguish "closet still loading" from "closet genuinely empty" — showing
  // the empty state during a slow load reads as pieces having vanished.
  const isEmpty = items.length === 0 && !closetLoading;
  const isLoadingCloset = items.length === 0 && closetLoading;

  const changeMode = (m: Mode) => {
    setMode(m);
    setSelected([]);
  };

  // "Set the mood" keeps the classic multi-select toggle.
  const toggleMulti = (id: string) =>
    setSelected((prev) => (prev.includes(id) ? prev.filter((x) => x !== id) : [...prev, id]));

  // "Pick a piece" is single-select — tapping again clears it.
  const togglePick = (id: string) =>
    setSelected((prev) => (prev[0] === id ? [] : [id]));

  const onTogglePiece = mode === 'pick' ? togglePick : toggleMulti;

  // The backend styles from IMAGE refs (paths/URLs), which the web app sends;
  // ids alone read server-side as "no items". Send both, mapped from the same
  // pieces, so either contract works.
  const withImages = (ids: string[]): GenerateParams => ({
    itemIds: ids,
    items: ids
      .map((id) => items.find((i) => i.id === id)?.image_url)
      .filter((u): u is string => !!u),
    occasion,
    vibe,
  });

  const buildParams = (): GenerateParams => {
    if (mode === 'mix') {
      return withImages(items.map((i) => i.id));
    }
    if (mode === 'pick') {
      return withImages(selected.slice(0, 1));
    }
    if (mode === 'cook') {
      const shuffled = [...items].sort(() => Math.random() - 0.5);
      const count = Math.min(shuffled.length, 3 + Math.floor(Math.random() * 3)); // 3-5
      const randomVibe = VIBES[Math.floor(Math.random() * VIBES.length)];
      return { ...withImages(shuffled.slice(0, count).map((i) => i.id)), vibe: randomVibe };
    }
    // mood: picking pieces is optional — no selection means "style from my
    // whole closet", not an error.
    return withImages(selected.length > 0 ? selected : items.map((i) => i.id));
  };

  const canGenerate = (() => {
    if (isEmpty) return false;
    if (mode === 'pick') return selected.length === 1;
    return true;
  })();

  const generateLabel = running
    ? 'Styling your look…'
    : mode === 'mix'
      ? 'Mix me up'
      : mode === 'pick'
        ? 'Build around this piece'
        : mode === 'cook'
          ? 'Let it cook'
          : 'Generate outfit';

  const fetchSuggestion = async (imageUrl: string) => {
    // Best-effort only: never surface an error here (over-limit, rate-limited,
    // network failure, whatever) — the card just doesn't appear.
    try {
      const recs = await recommendPieces(imageUrl);
      if (recs && recs.length > 0) setSuggestion(recs[0]);
    } catch {
      // swallow
    }
  };

  const onGenerate = async () => {
    setResult(null);
    setSaved(false);
    setSuggestion(null);
    const params = buildParams();
    const res = await run(() => generateOutfit(params));
    if (res?.image_url) {
      setResult(res.image_url);
      setLastParams(params);
      fetchSuggestion(res.image_url);
    }
  };

  const onSave = async () => {
    if (!result) return;
    const p = lastParams ?? { itemIds: selected, occasion, vibe };
    await save({ name: `${p.vibe} ${p.occasion}`, image_url: result, item_ids: p.itemIds, occasion: p.occasion });
    setSaved(true);
  };

  return (
    <View style={styles.root}>
      <StackHeader title="Style me" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {result ? (
          <View style={styles.resultWrap}>
            <View style={styles.resultImageWrap}>
              <Image source={{ uri: result }} style={styles.result} contentFit="cover" transition={250} />
            </View>

            {suggestion ? (
              <SuggestionCard suggestion={suggestion} onDismiss={() => setSuggestion(null)} />
            ) : null}

            <Card glass={false} style={styles.resultActions}>
              <Button
                label={saved ? 'Saved to library' : 'Save to library'}
                onPress={onSave}
                variant={saved ? 'outline' : 'primary'}
                disabled={saved}
              />
              <View style={{ height: spacing.sm }} />
              <Button
                label="Start over"
                variant="ghost"
                onPress={async () => {
                  await maybeShowInterstitial();
                  setResult(null);
                }}
              />
            </Card>
          </View>
        ) : (
          <>
            <ModeRow mode={mode} onChange={changeMode} styles={styles} colors={colors} />

            {isLoadingCloset ? (
              <View style={styles.empty}>
                <ActivityIndicator color={colors.pinkWarm} style={styles.closetSpinner} />
                <ThemedText variant="labelSmall" color={colors.inkMuted} center>
                  Loading your closet…
                </ThemedText>
              </View>
            ) : isEmpty ? (
              <View style={styles.empty}>
                <EmptyState
                  icon="shirt-outline"
                  title="Add pieces first"
                  body="Your closet is empty — add a few pieces to style an outfit."
                />
              </View>
            ) : (
              <>
                {mode === 'mood' ? (
                  <>
                    <SectionLabel>OCCASION</SectionLabel>
                    <ChipRow options={OCCASIONS} value={occasion} onChange={setOccasion} styles={styles} colors={colors} />

                    <SectionLabel>VIBE</SectionLabel>
                    <ChipRow options={VIBES} value={vibe} onChange={setVibe} styles={styles} colors={colors} />
                  </>
                ) : null}

                {mode === 'mood' || mode === 'pick' ? (
                  <>
                    <SectionLabel>{mode === 'pick' ? 'CHOOSE ONE PIECE' : 'PICK PIECES (OPTIONAL)'}</SectionLabel>
                    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.pieces}>
                      {items.map((it) => {
                        const on = selected.includes(it.id);
                        return (
                          <Pressable key={it.id} onPress={() => onTogglePiece(it.id)} style={styles.pieceWrap}>
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
                  </>
                ) : null}

                {mode === 'mix' ? (
                  <>
                    <SectionLabel>OCCASION</SectionLabel>
                    <ChipRow options={OCCASIONS} value={occasion} onChange={setOccasion} styles={styles} colors={colors} />

                    <SectionLabel>VIBE</SectionLabel>
                    <ChipRow options={VIBES} value={vibe} onChange={setVibe} styles={styles} colors={colors} />

                    <ThemedText variant="body" color={colors.inkMuted} style={styles.hint}>
                      We'll style a look using your whole closet ({items.length} {items.length === 1 ? 'piece' : 'pieces'}).
                    </ThemedText>
                  </>
                ) : null}

                {mode === 'cook' ? (
                  <ThemedText variant="body" color={colors.inkMuted} style={styles.hint}>
                    Surprise me — a random handful of pieces and a random vibe, one tap.
                  </ThemedText>
                ) : null}
              </>
            )}
          </>
        )}
      </ScrollView>

      {!result ? (
        <Glass intensity={50} style={styles.footer}>
          <Button
            label={generateLabel}
            onPress={onGenerate}
            loading={running}
            disabled={!canGenerate}
            icon={!running ? <Ionicons name="sparkles" size={18} color={colors.cream} /> : undefined}
            style={styles.generateBtn}
          />
        </Glass>
      ) : null}

      {running ? (
        <View style={styles.overlay} pointerEvents="none">
          <ActivityIndicator size="large" color={colors.pinkWarm} />
        </View>
      ) : null}
    </View>
  );
}

function ModeRow({
  mode,
  onChange,
  styles,
  colors,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  styles: Styles;
  colors: Colors;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.modes}>
      {MODES.map((m) => (
        <Chip
          key={m.key}
          label={m.label}
          icon={m.icon}
          tone="accent"
          selected={m.key === mode}
          onPress={() => onChange(m.key)}
        />
      ))}
    </ScrollView>
  );
}

function ChipRow({
  options,
  value,
  onChange,
  styles,
  colors,
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  styles: Styles;
  colors: Colors;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => (
        <Chip key={o} label={o} selected={o === value} onPress={() => onChange(o)} />
      ))}
    </ScrollView>
  );
}

function SuggestionCard({
  suggestion,
  onDismiss,
}: {
  suggestion: PieceSuggestion;
  onDismiss: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Card style={styles.suggestCard}>
      <Pressable onPress={onDismiss} hitSlop={8} style={styles.suggestClose}>
        <Ionicons name="close" size={14} color={colors.inkMuted} />
      </Pressable>
      <View style={styles.suggestRow}>
        {suggestion.image_url ? (
          <Image source={{ uri: suggestion.image_url }} style={styles.suggestThumb} contentFit="cover" />
        ) : (
          <View style={[styles.suggestThumb, styles.piecePh]}>
            <Ionicons name="shirt-outline" size={18} color={colors.blushDeep} />
          </View>
        )}
        <View style={styles.suggestInfo}>
          <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.suggestEyebrow}>
            MISSING A PIECE?
          </ThemedText>
          <ThemedText variant="label" numberOfLines={1}>
            {suggestion.name}
          </ThemedText>
          <ThemedText variant="labelSmall" color={colors.inkMuted} numberOfLines={1}>
            {suggestion.store}
            {typeof suggestion.price === 'number' ? `  ·  $${suggestion.price.toFixed(0)}` : ''}
          </ThemedText>
          <View style={styles.suggestActions}>
            <Pressable onPress={() => openProductUrl(suggestion.url)} hitSlop={6}>
              <ThemedText variant="labelSmall" color={colors.pinkWarm}>
                View
              </ThemedText>
            </Pressable>
            <Pressable onPress={onDismiss} hitSlop={6} style={styles.suggestNotNow}>
              <ThemedText variant="labelSmall" color={colors.inkMuted}>
                Not now
              </ThemedText>
            </Pressable>
          </View>
        </View>
      </View>
    </Card>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.cream },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 1 },
    hint: { marginTop: spacing.lg },
    empty: { height: 200, justifyContent: 'center' },
    closetSpinner: { marginBottom: spacing.sm },
    modes: { gap: spacing.sm, paddingVertical: spacing.xs },
    modeChip: {
      flexDirection: 'row',
      alignItems: 'center',
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.white,
      minHeight: 40,
    },
    modeChipOn: { backgroundColor: colors.pinkWarm, borderColor: colors.pinkWarm },
    modeIcon: { marginRight: spacing.xs },
    pieces: { gap: spacing.sm, paddingVertical: spacing.xs },
    pieceWrap: {},
    piece: {
      width: 92,
      height: 112,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.pinkWarmGlow,
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
      borderTopColor: colors.glassEdge,
    },
    // Web Generate CTA: dark pill with the signature soft pink glow.
    generateBtn: {
      shadowColor: colors.pinkWarm,
      shadowOpacity: 0.4,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    resultWrap: { gap: spacing.lg },
    resultImageWrap: {
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    result: { width: '100%', aspectRatio: 0.8, backgroundColor: colors.pearl },
    resultActions: {},
    overlay: {
      ...fillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.glassScrim,
    },
    suggestCard: {},
    suggestClose: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      width: 22,
      height: 22,
      borderRadius: 11,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.white,
      zIndex: 1,
    },
    suggestRow: { flexDirection: 'row', gap: spacing.md },
    suggestThumb: { width: 48, height: 60, borderRadius: radius.sm, backgroundColor: colors.white },
    suggestInfo: { flex: 1, paddingRight: spacing.xl, gap: 2 },
    suggestEyebrow: { letterSpacing: 1, marginBottom: 2 },
    suggestActions: { flexDirection: 'row', gap: spacing.lg, marginTop: spacing.xs },
    suggestNotNow: {},
  });

type Styles = ReturnType<typeof makeStyles>;
