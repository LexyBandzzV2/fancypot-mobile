import React, { useState } from 'react';
import { View, StyleSheet, Pressable, ActivityIndicator } from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { StackHeader, Button, ThemedText, EmptyState } from '@/components';
import { colors, radius, spacing, fillObject } from '@/theme';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useAIAction } from '@/hooks/useAIAction';
import { analyzeOutfit, type AnalyzedPiece } from '@/lib/api';

export default function GetTheLookScreen() {
  const { fromLibrary, fromCamera } = useImagePicker();
  const { run, running } = useAIAction();
  const [pieces, setPieces] = useState<AnalyzedPiece[]>([]);
  const [index, setIndex] = useState(0);
  const [loved, setLoved] = useState<AnalyzedPiece[]>([]);

  const analyze = async (source: 'camera' | 'library') => {
    const picked = source === 'camera' ? await fromCamera() : await fromLibrary();
    if (!picked) return;
    const res = await run(() => analyzeOutfit(picked.base64));
    if (res) {
      setPieces(res);
      setIndex(0);
      setLoved([]);
    }
  };

  const decide = (love: boolean) => {
    Haptics.impactAsync(
      love ? Haptics.ImpactFeedbackStyle.Medium : Haptics.ImpactFeedbackStyle.Light,
    );
    const current = pieces[index];
    if (love && current) setLoved((prev) => [...prev, current]);
    setIndex((i) => i + 1);
  };

  const done = pieces.length > 0 && index >= pieces.length;
  const current = pieces[index];

  return (
    <View style={styles.root}>
      <StackHeader title="Get the look" />
      <View style={styles.content}>
        {pieces.length === 0 ? (
          <View style={styles.start}>
            <EmptyState
              icon="camera-outline"
              title="Snap an outfit"
              body="Upload any outfit photo and we'll break it into shoppable pieces you can swipe through."
            />
            <View style={styles.startActions}>
              <Button label="Take a photo" onPress={() => analyze('camera')} loading={running} />
              <View style={{ height: spacing.sm }} />
              <Button label="Choose from library" variant="outline" onPress={() => analyze('library')} />
            </View>
          </View>
        ) : done ? (
          <View style={styles.done}>
            <ThemedText variant="h2" center>
              You loved {loved.length} {loved.length === 1 ? 'piece' : 'pieces'}
            </ThemedText>
            <View style={styles.lovedGrid}>
              {loved.map((p) => (
                <View key={p.id} style={styles.lovedItem}>
                  <Image source={{ uri: p.image_url }} style={styles.lovedImg} contentFit="cover" />
                  <ThemedText variant="labelSmall" numberOfLines={1}>
                    {p.name}
                  </ThemedText>
                </View>
              ))}
            </View>
            <Button label="Start over" variant="outline" onPress={() => setPieces([])} />
          </View>
        ) : (
          <View style={styles.swipe}>
            <View style={styles.card}>
              <Image source={{ uri: current.image_url }} style={styles.cardImg} contentFit="cover" transition={200} />
              <View style={styles.cardMeta}>
                <ThemedText variant="labelSmall" color={colors.inkMuted}>
                  {current.category}
                </ThemedText>
                <ThemedText variant="h3" numberOfLines={1}>
                  {current.name}
                </ThemedText>
              </View>
            </View>
            <ThemedText variant="labelSmall" color={colors.inkMuted} center style={styles.counter}>
              {index + 1} of {pieces.length}
            </ThemedText>
            <View style={styles.swipeActions}>
              <Pressable style={[styles.circle, styles.skip]} onPress={() => decide(false)}>
                <Ionicons name="close" size={30} color={colors.ink} />
              </Pressable>
              <Pressable style={[styles.circle, styles.love]} onPress={() => decide(true)}>
                <Ionicons name="heart" size={30} color={colors.cream} />
              </Pressable>
            </View>
          </View>
        )}
      </View>

      {running && pieces.length === 0 ? (
        <View style={styles.overlay}>
          <ActivityIndicator size="large" color={colors.pinkWarm} />
          <ThemedText variant="body" color={colors.inkMuted} style={{ marginTop: spacing.md }}>
            Analyzing the look…
          </ThemedText>
        </View>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
  content: { flex: 1, padding: spacing.lg },
  start: { flex: 1, justifyContent: 'center' },
  startActions: { marginTop: spacing.lg },
  swipe: { flex: 1, justifyContent: 'center' },
  card: {
    backgroundColor: colors.white,
    borderRadius: radius.lg,
    borderWidth: 1,
    borderColor: colors.border,
    overflow: 'hidden',
    shadowColor: colors.ink,
    shadowOpacity: 0.08,
    shadowRadius: 18,
    shadowOffset: { width: 0, height: 8 },
    elevation: 3,
  },
  cardImg: { width: '100%', aspectRatio: 0.85 },
  cardMeta: { padding: spacing.lg, gap: 2 },
  counter: { marginTop: spacing.md },
  swipeActions: { flexDirection: 'row', justifyContent: 'center', gap: spacing.xxl, marginTop: spacing.lg },
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
  lovedGrid: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.md, justifyContent: 'center' },
  lovedItem: { width: 100, gap: spacing.xs },
  lovedImg: { width: 100, height: 120, borderRadius: radius.md, backgroundColor: colors.pearl },
  overlay: {
    ...fillObject,
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: 'rgba(250,243,231,0.8)',
  },
});
