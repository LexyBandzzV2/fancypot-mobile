import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  AppHeader,
  HeaderIconButton,
  BottomSheet,
  SheetAction,
  EmptyState,
  SkeletonGrid,
  UsageLimitBanner,
  ThemedText,
} from '@/components';
import type { Colors } from '@/theme/colors';
import { radius, spacing, fillObject, useThemedStyles } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { useWardrobe, type WardrobeDisplayItem } from '@/hooks/useWardrobe';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useSubscription } from '@/providers/SubscriptionProvider';

export default function ClosetScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { items, loading, add, remove, reload } = useWardrobe();
  const { fromCamera, fromLibrary } = useImagePicker();
  const { tier } = useSubscription();
  const [addSheet, setAddSheet] = useState(false);
  const [selected, setSelected] = useState<WardrobeDisplayItem | null>(null);
  const [uploading, setUploading] = useState(false);

  const atLimit = items.length >= tier.limits.wardrobeItems;

  const handleAdd = async (source: 'camera' | 'library') => {
    setAddSheet(false);
    if (atLimit) return;
    const picked = source === 'camera' ? await fromCamera() : await fromLibrary();
    if (!picked) return;
    setUploading(true);
    try {
      await add(picked.base64);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
    } catch (e: any) {
      Alert.alert('Could not add piece', e?.message ?? 'Please try again.');
    } finally {
      setUploading(false);
    }
  };

  const confirmDelete = (item: WardrobeDisplayItem) => {
    setSelected(null);
    Alert.alert('Remove piece?', 'This will delete it from your closet.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove(item) },
    ]);
  };

  const header = useMemo(
    () => (
      <View>
        <View style={styles.metaRow}>
          <ThemedText variant="labelSmall" color={colors.inkMuted}>
            {items.length} of {tier.limits.wardrobeItems} pieces · {tier.name}
          </ThemedText>
        </View>
        {atLimit ? (
          <View style={styles.banner}>
            <UsageLimitBanner
              message={`You've filled all ${tier.limits.wardrobeItems} ${tier.name} slots.`}
            />
          </View>
        ) : null}
      </View>
    ),
    [items.length, tier, atLimit],
  );

  return (
    <View style={styles.root}>
      <AppHeader
        title="Your Closet"
        right={
          <HeaderIconButton onPress={() => setAddSheet(true)} label="Add piece">
            <Ionicons name="add" size={26} color={colors.ink} />
          </HeaderIconButton>
        }
      />

      {loading && items.length === 0 ? (
        <View style={styles.pad}>
          <SkeletonGrid count={6} />
        </View>
      ) : items.length === 0 ? (
        <EmptyState
          icon="shirt-outline"
          title="Your closet is empty"
          body="Snap or upload your clothes to start building outfits."
          actionLabel="Add your first piece"
          onAction={() => setAddSheet(true)}
        />
      ) : (
        <FlatList
          data={items}
          keyExtractor={(i) => i.id}
          numColumns={3}
          ListHeaderComponent={header}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.blushDeep} />
          }
          renderItem={({ item }) => (
            <ClosetTile item={item} onLongPress={() => setSelected(item)} />
          )}
        />
      )}

      {/* Floating add button (thumb reachable) */}
      <Pressable
        onPress={() => setAddSheet(true)}
        style={styles.fab}
        accessibilityRole="button"
        accessibilityLabel="Add piece"
      >
        {uploading ? (
          <ActivityIndicator color={colors.cream} />
        ) : (
          <Ionicons name="camera" size={26} color={colors.cream} />
        )}
      </Pressable>

      <BottomSheet visible={addSheet} onClose={() => setAddSheet(false)} title="Add a piece">
        <SheetAction
          label="Take a photo"
          icon={<Ionicons name="camera-outline" size={22} color={colors.ink} />}
          onPress={() => handleAdd('camera')}
        />
        <SheetAction
          label="Choose from library"
          icon={<Ionicons name="images-outline" size={22} color={colors.ink} />}
          onPress={() => handleAdd('library')}
        />
      </BottomSheet>

      <BottomSheet visible={!!selected} onClose={() => setSelected(null)}>
        <SheetAction
          label="Remove from closet"
          destructive
          icon={<Ionicons name="trash-outline" size={22} color={colors.danger} />}
          onPress={() => selected && confirmDelete(selected)}
        />
      </BottomSheet>
    </View>
  );
}

function ClosetTile({
  item,
  onLongPress,
}: {
  item: WardrobeDisplayItem;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const processing = item.processing_status === 'pending' || item.processing_status === 'processing';
  return (
    <Pressable
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onLongPress();
      }}
      style={styles.tile}
    >
      {item.signedUrl ? (
        <Image source={{ uri: item.signedUrl }} style={styles.tileImg} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.tileImg, styles.tilePlaceholder]}>
          <Ionicons name="shirt-outline" size={28} color={colors.blushDeep} />
        </View>
      )}
      {processing ? (
        <View style={styles.processing}>
          <ActivityIndicator color={colors.cream} size="small" />
          <ThemedText variant="labelSmall" color={colors.cream} style={styles.processingText}>
            Styling…
          </ThemedText>
        </View>
      ) : null}
      {item.name ? (
        <View style={styles.tileLabel}>
          <ThemedText variant="labelSmall" color={colors.cream} numberOfLines={1}>
            {item.name}
          </ThemedText>
        </View>
      ) : null}
    </Pressable>
  );
}

// Tighter gap for the 3-up Instagram-style grid.
const H_PADDING = spacing.lg;
const GAP = spacing.sm;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    pad: { paddingHorizontal: spacing.lg },
    metaRow: { paddingBottom: spacing.md },
    banner: { paddingBottom: spacing.md },
    list: { paddingHorizontal: H_PADDING, paddingBottom: 120 },
    column: { gap: GAP },
    tile: {
      flex: 1,
      // With 1–2 items, flex:1 would stretch a lone tile across the whole row —
      // cap it so a single piece still renders as one small grid cell.
      maxWidth: '33.33%',
      marginBottom: GAP,
      borderRadius: radius.md,
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.border,
      overflow: 'hidden',
    },
    tileImg: { width: '100%', aspectRatio: 1 },
    tilePlaceholder: {
      backgroundColor: c.pearl,
      alignItems: 'center',
      justifyContent: 'center',
    },
    processing: {
      ...fillObject,
      backgroundColor: c.overlay,
      alignItems: 'center',
      justifyContent: 'center',
    },
    processingText: { marginTop: spacing.xs },
    tileLabel: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 0,
      paddingHorizontal: spacing.sm,
      paddingVertical: spacing.xs,
      backgroundColor: c.overlay,
    },
    fab: {
      position: 'absolute',
      right: spacing.lg,
      bottom: spacing.xl,
      width: 60,
      height: 60,
      borderRadius: 30,
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.ink,
      shadowOpacity: 0.25,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 6,
    },
  });
