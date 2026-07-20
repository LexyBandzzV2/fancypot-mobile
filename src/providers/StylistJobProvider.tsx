import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { Animated, Pressable, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { generateOutfit, UsageLimitError } from '@/lib/api';
import { useOutfits } from '@/hooks/useOutfits';
import { useAuth } from '@/providers/AuthProvider';
import { useTheme } from '@/providers/ThemeProvider';
import { radius, spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { ThemedText } from '@/components';

/**
 * Root-level "cook it up, come back later" job runner.
 *
 * generateOutfit() must survive the user leaving the Style Me screen, so it
 * can't live in that screen's lifecycle. This provider owns the in-flight
 * generation instead: a screen does the consent + ad gate in the foreground,
 * then hands the raw generate call here via `startGeneration`. On success the
 * outfit is AUTO-SAVED to Saved → Outfits, so a look is never lost even if the
 * user navigated away mid-cook (via the button or a back gesture).
 *
 * A screen that stays to watch calls `attach()`/`detach()` (mount/unmount) so
 * the provider knows whether anyone is showing the result inline. If a job
 * finishes while nobody is watching, a lightweight toast points the user to
 * Saved → Outfits.
 */

export type StylistJobStatus = 'idle' | 'cooking' | 'done' | 'error';

export interface StylistJobParams {
  itemIds: string[];
  /** Storage paths / URLs of the same pieces (the backend styles from these). */
  items: string[];
  occasion: string;
  vibe: string;
}

export interface StylistJobMeta {
  occasion: string;
  vibe: string;
  itemIds: string[];
}

interface StylistJobValue {
  status: StylistJobStatus;
  /** Result image URL of the last finished job (null until done). */
  result: string | null;
  /** Human-readable error message when status is 'error'. */
  error: string | null;
  /** The error was a plan-limit error — a screen may offer an upgrade. */
  overLimit: boolean;
  /** Whether the finished outfit was successfully auto-saved. */
  saved: boolean;
  meta: StylistJobMeta | null;
  /** Kick off a background generation. Consent + ad gate MUST be cleared first. */
  startGeneration: (params: StylistJobParams, meta: StylistJobMeta) => Promise<void>;
  /** Retry the auto-save if it failed (foreground fallback). */
  retrySave: () => Promise<void>;
  /** A screen is now showing this job inline (call on mount). */
  attach: () => void;
  /** No screen is showing this job (call on unmount). */
  detach: () => void;
  /** Clear a finished/errored job back to idle. No-op while cooking. */
  reset: () => void;
}

const StylistJobContext = createContext<StylistJobValue | undefined>(undefined);

type ToastKind = 'done' | 'error';

export function StylistJobProvider({ children }: { children: React.ReactNode }) {
  const { user } = useAuth();
  const { save } = useOutfits();

  const [status, setStatus] = useState<StylistJobStatus>('idle');
  const [result, setResult] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [overLimit, setOverLimit] = useState(false);
  const [saved, setSaved] = useState(false);
  const [meta, setMeta] = useState<StylistJobMeta | null>(null);
  const [toast, setToast] = useState<ToastKind | null>(null);

  // A generation is in flight — guards against double-starts even before the
  // 'cooking' state has committed.
  const runningRef = useRef(false);
  // Whether a screen is currently displaying the job inline. Read at completion
  // time to decide inline result (watching) vs background toast (left).
  const foregroundRef = useRef(false);

  const persist = useCallback(
    async (imageUrl: string, m: StylistJobMeta): Promise<boolean> => {
      if (!user) return false;
      // Retry once — a paid generation must never be lost to a transient blip.
      for (let attempt = 0; attempt < 2; attempt++) {
        try {
          await save({
            name: `${m.vibe} ${m.occasion}`.trim(),
            image_url: imageUrl,
            item_ids: m.itemIds,
            // Legacy single occasion + the Style Me v2 tag arrays.
            occasion: m.occasion,
            occasions: [m.occasion],
            vibes: [m.vibe],
          });
          return true;
        } catch (e) {
          console.warn('StylistJob: auto-save failed', e);
        }
      }
      return false;
    },
    [user, save],
  );

  const startGeneration = useCallback(
    async (params: StylistJobParams, m: StylistJobMeta) => {
      if (runningRef.current) return; // guard double-starts
      runningRef.current = true;
      setStatus('cooking');
      setMeta(m);
      setResult(null);
      setError(null);
      setOverLimit(false);
      setSaved(false);
      try {
        const res = await generateOutfit({
          itemIds: params.itemIds,
          items: params.items,
          occasion: params.occasion,
          vibe: params.vibe,
        });
        const imageUrl = res?.image_url ?? null;
        if (!imageUrl) {
          throw new Error('The stylist did not return a look. Please try again.');
        }
        // AUTO-SAVE first so the look lands in Saved → Outfits regardless of
        // whether the user is still watching.
        const savedOk = await persist(imageUrl, m);
        setResult(imageUrl);
        setSaved(savedOk);
        setStatus('done');
        if (!foregroundRef.current) setToast('done');
      } catch (e) {
        // Errors are handled quietly — status flips to 'error', never a crash.
        const isLimit = e instanceof UsageLimitError && e.code !== 'rate_limited';
        setError((e as Error)?.message ?? 'Something went wrong. Please try again.');
        setOverLimit(isLimit);
        setStatus('error');
        if (!foregroundRef.current) setToast('error');
      } finally {
        runningRef.current = false;
      }
    },
    [persist],
  );

  const retrySave = useCallback(async () => {
    if (!result || !meta) return;
    const ok = await persist(result, meta);
    setSaved(ok);
  }, [result, meta, persist]);

  const attach = useCallback(() => {
    foregroundRef.current = true;
  }, []);

  const detach = useCallback(() => {
    foregroundRef.current = false;
  }, []);

  const reset = useCallback(() => {
    if (runningRef.current) return; // never wipe an in-flight job
    setStatus('idle');
    setResult(null);
    setError(null);
    setOverLimit(false);
    setSaved(false);
    setMeta(null);
  }, []);

  const value = useMemo<StylistJobValue>(
    () => ({
      status,
      result,
      error,
      overLimit,
      saved,
      meta,
      startGeneration,
      retrySave,
      attach,
      detach,
      reset,
    }),
    [status, result, error, overLimit, saved, meta, startGeneration, retrySave, attach, detach, reset],
  );

  return (
    <StylistJobContext.Provider value={value}>
      {children}
      <StylistJobToast kind={toast} onClear={() => setToast(null)} />
    </StylistJobContext.Provider>
  );
}

export function useStylistJob(): StylistJobValue {
  const ctx = useContext(StylistJobContext);
  if (!ctx) throw new Error('useStylistJob must be used within a StylistJobProvider');
  return ctx;
}

/**
 * Slide-down banner shown when a background job finishes while the user is away
 * from Style Me. Success taps through to Saved → Outfits; both kinds auto-hide.
 */
function StylistJobToast({ kind, onClear }: { kind: ToastKind | null; onClear: () => void }) {
  const { colors } = useTheme();
  const insets = useSafeAreaInsets();
  const router = useRouter();
  const styles = useThemedStyles(makeToastStyles);
  const [shown, setShown] = useState<ToastKind | null>(null);
  const translateY = useRef(new Animated.Value(-160)).current;

  const hide = useCallback(() => {
    Animated.timing(translateY, {
      toValue: -160,
      duration: 220,
      useNativeDriver: true,
    }).start(({ finished }) => {
      if (finished) {
        setShown(null);
        onClear();
      }
    });
  }, [translateY, onClear]);

  useEffect(() => {
    if (!kind) return;
    setShown(kind);
    translateY.setValue(-160);
    Animated.spring(translateY, {
      toValue: 0,
      useNativeDriver: true,
      damping: 16,
      stiffness: 160,
      mass: 0.9,
    }).start();
    const t = setTimeout(hide, 6000);
    return () => clearTimeout(t);
  }, [kind, translateY, hide]);

  if (!shown) return null;

  const isDone = shown === 'done';

  return (
    <Animated.View
      style={[styles.wrap, { top: insets.top + spacing.sm, transform: [{ translateY }] }]}
      pointerEvents="box-none"
    >
      <Pressable
        style={styles.card}
        accessibilityRole="button"
        accessibilityLabel={
          isDone ? 'Your outfit is ready. Open Saved.' : 'Outfit generation failed.'
        }
        onPress={() => {
          if (isDone) router.push('/(tabs)/saved');
          hide();
        }}
      >
        <View style={[styles.iconWrap, isDone ? styles.iconDone : styles.iconError]}>
          <Ionicons
            name={isDone ? 'sparkles' : 'alert-circle-outline'}
            size={18}
            color={colors.white}
          />
        </View>
        <View style={styles.textWrap}>
          <ThemedText variant="label" numberOfLines={2}>
            {isDone
              ? 'Your outfit is ready — find it in Saved → Outfits.'
              : "We couldn't finish that look."}
          </ThemedText>
          {isDone ? (
            <ThemedText variant="labelSmall" color={colors.inkMuted}>
              Tap to view
            </ThemedText>
          ) : (
            <ThemedText variant="labelSmall" color={colors.inkMuted}>
              Please try again.
            </ThemedText>
          )}
        </View>
        <Pressable onPress={hide} hitSlop={10} accessibilityLabel="Dismiss">
          <Ionicons name="close" size={18} color={colors.inkMuted} />
        </Pressable>
      </Pressable>
    </Animated.View>
  );
}

const makeToastStyles = (c: Colors) =>
  StyleSheet.create({
    wrap: {
      position: 'absolute',
      left: spacing.lg,
      right: spacing.lg,
      zIndex: 1000,
      elevation: 12,
    },
    card: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      backgroundColor: c.white,
      borderRadius: radius.lg,
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
      paddingVertical: spacing.md,
      paddingHorizontal: spacing.lg,
      shadowColor: c.blushDeep,
      shadowOpacity: 0.22,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
    },
    iconWrap: {
      width: 34,
      height: 34,
      borderRadius: 17,
      alignItems: 'center',
      justifyContent: 'center',
    },
    iconDone: { backgroundColor: c.pinkWarm },
    iconError: { backgroundColor: c.blushDeep },
    textWrap: { flex: 1, gap: 1 },
  });
