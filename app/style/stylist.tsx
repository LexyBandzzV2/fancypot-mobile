import React, { useEffect, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  ScrollView,
  Pressable,
  ActivityIndicator,
  Alert,
  type AlertButton,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import {
  StackHeader,
  Button,
  Chip,
  ThemedText,
  EmptyState,
  Card,
  SectionLabel,
  CookingLoader,
  RecommendCards,
} from '@/components';
import { Glass } from '@/components/Glass';
import { radius, spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useWardrobe } from '@/hooks/useWardrobe';
import { useOutfits } from '@/hooks/useOutfits';
import { useAIAction } from '@/hooks/useAIAction';
import { useAds } from '@/providers/AdsProvider';
import { useStylistJob } from '@/providers/StylistJobProvider';
import { recommendPieces, type PiecePick } from '@/lib/api';
import { OCCASIONS, VIBES } from '@/lib/brands';

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
  const router = useRouter();
  const { profile } = useAuth();
  const { items, loading: closetLoading } = useWardrobe();
  const { save } = useOutfits();
  const { gate } = useAIAction();
  const { maybeShowInterstitial } = useAds();
  const {
    status,
    result: jobResult,
    error: jobError,
    overLimit,
    saved,
    meta: jobMeta,
    startGeneration,
    retrySave,
    attach,
    detach,
    reset,
  } = useStylistJob();

  const [mode, setMode] = useState<Mode>('mood');
  const [selected, setSelected] = useState<string[]>([]);
  const [occasion, setOccasion] = useState<string>('Everyday');
  const [vibe, setVibe] = useState<string>('Classic');
  const [picks, setPicks] = useState<PiecePick[]>([]);
  // Whether THIS mount is actively showing a job (cooking loader / inline
  // result). A background job that finished while the user was elsewhere leaves
  // this false, so a fresh visit shows the form, not a stale look. Seeded true
  // when we arrive mid-cook so we re-attach to the in-flight look immediately.
  const [engaged, setEngaged] = useState(() => status === 'cooking');
  const [gating, setGating] = useState(false);

  // Fetch recs once per result; show the error alert once per error.
  const picksFor = useRef<string | null>(null);
  const errorShownFor = useRef<string | null>(null);

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

  const cooking = engaged && status === 'cooking';
  const showResult = engaged && status === 'done' && !!jobResult;
  const showForm = !cooking && !showResult;

  // Register this screen as the job's foreground viewer for its whole lifetime.
  // On unmount (back gesture OR "Save & come back") we detach, so a completion
  // that lands after we're gone routes to the background toast instead.
  useEffect(() => {
    attach();
    return () => detach();
  }, [attach, detach]);

  // When a watched job finishes, load its "complete the look" picks (best-effort).
  useEffect(() => {
    if (!engaged || status !== 'done' || !jobResult) return;
    if (picksFor.current === jobResult) return;
    picksFor.current = jobResult;
    fetchPicks(jobResult, jobMeta?.occasion ?? occasion);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engaged, status, jobResult]);

  // Surface a watched job's error once, then drop back to the form.
  useEffect(() => {
    if (!engaged || status !== 'error' || !jobError) return;
    if (errorShownFor.current === jobError) return;
    errorShownFor.current = jobError;
    const buttons: AlertButton[] = [{ text: 'OK', style: 'cancel' }];
    if (overLimit) buttons.push({ text: 'Upgrade', onPress: () => router.push('/paywall') });
    Alert.alert("Couldn't finish your look", jobError, buttons);
    setEngaged(false);
    reset();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [engaged, status, jobError, overLimit]);

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

  const generateLabel =
    mode === 'mix'
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
    if (status === 'cooking' || gating) return; // guard double-starts
    const params = buildParams();
    const meta = { occasion: params.occasion, vibe: params.vibe, itemIds: params.itemIds };
    setPicks([]);
    picksFor.current = null;
    errorShownFor.current = null;
    setGating(true);
    try {
      // Consent + interstitial ad gate run HERE, in the foreground, before we
      // hand the raw generate call to the background job.
      const ok = await gate();
      if (!ok) return;
      setEngaged(true);
      // Fire-and-continue: the provider owns the generation, so it finishes and
      // auto-saves even if the user navigates away while we're awaiting.
      await startGeneration(params, meta);
    } finally {
      setGating(false);
    }
  };

  // "Save & come back": leave now; the provider finishes + auto-saves in the
  // background and toasts when the look is ready. Detach first to close the
  // race where completion lands between the tap and the unmount.
  const saveAndComeBack = () => {
    detach();
    if (router.canGoBack()) router.back();
    else router.replace('/(tabs)/feed');
  };

  const startOver = async () => {
    await maybeShowInterstitial();
    setPicks([]);
    picksFor.current = null;
    setEngaged(false);
    reset();
  };

  // Saving a gap pick creates a Saved item: the generated outfit image carrying
  // the pick's store link, so it appears with a working "Get the look" button.
  const savePick = async (pick: PiecePick) => {
    await save({
      name: pick.name,
      image_url: jobResult ?? undefined,
      source_url: pick.url,
      occasion: jobMeta?.occasion ?? occasion,
    });
  };

  return (
    <View style={styles.root}>
      <StackHeader title="Style me" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {cooking ? (
          <View style={styles.cookingWrap}>
            <CookingLoader
              caption="Cooking up your look…"
              subCaption={`${jobMeta?.vibe ?? vibe} · ${jobMeta?.occasion ?? occasion}`}
            />
            <Card glass={false} style={styles.cookingCard}>
              <ThemedText variant="body" color={colors.inkMuted} center style={styles.cookingHint}>
                Tap and we'll cook it up and drop it in your Saved → Outfits when it's ready.
              </ThemedText>
              <Button
                label="Save & come back"
                onPress={saveAndComeBack}
                icon={<Ionicons name="time-outline" size={18} color={colors.cream} />}
              />
            </Card>
          </View>
        ) : showResult ? (
          <View style={styles.resultWrap}>
            <View style={styles.resultImageWrap}>
              <Image source={{ uri: jobResult! }} style={styles.result} contentFit="cover" transition={250} />
            </View>

            {picks.length > 0 ? <RecommendCards picks={picks} onSavePick={savePick} /> : null}

            <Card glass={false} style={styles.resultActions}>
              {saved ? (
                <View style={styles.savedRow}>
                  <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                  <ThemedText variant="label" color={colors.inkMuted}>
                    Saved to your Outfits
                  </ThemedText>
                </View>
              ) : (
                <Button label="Save to library" onPress={retrySave} />
              )}
              <View style={{ height: spacing.sm }} />
              <Button label="Start over" variant="ghost" onPress={startOver} />
            </Card>
          </View>
        ) : (
          <>
            <ModeRow mode={mode} onChange={changeMode} styles={styles} />

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
                    <ChipRow options={OCCASIONS} value={occasion} onChange={setOccasion} styles={styles} />

                    <SectionLabel>VIBE</SectionLabel>
                    <ChipRow options={VIBES} value={vibe} onChange={setVibe} styles={styles} />
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
                    <ChipRow options={OCCASIONS} value={occasion} onChange={setOccasion} styles={styles} />

                    <SectionLabel>VIBE</SectionLabel>
                    <ChipRow options={VIBES} value={vibe} onChange={setVibe} styles={styles} />

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

      {showForm ? (
        <Glass intensity={50} style={styles.footer}>
          <Button
            label={generateLabel}
            onPress={onGenerate}
            loading={gating}
            disabled={!canGenerate || gating}
            icon={!gating ? <Ionicons name="sparkles" size={18} color={colors.cream} /> : undefined}
            style={styles.generateBtn}
          />
        </Glass>
      ) : null}
    </View>
  );
}

function ModeRow({
  mode,
  onChange,
  styles,
}: {
  mode: Mode;
  onChange: (m: Mode) => void;
  styles: Styles;
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
}: {
  options: string[];
  value: string;
  onChange: (v: string) => void;
  styles: Styles;
}) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.chips}>
      {options.map((o) => (
        <Chip key={o} label={o} selected={o === value} onPress={() => onChange(o)} />
      ))}
    </ScrollView>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.cream },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    hint: { marginTop: spacing.lg },
    empty: { height: 200, justifyContent: 'center' },
    closetSpinner: { marginBottom: spacing.sm },
    modes: { gap: spacing.sm, paddingVertical: spacing.xs },
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
    // "Cooking up your look" state.
    cookingWrap: { paddingTop: spacing.xxl, gap: spacing.xl },
    cookingCard: { gap: spacing.md },
    cookingHint: { lineHeight: 22 },
    resultWrap: { gap: spacing.lg },
    resultImageWrap: {
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    result: { width: '100%', aspectRatio: 0.8, backgroundColor: colors.pearl },
    resultActions: {},
    savedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
  });

type Styles = ReturnType<typeof makeStyles>;
