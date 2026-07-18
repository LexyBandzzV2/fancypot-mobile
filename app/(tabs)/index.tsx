import React, { useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ActivityIndicator,
  Alert,
  Dimensions,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  AppHeader,
  HeaderIconButton,
  BottomSheet,
  SheetAction,
  Button,
  EmptyState,
  SkeletonGrid,
  TextField,
  UsageLimitBanner,
  ThemedText,
} from '@/components';
import type { Colors } from '@/theme/colors';
import { radius, spacing, fillObject, useThemedStyles } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { useWardrobe, type WardrobeDisplayItem } from '@/hooks/useWardrobe';
import { useImagePicker } from '@/hooks/useImagePicker';
import { useSubscription } from '@/providers/SubscriptionProvider';
import { WARDROBE_CATEGORIES } from '@/lib/api';

// A piece still 'pending' after this long is considered stalled — the styling
// call was refused or died (the backend meters it and can decline). The tile
// then offers a retry instead of an eternal spinner.
const STALL_MS = 3 * 60 * 1000;

function isProcessing(item: WardrobeDisplayItem): boolean {
  return item.processing_status === 'pending' || item.processing_status === 'processing';
}

function isFailed(item: WardrobeDisplayItem): boolean {
  return (
    item.processing_status === 'error' ||
    item.processing_status === 'failed' ||
    !!item.processing_error
  );
}

function isStalled(item: WardrobeDisplayItem): boolean {
  if (!isProcessing(item)) return false;
  const started = new Date(item.created_at).getTime();
  return Number.isFinite(started) && Date.now() - started > STALL_MS;
}

export default function ClosetScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { items, loading, add, remove, reload, retryProcessing, update } = useWardrobe();
  const { fromCamera, fromLibrary } = useImagePicker();
  const { tier } = useSubscription();
  const [addSheet, setAddSheet] = useState(false);
  const [selected, setSelected] = useState<WardrobeDisplayItem | null>(null);
  const [uploading, setUploading] = useState(false);
  // Edit-details sheet: opened right after an upload (skippable) and from the
  // long-press menu on any piece.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const atLimit = items.length >= tier.limits.wardrobeItems;

  const openEditor = (id: string, name: string | null, category: string | null) => {
    setEditId(id);
    setEditName(name ?? '');
    setEditCategory(category && category !== 'Uncategorized' ? category : null);
  };

  const closeEditor = () => {
    setEditId(null);
    setEditName('');
    setEditCategory(null);
  };

  const saveEdit = async () => {
    if (!editId) return;
    setSavingEdit(true);
    try {
      await update(editId, {
        // Empty name → null so the AI classifier's name (when it lands) wins.
        name: editName.trim() || null,
        ...(editCategory ? { category: editCategory } : {}),
      });
      closeEditor();
    } catch (e: any) {
      Alert.alert('Could not save details', e?.message ?? 'Please try again.');
    } finally {
      setSavingEdit(false);
    }
  };

  const handleAdd = async (source: 'camera' | 'library') => {
    setAddSheet(false);
    if (atLimit) return;
    const picked = source === 'camera' ? await fromCamera() : await fromLibrary();
    if (!picked) return;
    setUploading(true);
    try {
      const row = await add(picked.base64);
      Haptics.notificationAsync(Haptics.NotificationFeedbackType.Success);
      // Offer details right away (name / category). Skipping is fine — the AI
      // classifier fills category in the background either way.
      if (row) openEditor(row.id, row.name, row.category);
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

  const editingItem = editId ? items.find((i) => i.id === editId) : null;

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
          numColumns={NUM_COLUMNS}
          ListHeaderComponent={header}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.blushDeep} />
          }
          renderItem={({ item }) => (
            <ClosetTile
              item={item}
              onPress={() => {
                // Stalled/failed pieces retry on tap; settled pieces open edit.
                if (isStalled(item) || isFailed(item)) {
                  retryProcessing(item);
                } else if (!isProcessing(item)) {
                  openEditor(item.id, item.name, item.category);
                }
              }}
              onLongPress={() => setSelected(item)}
            />
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
          label="Edit details"
          icon={<Ionicons name="create-outline" size={22} color={colors.ink} />}
          onPress={() => {
            const it = selected;
            setSelected(null);
            if (it) openEditor(it.id, it.name, it.category);
          }}
        />
        {selected && (isStalled(selected) || isFailed(selected)) ? (
          <SheetAction
            label="Retry styling"
            icon={<Ionicons name="refresh-outline" size={22} color={colors.ink} />}
            onPress={() => {
              const it = selected;
              setSelected(null);
              if (it) retryProcessing(it);
            }}
          />
        ) : null}
        <SheetAction
          label="Remove from closet"
          destructive
          icon={<Ionicons name="trash-outline" size={22} color={colors.danger} />}
          onPress={() => selected && confirmDelete(selected)}
        />
      </BottomSheet>

      {/* Edit details: offered right after upload (skippable) and on demand. */}
      <BottomSheet visible={!!editId} onClose={closeEditor} title="Piece details">
        {editingItem?.signedUrl ? (
          <View style={styles.editPreviewWrap}>
            <Image source={{ uri: editingItem.signedUrl }} style={styles.editPreview} contentFit="cover" />
          </View>
        ) : null}
        <TextField
          label="NAME"
          placeholder="e.g. Black slip dress"
          value={editName}
          onChangeText={setEditName}
          returnKeyType="done"
        />
        <ThemedText variant="label" color={colors.inkMuted} style={styles.editLabel}>
          CATEGORY
        </ThemedText>
        <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.editHint}>
          Leave unpicked and we'll sort it for you automatically.
        </ThemedText>
        <View style={styles.categoryChips}>
          {WARDROBE_CATEGORIES.map((c) => {
            const on = editCategory === c;
            return (
              <Pressable
                key={c}
                onPress={() => setEditCategory(on ? null : c)}
                style={[styles.categoryChip, on && styles.categoryChipOn]}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
              >
                <ThemedText variant="label" color={on ? colors.cream : colors.ink}>
                  {c}
                </ThemedText>
              </Pressable>
            );
          })}
        </View>
        <View style={styles.editActions}>
          <Button label="Skip" variant="ghost" fullWidth={false} onPress={closeEditor} />
          <Button label="Save details" fullWidth={false} onPress={saveEdit} loading={savingEdit} />
        </View>
      </BottomSheet>
    </View>
  );
}

