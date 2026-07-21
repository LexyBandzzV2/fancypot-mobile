import React, { useEffect, useRef, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView, Alert } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import { StackHeader, Button, ThemedText, EmptyState, Card, SectionLabel, UploadZone, CookingLoader } from '@/components';
import { Glass } from '@/components/Glass';
import { radius, spacing, fillObject, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useOutfits, type OutfitDisplay } from '@/hooks/useOutfits';
import { useAIAction } from '@/hooks/useAIAction';
import { useAds } from '@/providers/AdsProvider';
import { useAuth } from '@/providers/AuthProvider';
import { tryOn } from '@/lib/api';
import { imageUrlToDataUri } from '@/lib/storage';
import { persistOutfitImage } from '@/lib/outfits';
import { openLookSource } from '@/lib/affiliate';

/** Compose the saved name for a try-on look from the source outfit. */
function tryOnLookName(name?: string | null): string {
  return name ? `${name} · try-on` : 'Try-on look';
}

/**
 * Fire-and-forget "Save & go" saver. Module-level so it finishes even after the
 * try-on screen unmounts: it holds no React state and takes an explicit userId
 * (the auth hook is gone once the screen is torn down). persistOutfitImage
 * uploads a base64 data-URL result to storage first, matching useOutfits.save.
 */
function saveTryOnLookInBackground(
  userId: string,
  look: { name: string; image_url: string; source_url?: string | null; occasion?: string | null },
) {
  persistOutfitImage(userId, look).catch((e) => {
    console.warn('try-on: background save failed', e);
  });
}

