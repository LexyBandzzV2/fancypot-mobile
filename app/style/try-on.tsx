import React, { useEffect, useState } from 'react';
import { View, StyleSheet, Pressable, ScrollView } from 'react-native';
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
import { tryOn } from '@/lib/api';
import { imageUrlToDataUri } from '@/lib/storage';
import { openLookSource } from '@/lib/affiliate';

export default function TryOnScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { fromCamera, fromLibrary } = useImagePicker();
  const { outfits } = useOutfits();
  const { run, running } = useAIAction();
  const { maybeShowInterstitial } = useAds();
  const { outfitId } = useLocalSearchParams<{ outfitId?: string }>();
  const [personImage, setPersonImage] = useState<string | null>(null);
  const [personBase64, setPersonBase64] = useState<string | null>(null);
  const [outfit, setOutfit] = useState<OutfitDisplay | null>(null);
  const [result, setResult] = useState<string | null>(null);

  // Preselect the look the user tapped through from (Saved Looks passes its id).
  // Only runs until something is selected, so a manual pick is never overridden.
  useEffect(() => {
    if (!outfitId || outfit) return;
    const match = outfits.find((o) => o.id === outfitId);
    if (match) setOutfit(match);
  }, [outfitId, outfits, outfit]);

  const pickPerson = async (source: 'camera' | 'library') => {
    const picked = source === 'camera' ? await fromCamera() : await fromLibrary();
    if (!picked) return;
    setPersonImage(picked.uri);
    setPersonBase64(picked.base64);
    setResult(null);
  };

  const onTryOn = async () => {
    if (!personBase64 || !outfit?.signedUrl) return;
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
    if (res?.image_url) setResult(res.image_url);
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
            <Button
              label="Try another"
              variant="outline"
              onPress={async () => {
                await maybeShowInterstitial();
                setResult(null);
              }}
            />
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
            label={running ? 'Dressing you up…' : 'Try it on'}
            onPress={onTryOn}
            loading={running}
            disabled={!canRun}
            icon={!running ? <Ionicons name="sparkles" size={18} color={colors.cream} /> : undefined}
            style={styles.tryOnBtn}
          />
        </Glass>
      ) : null}

      {running ? (
        <View style={styles.overlay}>
          <CookingLoader caption="Dressing you up…" subCaption="Fitting the look to your photo" />
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
    overlay: {
      ...fillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay,
    },
  });
