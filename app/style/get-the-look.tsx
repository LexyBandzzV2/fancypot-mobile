import React, { useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  Pressable,
  ActivityIndicator,
  Animated,
  PanResponder,
  Dimensions,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StackHeader, Button, ThemedText, EmptyState, Card } from '@/components';
import { Glass } from '@/components/Glass';
import { radius, spacing, fillObject, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useAuth } from '@/providers/AuthProvider';
import { getTheLookSearch, saveOutfit, UsageLimitError, type LookMatch } from '@/lib/api';
import { uploadWardrobeImage, signWardrobeUrl, deleteWardrobeObject } from '@/lib/storage';
import { openProductUrl } from '@/lib/affiliate';

const SCREEN_W = Dimensions.get('window').width;
const SWIPE_THRESHOLD = SCREEN_W * 0.25;

export default function GetTheLookScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { fromLibrary, fromCamera } = useImagePicker();
  const { user } = useAuth();
  const [results, setResults] = useState<LookMatch[]>([]);
  const [index, setIndex] = useState(0);
  const [kept, setKept] = useState<LookMatch[]>([]);
  const [searching, setSearching] = useState(false);

  const position = useRef(new Animated.ValueXY()).current;

  const search = async (source: 'camera' | 'library') => {
    if (!user) return;
    const picked = source === 'camera' ? await fromCamera() : await fromLibrary();
    if (!picked) return;

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
        await saveOutfit(user.id, {
          name: current.title ?? 'Saved look',
          image_url: current.thumbnail,
          category: 'get_the_look',
          // Keep the retailer link so Saved Looks / Try-on can shop the item.
          source_url: current.link,
        });
      } catch {
        // Non-blocking: keep the swipe flow moving even if the save fails.
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
      <View style={styles.content}>
        {results.length === 0 ? (
          <View style={styles.start}>
            <EmptyState
              icon="camera-outline"
              title="Snap an outfit"
              body="Upload any outfit photo and we'll find shoppable look-alikes you can swipe through."
            />
            <View style={styles.startActions}>
              <Button label="Take a photo" onPress={() => search('camera')} loading={searching} />
              <View style={{ height: spacing.sm }} />
              <Button
                label="Choose from library"
                variant="outline"
                onPress={() => search('library')}
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
            <Button label="Start over" variant="outline" onPress={() => setResults([])} />
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
      </View>

      {searching ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.pinkWarm} />
          <ThemedText variant="body" color={colors.inkMuted} style={{ marginTop: spacing.md }}>
            Finding the look…
          </ThemedText>
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
    startActions: { marginTop: spacing.lg },
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