export default function TryOnScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { fromCamera, fromLibrary } = useImagePicker();
  const { outfits, save } = useOutfits();
  const { run, running } = useAIAction();
  const { maybeShowInterstitial } = useAds();
  const { user } = useAuth();
  const { outfitId } = useLocalSearchParams<{ outfitId?: string }>();
  const [personImage, setPersonImage] = useState<string | null>(null);
  const [personBase64, setPersonBase64] = useState<string | null>(null);
  const [outfit, setOutfit] = useState<OutfitDisplay | null>(null);
  const [result, setResult] = useState<string | null>(null);
  // "Save & go" while the fit is still cooking: `savePending` flips the button
  // to its saved-confirmation state; `detached` then hides the overlay/loading
  // so the user is back on the main section. The in-flight run reads
  // `pendingSaveRef` when it resolves to decide background-save vs. result view.
  const [savePending, setSavePending] = useState(false);
  const [detached, setDetached] = useState(false);
  const pendingSaveRef = useRef(false);
  const inFlightRef = useRef(false);
  const saveGoTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  // Result-view "Save look" state (checkmark flip + disable after save).
  const [resultSaved, setResultSaved] = useState(false);
  const [savingResult, setSavingResult] = useState(false);
  // Preselect only once: after a manual "Start over" clears the outfit, the
  // incoming outfitId param must NOT re-select it.
  const preselectedRef = useRef(false);

  // Preselect the look the user tapped through from (Saved Looks passes its id).
  useEffect(() => {
    if (!outfitId || outfit || preselectedRef.current) return;
    const match = outfits.find((o) => o.id === outfitId);
    if (match) {
      setOutfit(match);
      preselectedRef.current = true;
    }
  }, [outfitId, outfits, outfit]);

  // Clear the pending flip timer if the screen unmounts mid-confirmation.
  useEffect(() => () => {
    if (saveGoTimer.current) clearTimeout(saveGoTimer.current);
  }, []);

  const pickPerson = async (source: 'camera' | 'library') => {
    const picked = source === 'camera' ? await fromCamera() : await fromLibrary();
    if (!picked) return;
    setPersonImage(picked.uri);
    setPersonBase64(picked.base64);
    setResult(null);
  };

  const onTryOn = async () => {
    if (!personBase64 || !outfit?.signedUrl) return;
    if (inFlightRef.current) return; // no concurrent try-ons
    inFlightRef.current = true;
    // Reset any prior "Save & go" intent and capture outfit-derived values now,
    // so the background save is immune to the user changing the selection while
    // the fit cooks after they've detached.
    pendingSaveRef.current = false;
    setDetached(false);
    setSavePending(false);
    const userId = user?.id ?? null;
    const look = {
      name: tryOnLookName(outfit.name),
      source_url: outfit.source_url ?? null,
      occasion: outfit.occasion ?? null,
    };
    try {
      // Both images go to the edge function as `data:` URIs.
      //  • Person photo: the picker returns RAW base64; the backend resolver treats
      //    an un-prefixed string as a bare storage path (and blows up with a giant
      //    error embedding the whole base64), so the `data:` prefix is load-bearing.
      //    Picker encodes JPEG @ q0.8.
      //  • Outfit: a URL — a signed wardrobe URL, or (for feed / Get-the-Look looks)
      //    a remote retailer/CDN link whose host the resolver won't allowlist
      //    ("image host not allowed"). Inline it on-device too so it has no host to
      //    reject. Done inside run() so the loader covers the fetch and a failed
      //    fetch surfaces through the same error alert.
      const res = await run(async () => {
        const outfitImage = await imageUrlToDataUri(outfit.signedUrl!);
        if (!outfitImage) throw new Error('Could not load the selected outfit image. Try another look.');
        return tryOn({
          personImage: `data:image/jpeg;base64,${personBase64}`,
          outfitImage,
        });
      });
      const pending = pendingSaveRef.current;
      if (res?.image_url) {
        if (pending) {
          // "Save & go": persist in the background (survives unmount) and stay
          // on the main section — never surface the result view.
          if (userId) saveTryOnLookInBackground(userId, { ...look, image_url: res.image_url });
        } else {
          setResult(res.image_url);
        }
      }
    } finally {
      inFlightRef.current = false;
      pendingSaveRef.current = false;
      // Cancel a still-pending flip and re-enable the main section either way.
      if (saveGoTimer.current) {
        clearTimeout(saveGoTimer.current);
        saveGoTimer.current = null;
      }
      setDetached(false);
      setSavePending(false);
    }
  };

  // "Save & go": mark the in-flight run to background-save, flip the button to
  // its confirmation state, then dismiss the overlay/loading back to the main
  // section. The tryOn() promise keeps running (see onTryOn's resolution).
  const saveAndGo = () => {
    if (savePending || pendingSaveRef.current) return;
    pendingSaveRef.current = true;
    setSavePending(true);
    saveGoTimer.current = setTimeout(() => {
      setDetached(true);
      setSavePending(false);
    }, 1100);
  };

  // Result-view "Save look": save the generated image to Saved → Outfits.
  const saveResultLook = async () => {
    if (!result || resultSaved || savingResult) return;
    setSavingResult(true);
    try {
      await save({
        name: tryOnLookName(outfit?.name),
        image_url: result,
        source_url: outfit?.source_url ?? undefined,
        occasion: outfit?.occasion ?? undefined,
      });
      setResultSaved(true);
    } catch {
      Alert.alert('Could not save', 'Something went wrong saving this look. Please try again.');
    } finally {
      setSavingResult(false);
    }
  };

  // "Start over": full reset back to the try-on main page.
  const startOver = async () => {
    await maybeShowInterstitial();
    setResult(null);
    setPersonImage(null);
    setPersonBase64(null);
    setOutfit(null);
    setResultSaved(false);
    // Don't let the incoming outfitId param re-select the cleared outfit.
    preselectedRef.current = true;
  };

  const canRun = !!personBase64 && !!outfit;

  return (
    <View style={styles.root}>
      <StackHeader title="Virtual try-on" />
      <ScrollView contentContainerStyle={styles.content} showsVerticalScrollIndicator={false}>
        {result ? (
          <View style={styles.resultWrap}>
            <Card style={styles.resultCard} padded={false}>
              <Image source={{ uri: result }} style={styles.result} contentFit="cover" transition={250} />
            </Card>
            {resultSaved ? (
              <View style={styles.savedRow}>
                <Ionicons name="checkmark-circle" size={18} color={colors.success} />
                <ThemedText variant="label" color={colors.inkMuted}>
                  Saved to your Outfits
                </ThemedText>
              </View>
            ) : (
              <Button
                label="Save look"
                onPress={saveResultLook}
                loading={savingResult}
                icon={!savingResult ? <Ionicons name="bookmark-outline" size={18} color={colors.cream} /> : undefined}
              />
            )}
            <Button label="Start over" variant="outline" onPress={startOver} />
            {outfit ? (
              <Pressable style={styles.shopLink} onPress={() => openLookSource(outfit.source_url, outfit.name)}>
                <ThemedText variant="label" color={colors.pinkWarm}>
                  Get the look
                </ThemedText>
                <Ionicons name="open-outline" size={16} color={colors.pinkWarm} />
              </Pressable>
            ) : null}
          </View>
        ) : (
          <>
            <SectionLabel>YOUR PHOTO</SectionLabel>
            <UploadZone
              onPress={() => pickPerson('library')}
              imageUri={personImage}
              title="Tap to add a full-body photo"
              icon="scan-outline"
              height={280}
            />
            <View style={styles.personActions}>
              {/* Web tryon.tsx: white card pills with the pink-blush border. */}
              <Button label="Camera" variant="outline" fullWidth={false} onPress={() => pickPerson('camera')} style={styles.sourceBtn} />
              <Button label="Library" variant="outline" fullWidth={false} onPress={() => pickPerson('library')} style={styles.sourceBtn} />
            </View>

            <SectionLabel>CHOOSE AN OUTFIT</SectionLabel>
            {outfits.length === 0 ? (
              <View style={styles.noOutfits}>
                <EmptyState
                  icon="bookmark-outline"
                  title="No saved outfits"
                  body="Create an outfit in the stylist first, then try it on."
                />
              </View>
            ) : (
              <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.outfitRow}>
                {outfits.map((o) => {
                  const on = outfit?.id === o.id;
                  return (
                    <Pressable key={o.id} onPress={() => setOutfit(o)} style={[styles.outfit, on && styles.outfitOn]}>
                      {o.signedUrl ? (
                        <Image source={{ uri: o.signedUrl }} style={styles.outfitImg} contentFit="cover" />
                      ) : (
                        <View style={[styles.outfitImg, styles.outfitPh]}>
                          <Ionicons name="image-outline" size={22} color={colors.blushDeep} />
                        </View>
                      )}
                    </Pressable>
                  );
                })}
              </ScrollView>
            )}

            {/* Once an outfit is picked, always offer "Get the look": the exact
                retailer page when we have it (source_url), else a Google search
                of the look's name (see openLookSource). */}
            {outfit ? (
              <Pressable style={styles.shopLink} onPress={() => openLookSource(outfit.source_url, outfit.name)}>
                <ThemedText variant="label" color={colors.pinkWarm}>
                  Get the look
                </ThemedText>
                <Ionicons name="open-outline" size={16} color={colors.pinkWarm} />
              </Pressable>
            ) : null}
          </>
        )}
      </ScrollView>

      {!result ? (
        <Glass intensity={50} style={styles.footer}>
          <Button
            label={running && !detached ? 'Dressing you up…' : 'Try it on'}
            onPress={onTryOn}
            loading={running && !detached}
            disabled={!canRun || detached}
            icon={!(running && !detached) ? <Ionicons name="sparkles" size={18} color={colors.cream} /> : undefined}
            style={styles.tryOnBtn}
          />
        </Glass>
      ) : null}

      {running && !detached ? (
        <View style={styles.overlay}>
          <CookingLoader caption="Dressing you up…" subCaption="Fitting the look to your photo" />
          <Card glass={false} style={styles.cookingCard}>
            <ThemedText variant="body" color={colors.inkMuted} center style={styles.cookingHint}>
              We'll finish the fit and drop it in your Saved → Outfits when it's ready.
            </ThemedText>
            <Button
              label={savePending ? 'Saved ✓ — you can keep browsing' : 'Save & go'}
              onPress={saveAndGo}
              disabled={savePending}
              icon={
                <Ionicons
                  name={savePending ? 'checkmark-circle' : 'time-outline'}
                  size={18}
                  color={colors.cream}
                />
              }
            />
          </Card>
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.cream },
    content: { padding: spacing.lg, paddingBottom: spacing.xxxl },
    sectionLabel: { marginTop: spacing.lg, marginBottom: spacing.sm, letterSpacing: 1 },
    personSlot: {
      height: 260,
      borderRadius: radius.lg,
    },
    personImg: { width: '100%', height: '100%' },
    personEmpty: { flex: 1, alignItems: 'center', justifyContent: 'center', gap: spacing.sm },
    personActions: { flexDirection: 'row', gap: spacing.md, marginTop: spacing.md },
    sourceBtn: { backgroundColor: colors.white, borderColor: colors.pinkWarmGlow },
    noOutfits: { height: 180 },
    shopLink: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      marginTop: spacing.lg,
      paddingVertical: spacing.sm,
    },
    outfitRow: { gap: spacing.sm, paddingVertical: spacing.xs },
    outfit: {
      width: 92,
      height: 112,
      borderRadius: radius.md,
      borderWidth: 2,
      borderColor: colors.pinkWarmGlow,
      overflow: 'hidden',
      backgroundColor: colors.white,
    },
    outfitOn: { borderColor: colors.pinkWarm },
    outfitImg: { width: '100%', height: '100%' },
    outfitPh: { alignItems: 'center', justifyContent: 'center', backgroundColor: colors.pearl },
    footer: {
      padding: spacing.lg,
    },
    // Dark "Try it on" pill with the signature soft pink glow.
    tryOnBtn: {
      shadowColor: colors.pinkWarm,
      shadowOpacity: 0.4,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 10 },
      elevation: 6,
    },
    resultWrap: { gap: spacing.lg },
    resultCard: { width: '100%' },
    result: { width: '100%', aspectRatio: 0.7, backgroundColor: colors.pearl },
    savedRow: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.sm,
      paddingVertical: spacing.md,
    },
    overlay: {
      ...fillObject,
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xl,
      paddingHorizontal: spacing.xl,
      backgroundColor: colors.overlay,
    },
    // "Save & go" card beneath the cooking loader (mirrors the stylist overlay).
    cookingCard: { alignSelf: 'stretch', gap: spacing.md },
    cookingHint: { lineHeight: 22 },
  });
