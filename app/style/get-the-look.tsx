import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  StackHeader,
  Button,
  ThemedText,
  EmptyState,
  Card,
  UploadZone,
  CookingLoader,
  ResponsiveContent,
} from '@/components';
import { Glass } from '@/components/Glass';
import { radius, spacing, fillObject, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useAuth } from '@/providers/AuthProvider';
import { useAds } from '@/providers/AdsProvider';
import { getTheLookSearch, saveItem, UsageLimitError, type LookMatch } from '@/lib/api';
import { uploadWardrobeImage, signWardrobeUrl, deleteWardrobeObject } from '@/lib/storage';
import { openProductUrl } from '@/lib/affiliate';

const SCREEN_W = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_W * 0.25;

export default function GetTheLookScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { fromLibrary, fromCamera } = useImagePicker();
  const { user } = useAuth();
  const { maybeShowInterstitial, showAiGate } = useAds();
  const [results, setResults] = useState<LookMatch[]>([]);
  const [index, setIndex] = useState(0);
  const [kept, setKept] = useState<LookMatch[]>([]);
  const [searching, setSearching] = useState(false);

  const position = useRef(new Animated.ValueXY()).current;

  const search = async (source: 'camera' | 'library') => {
    if (!user) return;
    const picked = source === 'camera' ? await fromCamera() : await fromLibrary();
    if (!picked) return;

    // Free-tier monetization: play the full-screen ad before the search runs.
    // No-op for paid users / when no ad is loaded.
    await showAiGate();
    setSearching(true);
    let uploadedPath: string | null = null;
    try {
      // Upload the photo, sign it, and hand the signed URL to the search.
      uploadedPath = await uploadWardrobeImage(user.id, picked.base64);
      const signed = await signWardrobeUrl(uploadedPath);
      if (!signed) throw new Error('Could not prepare the photo.');
      const matches = await getTheLookSearch(signed);
      if (matches.length === 0) {
        // Without this, a zero-match search lands back on the start screen
        // with no explanation and reads as "the button did nothing."
        Alert.alert(
          'No matches found',
          'We could not find shoppable look-alikes for that photo. Try a clearer, full-outfit photo with good lighting.',
        );
        return;
      }
      setResults(matches);
      setIndex(0);
      setKept([]);
      position.setValue({ x: 0, y: 0 });
    } catch (e) {
      const message =
        e instanceof UsageLimitError
          ? e.message
          : 'We could not search that photo. Please try again.';
      Alert.alert('Get the look', message);
    } finally {
      // The uploaded photo is only needed for the SerpAPI call; clean it up.
      if (uploadedPath) deleteWardrobeObject(uploadedPath).catch(() => {});
      setSearching(false);
    }
  };

  const advance = () => {
    position.setValue({ x: 0, y: 0 });
    setIndex((i) => i + 1);
  };

  const decide = async (keep: boolean) => {
    Haptics.impactAsync(
      keep ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    const current = results[index];
    if (keep && current && user) {
      setKept((prev) => [...prev, current]);
      try {
        // Get the Look matches are one-off shoppable products, so they belong
        // in Saved Items (not the composed-outfit library).
        await saveItem(user.id, {
          name: current.title,
          brand: current.source,
          price: current.price,
          image_url: current.thumbnail,
          product_url: current.link,
          source: 'get_the_look',
        });
      } catch (e) {
        // Non-blocking for the swipe flow, but never fully silent — a save
        // that always fails looks identical to one that works otherwise.
        console.warn('get-the-look: saveItem failed', e);
      }
    }
    advance();
  };

  // Animate the top card off-screen, then record the decision.
  const swipeOff = (keep: boolean) => {
    Animated.timing(position, {
      toValue: { x: keep ? SCREEN_W * 1.4 : -SCREEN_W * 1.4, y: 0 },
      duration: 220,
      useNativeDriver: true,
    }).start(() => decide(keep));
  };

  const panResponder = useRef(
    PanResponder.create({
      onMoveShouldSetPanResponder: (_, g) => Math.abs(g.dx) > 6,
      onPanResponderMove: (_, g) => position.setValue({ x: g.dx, y: g.dy }),
      onPanResponderRelease: (_, g) => {
        if (g.dx > SWIPE_THRESHOLD) swipeOff(true);
        else if (g.dx < -SWIPE_THRESHOLD) swipeOff(false);
        else
          Animated.spring(position, {
            toValue: { x: 0, y: 0 },
            useNativeDriver: true,
          }).start();
      },
    }),
  ).current;

  const rotate = position.x.interpolate({
    inputRange: [-SCREEN_W / 2, 0, SCREEN_W / 2],
    outputRange: ['-10deg', '0deg', '10deg'],
  });
  const likeOpacity = position.x.interpolate({
    inputRange: [0, SWIPE_THRESHOLD],
    outputRange: [0, 1],
    extrapolate: 'clamp',
  });
  const nopeOpacity = position.x.interpolate({
    inputRange: [-SWIPE_THRESHOLD, 0],
    outputRange: [1, 0],
    extrapolate: 'clamp',
  });

  const done = results.length > 0 && index >= results.length;
  const current = results[index];

  return (
    <View style={styles.root}>
      <StackHeader title="Get the look" />
      {/* Caps the upload/swipe/results content width on large iPad so the
          swipe card and kept-looks grid don't stretch edge-to-edge; on phone
          contentMaxWidth === width, so this is a transparent no-op. */}
      <ResponsiveContent style={styles.content}>
        {results.length === 0 ? (
          <View style={styles.start}>
            {/* Web upload.tsx: soft-pink circle with the camera glyph. */}
            <View style={styles.startBadge}>
              <Ionicons name="camera" size={24} color={colors.pinkWarm} />
            </View>
            <ThemedText variant="h2" center style={styles.startTitle}>
              Snap an outfit
            </ThemedText>
            <ThemedText variant="body" color={colors.inkMuted} center style={styles.startBody}>
              Upload any outfit photo and we'll find shoppable look-alikes you can swipe through.
            </ThemedText>
            <UploadZone
              onPress={() => search('library')}
              title="Tap to upload a photo"
              subtitle="JPG or PNG"
              icon="scan-outline"
              height={280}
            />
            <View style={styles.startActions}>
              {/* Web: pink-filled primary over a white pink-bordered secondary. */}
              <Button
                label="Take a photo"
                variant="accent"
                onPress={() => search('camera')}
                loading={searching}
                icon={<Ionicons name="camera" size={18} color={colors.white} />}
                style={styles.primaryCta}
              />
              <View style={{ height: spacing.sm }} />
              <Button
                label="Choose from library"
                variant="outline"
                onPress={() => search('library')}
                style={styles.libraryBtn}
              />
            </View>
          </View>
        ) : done ? (
          <View style={styles.done}>
            <ThemedText variant="h2" center>
              You kept {kept.length} {kept.length === 1 ? 'look' : 'looks'}
            </ThemedText>
            <View style={styles.keptGrid}>
              {kept.map((p, i) => (
                <Card
                  key={`${p.link ?? p.title ?? 'item'}-${i}`}
                  style={styles.keptItem}
                  padded={false}
                >
                  {p.thumbnail ? (
                    <Image source={{ uri: p.thumbnail }} style={styles.keptImg} contentFit="cover" />
                  ) : (
                    <View style={styles.keptImg} />
                  )}
                  <ThemedText variant="labelSmall" numberOfLines={1} style={styles.keptLabel}>
                    {p.title ?? p.source ?? 'Saved look'}
                  </ThemedText>
                </Card>
              ))}
            </View>
            <ThemedText variant="labelSmall" color={colors.inkMuted} center>
              Saved to your library.
            </ThemedText>
            <Button
              label="Start over"
              variant="outline"
              onPress={async () => {
                await maybeShowInterstitial();
                // Full reset back to the upload/start section. (The picked photo
                // isn't held in state — it's uploaded then deleted — and errors
                // surface via Alert, so results/index/kept are the whole state.)
                setResults([]);
                setIndex(0);
                setKept([]);
                position.setValue({ x: 0, y: 0 });
              }}
            />
          </View>
        ) : (
          <View style={styles.swipe}>
            <Animated.View
              style={[
                styles.cardWrap,
                {
                  transform: [
                    { translateX: position.x },
                    { translateY: position.y },
                    { rotate },
                  ],
                },
              ]}
              {...panResponder.panHandlers}
            >
              <Glass intensity={40} style={styles.card}>
                {current.thumbnail ? (
                  <Image
                    source={{ uri: current.thumbnail }}
                    style={styles.cardImg}
                    contentFit="cover"
                    transition={200}
                  />
                ) : (
                  <View style={[styles.cardImg, styles.cardImgFallback]}>
                    <Ionicons name="image-outline" size={48} color={colors.inkMuted} />
                  </View>
                )}

                <Animated.View style={[styles.badge, styles.likeBadge, { opacity: likeOpacity }]}>
                  <ThemedText variant="labelSmall" color={colors.white}>
                    KEEP
                  </ThemedText>
                </Animated.View>
                <Animated.View style={[styles.badge, styles.nopeBadge, { opacity: nopeOpacity }]}>
                  <ThemedText variant="labelSmall" color={colors.white}>
                    SKIP
                  </ThemedText>
                </Animated.View>

                <View style={styles.cardMeta}>
                  {current.source ? (
                    <ThemedText variant="labelSmall" color={colors.inkMuted} numberOfLines={1}>
                      {current.source}
                    </ThemedText>
                  ) : null}
                  <ThemedText variant="h3" numberOfLines={2}>
                    {current.title ?? 'Shoppable match'}
                  </ThemedText>
                  {current.price != null ? (
                    <ThemedText variant="body">${current.price}</ThemedText>
                  ) : null}
                  {current.link ? (
                    <Pressable
                      onPress={() => openProductUrl(current.link)}
                      hitSlop={8}
                      style={styles.productLink}
                    >
                      <Ionicons name="open-outline" size={16} color={colors.pinkWarm} />
                      <ThemedText variant="labelSmall" color={colors.pinkWarm}>
                        View product
                      </ThemedText>
                    </Pressable>
                  ) : null}
                </View>
              </Glass>
            </Animated.View>

            <ThemedText variant="labelSmall" color={colors.inkMuted} center style={styles.counter}>
              {index + 1} of {results.length}
            </ThemedText>
            <View style={styles.swipeActions}>
              <Pressable style={[styles.circle, styles.skip]} onPress={() => swipeOff(false)}>
                <Ionicons name="close" size={30} color={colors.ink} />
              </Pressable>
              <Pressable style={[styles.circle, styles.love]} onPress={() => swipeOff(true)}>
                <Ionicons name="heart" size={30} color={colors.white} />
              </Pressable>
            </View>
          </View>
        )}
      </ResponsiveContent>

      {searching ? (
        <View style={styles.overlay}>
          <CookingLoader caption="Finding your look…" subCaption="Scanning for shoppable matches" />
        </View>
      ) : null}
    </View>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: colors.cream },
    content: { flex: 1, padding: spacing.lg },
    start: { flex: 1, justifyContent: 'center' },
    startBadge: {
      width: 56,
      height: 56,
      borderRadius: 28,
      backgroundColor: colors.blush,
      alignItems: 'center',
      justifyContent: 'center',
      alignSelf: 'center',
      marginBottom: spacing.md,
    },
    startTitle: { marginBottom: spacing.xs },
    startBody: { marginBottom: spacing.xl, paddingHorizontal: spacing.lg },
    startActions: { marginTop: spacing.lg },
    // Web's deep drop shadow under the pink "Take a photo" pill.
    primaryCta: {
      shadowColor: colors.ink,
      shadowOpacity: 0.3,
      shadowRadius: 20,
      shadowOffset: { width: 0, height: 12 },
      elevation: 5,
    },
    libraryBtn: { backgroundColor: colors.white, borderColor: colors.pinkWarmGlow },
    swipe: { flex: 1, justifyContent: 'center' },
    cardWrap: {
      borderRadius: radius.lg,
      shadowColor: colors.ink,
      shadowOpacity: 0.08,
      shadowRadius: 18,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    card: {
      borderRadius: radius.lg,
      overflow: 'hidden',
    },
    cardImg: { width: '100%', aspectRatio: 0.85 },
    cardImgFallback: {
      backgroundColor: colors.pearl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardMeta: { padding: spacing.lg, gap: spacing.xs },
    productLink: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    badge: {
      position: 'absolute',
      top: spacing.lg,
      paddingHorizontal: spacing.md,
      paddingVertical: spacing.xs,
      borderRadius: radius.pill,
    },
    likeBadge: { right: spacing.lg, backgroundColor: colors.pinkWarm },
    nopeBadge: { left: spacing.lg, backgroundColor: colors.ink },
    counter: { marginTop: spacing.md },
    swipeActions: {
      flexDirection: 'row',
      justifyContent: 'center',
      gap: spacing.xxl,
      marginTop: spacing.lg,
    },
    circle: {
      width: 68,
      height: 68,
      borderRadius: 34,
      alignItems: 'center',
      justifyContent: 'center',
    },
    skip: { backgroundColor: colors.white, borderWidth: 1, borderColor: colors.borderStrong },
    love: { backgroundColor: colors.pinkWarm },
    done: { flex: 1, justifyContent: 'center', gap: spacing.xl },
    keptGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
    keptItem: { width: 100 },
    keptImg: { width: 100, height: 120, backgroundColor: colors.pearl },
    keptLabel: { padding: spacing.xs },
    overlay: {
      ...fillObject,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.overlay,
    },
  });
