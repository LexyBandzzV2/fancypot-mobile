import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Alert,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { openLookSource } from '@/lib/affiliate';
import {
  AppHeader,
  BottomSheet,
  SheetAction,
  EmptyState,
  SkeletonGrid,
} from '@/components';
import { ThemedText } from '@/components';
import type { Colors } from '@/theme/colors';
import { fonts, radius, spacing, useThemedStyles } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { useOutfits, type OutfitDisplay } from '@/hooks/useOutfits';

export default function SavedScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { outfits, loading, reload, remove } = useOutfits();
  const [selected, setSelected] = useState<OutfitDisplay | null>(null);

  const confirmDelete = (o: OutfitDisplay) => {
    setSelected(null);
    Alert.alert('Delete outfit?', 'This removes it from your saved looks.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(o.id) },
    ]);
  };

  const countLabel =
    loading && outfits.length === 0
      ? 'Your outfit library'
      : `${outfits.length} saved ${outfits.length === 1 ? 'look' : 'looks'}`;

  return (
    <View style={styles.root}>
      <AppHeader title="Saved Looks" subtitle={countLabel} />
      {loading && outfits.length === 0 ? (
        <View style={styles.pad}>
          <SkeletonGrid count={4} />
        </View>
      ) : outfits.length === 0 ? (
        <View style={styles.emptyContainer}>
          {/* Decorative faint pink grid background */}
          <View style={styles.gridBackground} pointerEvents="none">
            {[...Array(8)].map((_, rowIdx) => (
              <View key={`row-${rowIdx}`} style={styles.gridRow}>
                {[...Array(3)].map((_, colIdx) => (
                  <View key={`cell-${rowIdx}-${colIdx}`} style={styles.gridCell} />
                ))}
              </View>
            ))}
          </View>
          {/* EmptyState content centered on top */}
          <View style={styles.emptyContent}>
            <EmptyState
              icon="bookmark-outline"
              title="No looks yet"
              body="Create your first look with the Stylist"
              actionLabel="Create a look"
              onAction={() => router.push('/style/stylist')}
            />
          </View>
        </View>
      ) : (
        <FlatList
          data={outfits}
          keyExtractor={(o) => o.id}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.blushDeep} />
          }
          renderItem={({ item }) => {
            const count = item.item_ids?.length ?? 0;
            const meta = count > 0 ? `${count} ${count === 1 ? 'item' : 'items'}` : item.occasion;
            return (
              <Pressable
                style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
                onPress={() => router.push({ pathname: '/style/try-on', params: { outfitId: item.id } })}
                onLongPress={() => {
                  Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                  setSelected(item);
                }}
                accessibilityRole="button"
                accessibilityLabel={item.name ?? 'Saved look'}
                accessibilityHint="Opens virtual try-on. Long press for more options."
              >
                {item.signedUrl ? (
                  <Image source={{ uri: item.signedUrl }} style={styles.img} contentFit="cover" transition={200} />
                ) : (
                  <View style={[styles.img, styles.placeholder]}>
                    <Ionicons name="image-outline" size={28} color={colors.blushDeep} />
                  </View>
                )}
                <View style={styles.label}>
                  <ThemedText style={styles.lookName} numberOfLines={1}>
                    {item.name ?? 'Saved look'}
                  </ThemedText>
                  {meta ? (
                    <ThemedText variant="labelSmall" color={colors.inkMuted} numberOfLines={1}>
                      {meta}
                    </ThemedText>
                  ) : null}
                </View>
              </Pressable>
            );
          }}
        />
      )}

      <BottomSheet
        visible={!!selected}
        onClose={() => setSelected(null)}
        title={selected?.name ?? undefined}
      >
        <SheetAction
          label="Try this on"
          icon={<Ionicons name="body-outline" size={22} color={colors.ink} />}
          onPress={() => {
            const id = selected?.id;
            setSelected(null);
            router.push({ pathname: '/style/try-on', params: id ? { outfitId: id } : {} });
          }}
        />
        {/* Always offer "Get the look": open the exact product page when we
            captured one (source_url), otherwise fall back to a Google search of
            the look's name so the shop link is never missing. */}
        <SheetAction
          label="Get the look"
          icon={<Ionicons name="bag-handle-outline" size={22} color={colors.ink} />}
          onPress={() => {
            const url = selected?.source_url;
            const name = selected?.name;
            setSelected(null);
            openLookSource(url, name);
          }}
        />
        <SheetAction
          label="Delete outfit"
          destructive
          icon={<Ionicons name="trash-outline" size={22} color={colors.danger} />}
          onPress={() => selected && confirmDelete(selected)}
        />
      </BottomSheet>
    </View>
  );
}

const NUM_COLUMNS = 2;
const GAP = spacing.md;
const H_PADDING = spacing.lg;
// Fixed tile width (mirrors the Closet grid): with a computed half-width, a
// lone last item stays a normal grid tile on the left instead of stretching
// to fill the row (which `flex: 1` caused with an odd number of looks).
const TILE_W =
  (Dimensions.get('window').width - H_PADDING * 2 - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;
const GRID_CELL_SIZE = 45;
const GRID_GAP = 12;
const GRID_OPACITY = 0.15;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    pad: { paddingHorizontal: spacing.lg },
    list: { paddingHorizontal: H_PADDING, paddingBottom: 120 },
    // flex-start keeps a lone last tile pinned to the left at its normal grid
    // width rather than letting the row space it out.
    column: { gap: GAP, justifyContent: 'flex-start' },
    // Editorial look card, matching the web saved grid: radius 24, blush-glow
    // border, soft rose shadow, 3:4 image with name + meta beneath.
    tile: {
      width: TILE_W,
      marginBottom: GAP,
      borderRadius: radius.lg,
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
      overflow: 'hidden',
      shadowColor: c.blushDeep,
      shadowOpacity: 0.12,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    tilePressed: { opacity: 0.85 },
    img: { width: '100%', aspectRatio: 3 / 4, backgroundColor: c.beige },
    placeholder: { alignItems: 'center', justifyContent: 'center' },
    label: { paddingHorizontal: spacing.md, paddingVertical: 10 },
    lookName: { fontFamily: fonts.display, fontSize: 16, lineHeight: 22 },
    // Empty state styles
    emptyContainer: { flex: 1, backgroundColor: c.cream },
    gridBackground: {
      position: 'absolute',
      top: 0,
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.lg,
    },
    gridRow: {
      flexDirection: 'row',
      gap: GRID_GAP,
      marginBottom: GRID_GAP,
    },
    gridCell: {
      flex: 1,
      aspectRatio: 1,
      borderWidth: 1,
      borderColor: c.blush,
      opacity: GRID_OPACITY,
      borderRadius: radius.sm,
    },
    emptyContent: {
      flex: 1,
      justifyContent: 'center',
      alignItems: 'center',
    },
  });
