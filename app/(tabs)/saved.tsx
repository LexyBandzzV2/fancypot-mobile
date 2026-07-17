import React, { useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { useRouter } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  AppHeader,
  BottomSheet,
  SheetAction,
  EmptyState,
  SkeletonGrid,
} from '@/components';
import { ThemedText } from '@/components';
import type { Colors } from '@/theme/colors';
import { radius, spacing, useThemedStyles } from '@/theme';
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

  return (
    <View style={styles.root}>
      <AppHeader title="Saved Looks" subtitle="Your outfit library" />
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
          numColumns={3}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.blushDeep} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={styles.tile}
              onPress={() => router.push('/style/try-on')}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelected(item);
              }}
            >
              {item.signedUrl ? (
                <Image source={{ uri: item.signedUrl }} style={styles.img} contentFit="cover" transition={200} />
              ) : (
                <View style={[styles.img, styles.placeholder]}>
                  <Ionicons name="image-outline" size={28} color={colors.blushDeep} />
                </View>
              )}
              {item.name ? (
                <View style={styles.label}>
                  <ThemedText variant="labelSmall" numberOfLines={1}>
                    {item.name}
                  </ThemedText>
                </View>
              ) : null}
            </Pressable>
          )}
        />
      )}

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)}>
        <SheetAction
          label="Try this on"
          icon={<Ionicons name="body-outline" size={22} color={colors.ink} />}
          onPress={() => {
            setSelected(null);
            router.push('/style/try-on');
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

const GAP = spacing.md;
const GRID_CELL_SIZE = 45;
const GRID_GAP = 12;
const GRID_OPACITY = 0.15;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    pad: { paddingHorizontal: spacing.lg },
    list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
    column: { gap: GAP },
    tile: {
      flex: 1,
      marginBottom: GAP,
      borderRadius: radius.md,
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    img: { width: '100%', aspectRatio: 1 },
    placeholder: { backgroundColor: c.pearl, alignItems: 'center', justifyContent: 'center' },
    label: { padding: spacing.sm },
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