function ClosetTile({
  item,
  onPress,
  onLongPress,
}: {
  item: WardrobeDisplayItem;
  onPress: () => void;
  onLongPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const stalled = isStalled(item);
  const failed = isFailed(item);
  const processing = isProcessing(item) && !stalled;
  return (
    <Pressable
      onPress={onPress}
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
      ) : stalled || failed ? (
        <View style={styles.processing}>
          <Ionicons name="refresh" size={20} color={colors.cream} />
          <ThemedText variant="labelSmall" color={colors.cream} style={styles.processingText}>
            Tap to retry
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

// Instagram-style grid: fixed-width square tiles computed from the screen so a
// single item stays small in its column instead of stretching full-width.
const NUM_COLUMNS = 3;
const H_PADDING = spacing.lg;
const GAP = spacing.sm;
const TILE_W =
  (Dimensions.get('window').width - H_PADDING * 2 - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    pad: { paddingHorizontal: spacing.lg },
    metaRow: { paddingBottom: spacing.md },
    banner: { paddingBottom: spacing.md },
    list: { paddingHorizontal: H_PADDING, paddingBottom: 120 },
    column: { gap: GAP, marginBottom: GAP },
    tile: {
      width: TILE_W,
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
    editPreviewWrap: { alignItems: 'center', marginBottom: spacing.md },
    editPreview: {
      width: 88,
      height: 104,
      borderRadius: radius.md,
      backgroundColor: c.pearl,
    },
    editLabel: { letterSpacing: 1, marginTop: spacing.md, marginBottom: spacing.xs },
    editHint: { marginBottom: spacing.sm, lineHeight: 16 },
    categoryChips: { flexDirection: 'row', flexWrap: 'wrap', gap: spacing.sm },
    categoryChip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      borderWidth: 1,
      borderColor: c.borderStrong,
      backgroundColor: c.white,
      minHeight: 40,
      justifyContent: 'center',
    },
    categoryChipOn: { backgroundColor: c.ink, borderColor: c.ink },
    editActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.md,
      marginTop: spacing.lg,
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
