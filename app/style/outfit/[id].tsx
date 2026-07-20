import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import {
  StackHeader,
  Button,
  ThemedText,
  EmptyState,
  Card,
  RecommendCards,
} from '@/components';
import { radius, spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useOutfits } from '@/hooks/useOutfits';
import { recommendPieces, type PiecePick } from '@/lib/api';
import { openLookSource } from '@/lib/affiliate';

/**
 * Saved-outfit detail. Opens from Saved → Outfits: the look shown large up top,
 * with its "Complete the look" recommendations (re-fetched on open, best-effort)
 * below, plus "Try this on" and the Get-the-look affordance.
 */
export default function OutfitDetailScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { id } = useLocalSearchParams<{ id: string }>();
  const { outfits, loading, save } = useOutfits();
  const { profile } = useAuth();

  const outfit = outfits.find((o) => o.id === id) ?? null;

  const [picks, setPicks] = useState<PiecePick[]>([]);
  const [loadingPicks, setLoadingPicks] = useState(false);
  // Fetch recs at most once per outfit — signing + recommend are not free.
  const fetchedFor = useRef<string | null>(null);

  const prefs = (profile?.preferences ?? {}) as {
    styles?: string[];
    stores?: string[];
    budget?: string;
  };

  useEffect(() => {
    const signed = outfit?.signedUrl;
    if (!outfit || !signed) return;
    if (fetchedFor.current === outfit.id) return;
    fetchedFor.current = outfit.id;
    let cancelled = false;
    (async () => {
      setLoadingPicks(true);
      try {
        const recs = await recommendPieces({
          outfitImage: signed,
          occasion: outfit.occasion ?? outfit.occasions?.[0] ?? undefined,
          stores: prefs.stores,
          styles: prefs.styles,
          budget: prefs.budget,
        });
        if (!cancelled && recs.length > 0) setPicks(recs.slice(0, 3));
      } catch {
        // Best-effort only — an empty recs section is fine, never a crash.
      } finally {
        if (!cancelled) setLoadingPicks(false);
      }
    })();
    return () => {
      cancelled = true;
    };
    // prefs intentionally omitted — fetchedFor guards a single fetch per outfit.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [outfit?.id, outfit?.signedUrl]);

  // Saving a pick creates a Saved item: the outfit image carrying the pick's
  // store link, so it lands in Saved → Items with a working "Get the look".
  const savePick = async (pick: PiecePick) => {
    await save({
      name: pick.name,
      image_url: outfit?.image_url ?? undefined,
      source_url: pick.url,
      occasion: outfit?.occasion ?? undefined,
    });
  };

  const notFound = !outfit && !loading;

  return (
    <View style={styles.root}>
      <StackHeader title={outfit?.name ?? 'Outfit'} />
      {notFound ? (
        <View style={styles.empty}>
          <EmptyState
            icon="sparkles-outline"
            title="Outfit not found"
            body="This look may have been removed."
            actionLabel="Back to Saved"
            onAction={() => router.push('/(tabs)/saved')}
          />
        </View>
      ) : !outfit ? (
        <View style={styles.empty}>
          <ActivityIndicator color={colors.pinkWarm} />
        </View>
      ) : (
        <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
          <View style={styles.imageWrap}>
            {outfit.signedUrl ? (
              <Image
                source={{ uri: outfit.signedUrl }}
                style={styles.image}
                contentFit="cover"
                transition={250}
              />
            ) : (
              <View style={[styles.image, styles.imagePh]}>
                <Ionicons name="image-outline" size={32} color={colors.blushDeep} />
              </View>
            )}
          </View>

          <Card glass={false} style={styles.actions}>
            <Button
              label="Try this on"
              onPress={() => router.push({ pathname: '/style/try-on', params: { outfitId: outfit.id } })}
              icon={<Ionicons name="body-outline" size={18} color={colors.cream} />}
            />
            <Pressable
              style={styles.shopLink}
              onPress={() => openLookSource(outfit.source_url, outfit.name)}
              accessibilityRole="button"
              accessibilityLabel="Get the look"
            >
              <ThemedText variant="label" color={colors.pinkWarm}>
                Get the look
              </ThemedText>
              <Ionicons name="open-outline" size={16} color={colors.pinkWarm} />
            </Pressable>
          </Card>

          {loadingPicks ? (
            <View style={styles.picksLoading}>
              <ActivityIndicator color={colors.pinkWarm} />
              <ThemedText variant="labelSmall" color={colors.inkMuted} center style={styles.picksLoadingText}>
                Finding pieces to complete the look…
              </ThemedText>
            </View>
          ) : picks.length > 0 ? (
            <RecommendCards picks={picks} onSavePick={savePick} />
          ) : null}
        </ScrollView>
      )}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.cream },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl, gap: spacing.lg },
    empty: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: spacing.lg },
    imageWrap: { borderRadius: radius.lg, overflow: 'hidden' },
    image: { width: '100%', aspectRatio: 0.8, backgroundColor: colors.pearl },
    imagePh: { alignItems: 'center', justifyContent: 'center' },
    actions: { gap: spacing.md },
    shopLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
    },
    picksLoading: { paddingVertical: spacing.lg, alignItems: 'center', gap: spacing.sm },
    picksLoadingText: { maxWidth: 240 },
  });
