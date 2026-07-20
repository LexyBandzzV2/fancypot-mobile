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
import { useAuth } from '@/providers/AuthProvider';
import { useWardrobe } from '@/hooks/useWardrobe';
import { useOutfits } from '@/hooks/useOutfits';
import { useAIAction } from '@/hooks/useAIAction';
import { useAds } from '@/providers/AdsProvider';
import { generateOutfit, recommendPieces, type PiecePick } from '@/lib/api';
import { OCCASIONS, VIBES } from '@/lib/brands';
import { openProductUrl } from '@/lib/affiliate';

type Mode = 'mix' | 'pick' | 'mood' | 'cook';

const MODES: { key: Mode; label: string; icon: keyof typeof Ionicons.glyphMap }[] = [
  { key: 'mix', label: 'Mix me up', icon: 'shuffle' },
  { key: 'pick', label: 'Pick a piece', icon: 'pricetag-outline' },
  { key: 'mood', label: 'Set the mood', icon: 'sparkles-outline' },
  { key: 'cook', label: 'Let it cook', icon: 'flame-outline' },
];

interface GenerateParams {
  itemIds: string[];
  items: string[];
  occasion: string;
  vibe: string;
}

export default function StylistScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { profile } = useAuth();
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
  const [picks, setPicks] = useState<PiecePick[]>([]);

  // Style preferences (favorite stores / styles / budget) sharpen the gap picks
  // from recommend-pieces. Same jsonb shape the preferences editor writes.
  const prefs = (profile?.preferences ?? {}) as {
    styles?: string[];
    stores?: string[];
    budget?: string;
  };

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

  // Pieces whose occasion/vibe tags intersect the chosen occasion+vibe. Falls
  // back to the WHOLE closet when nothing matches or nothing is tagged yet, so
  // an untagged closet still styles instead of coming up empty.
  const tagMatchedIds = (): string[] => {
    const matched = items.filter(
      (it) => (it.occasions ?? []).includes(occasion) || (it.vibes ?? []).includes(vibe),
    );
    return (matched.length > 0 ? matched : items).map((i) => i.id);
  };

  const buildParams = (): GenerateParams => {
    if (mode === 'mix') {
      // Style from pieces that fit the chosen occasion/vibe (else the whole closet).
      return withImages(tagMatchedIds());
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
    // mood: user-picked pieces win; with none picked, use the tag-matching
    // subset (falling back to the whole closet). Picking pieces is optional.
    return withImages(selected.length > 0 ? selected : tagMatchedIds());
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

  const fetchPicks = async (imageUrl: string, forOccasion: string) => {
    // Best-effort only: never surface an error here (over-limit, rate-limited,
    // network failure, whatever) — the cards just don't appear.
    try {
      const recs = await recommendPieces({
        outfitImage: imageUrl,
        occasion: forOccasion,
        stores: prefs.stores,
        styles: prefs.styles,
        budget: prefs.budget,
      });
      if (recs.length > 0) setPicks(recs.slice(0, 3));
    } catch {
      // swallow
    }
  };

  const onGenerate = async () => {
    setResult(null);
    setSaved(false);
    setPicks([]);
    const params = buildParams();
    const res = await run(() => generateOutfit(params));
    if (res?.image_url) {
      setResult(res.image_url);
      setLastParams(params);
      fetchPicks(res.image_url, params.occasion);
    }
  };

  const onSave = async () => {
    if (!result) return;
    const p = lastParams ?? { itemIds: selected, occasion, vibe };
    await save({
      name: `${p.vibe} ${p.occasion}`,
      image_url: result,
      item_ids: p.itemIds,
      // Legacy single occasion + the Style Me v2 tag arrays.
      occasion: p.occasion,
      occasions: [p.occasion],
      vibes: [p.vibe],
    });
    setSaved(true);
  };

  // Saving a gap pick creates a Saved Look: the generated outfit image carrying
  // the pick's store link, so it appears in Saved Looks with a working "Get the
  // look" button.
  const savePick = async (pick: PiecePick) => {
    await save({
      name: pick.name,
      image_url: result,
      source_url: pick.url,
      occasion: lastParams?.occasion ?? occasion,
    });
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

            {picks.length > 0 ? (
              <RecommendCards picks={picks} onSavePick={savePick} />
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

/**
 * "Complete the look" gap picks: up to 3 shoppable suggestions under a
 * generated outfit. Like/Save state is LOCAL and per-card (keyed by the pick's
 * original index): Like is a subtle highlight only, Dislike removes the card
 * from view, Save writes a real Saved Look via the parent's onSavePick.
 */
function RecommendCards({
  picks,
  onSavePick,
}: {
  picks: PiecePick[];
  onSavePick: (pick: PiecePick) => Promise<void>;
}) {
  const styles = useThemedStyles(makeStyles);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<Set<number>>(new Set());

  const dismiss = (i: number) =>
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(i);
      return next;
    });

  const toggleLike = (i: number) =>
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const savePick = async (pick: PiecePick, i: number) => {
    if (saved.has(i)) return;
    try {
      await onSavePick(pick);
      setSaved((prev) => {
        const next = new Set(prev);
        next.add(i);
        return next;
      });
    } catch {
      // Leave the card unsaved so the user can retry.
    }
  };

  // Keep original indices as stable keys so dismissing one card never reshuffles
  // the like/save state of the others.
  const visible = picks.map((pick, i) => ({ pick, i })).filter(({ i }) => !dismissed.has(i));
  if (visible.length === 0) return null;

  return (
    <View style={styles.recWrap}>
      <SectionLabel hint="Real pieces that would complete this look.">
        COMPLETE THE LOOK
      </SectionLabel>
      {visible.map(({ pick, i }) => (
        <PieceCard
          key={i}
          pick={pick}
          liked={liked.has(i)}
          saved={saved.has(i)}
          onLike={() => toggleLike(i)}
          onDismiss={() => dismiss(i)}
          onSave={() => savePick(pick, i)}
        />
      ))}
    </View>
  );
}

function PieceCard({
  pick,
  liked,
  saved,
  onLike,
  onDismiss,
  onSave,
}: {
  pick: PiecePick;
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onDismiss: () => void;
  onSave: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Card style={liked ? styles.recCardLiked : undefined}>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        style={styles.recClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss suggestion"
      >
        <Ionicons name="close" size={16} color={colors.inkMuted} />
      </Pressable>

      <View style={styles.recBody}>
        {pick.gap ? (
          <ThemedText variant="labelSmall" color={colors.pinkWarm} style={styles.recEyebrow}>
            {pick.gap.toUpperCase()}
          </ThemedText>
        ) : null}
        <ThemedText variant="label" numberOfLines={2} style={styles.recName}>
          {pick.name}
        </ThemedText>
        {pick.reason ? (
          <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.recReason}>
            {pick.reason}
          </ThemedText>
        ) : null}
        <View style={styles.recStoreRow}>
          <Ionicons name="storefront-outline" size={13} color={colors.inkMuted} />
          <ThemedText variant="labelSmall" color={colors.inkMuted} numberOfLines={1} style={styles.recStore}>
            {pick.store}
          </ThemedText>
        </View>
      </View>

      <View style={styles.recActions}>
        <Button
          label="Shop"
          variant="accent"
          fullWidth={false}
          onPress={() => openProductUrl(pick.url)}
          icon={<Ionicons name="bag-handle-outline" size={16} color={colors.white} />}
          style={styles.recShop}
        />
        <View style={styles.recIconRow}>
          <Pressable
            onPress={onLike}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Like"
            accessibilityState={{ selected: liked }}
            style={[styles.recCircle, liked && styles.recCircleLiked]}
          >
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={18}
              color={liked ? colors.white : colors.ink}
            />
          </Pressable>
          <Pressable
            onPress={onSave}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Saved to looks' : 'Save to looks'}
            accessibilityState={{ selected: saved }}
            style={[styles.recCircle, saved && styles.recCircleSaved]}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={saved ? colors.white : colors.ink}
            />
          </Pressable>
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
    // "Complete the look" gap-pick cards.
    recWrap: { gap: spacing.md },
    recCardLiked: { borderWidth: 1.5, borderColor: colors.pinkWarm },
    recClose: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
      zIndex: 1,
    },
    recBody: { paddingRight: spacing.xl, gap: 3 },
    recEyebrow: { letterSpacing: 1 },
    recName: { marginTop: 2 },
    recReason: { marginTop: 2 },
    recStoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    recStore: { flex: 1 },
    recActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    recShop: { paddingHorizontal: spacing.lg },
    recIconRow: { flexDirection: 'row', gap: spacing.sm },
    recCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.white,
    },
    recCircleLiked: { backgroundColor: colors.pinkWarm, borderColor: colors.pinkWarm },
    recCircleSaved: { backgroundColor: colors.ink, borderColor: colors.ink },
  });

type Styles = ReturnType<typeof makeStyles>;
