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
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import {
  AppHeader,
  BottomSheet,
  SheetAction,
  Button,
  Chip,
  ChipWrap,
  EmptyState,
  FloatingActionButton,
  SectionLabel,
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
  // Client-side browse filters (web closet's search field + category chips):
  // never touch the API — a simple name/category narrowing of loaded items.
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState<string | null>(null);
  // Edit-details sheet: opened right after an upload (skippable) and from the
  // long-press menu on any piece.
  const [editId, setEditId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [editCategory, setEditCategory] = useState<string | null>(null);
  const [savingEdit, setSavingEdit] = useState(false);

  const atLimit = items.length >= tier.limits.wardrobeItems;

  const visibleItems = useMemo(() => {
    const q = query.trim().toLowerCase();
    return items.filter((i) => {
      if (q && !(i.name ?? '').toLowerCase().includes(q)) return false;
      if (category && (i.category ?? '').toLowerCase() !== category.toLowerCase()) return false;
      return true;
    });
  }, [items, query, category]);

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

  const editingItem = editId ? items.find((i) => i.id === editId) : null;

  return (
    <View style={styles.root}>
      <AppHeader
        title="Your Closet"
        subtitle={`${items.length} of ${tier.limits.wardrobeItems} pieces · ${tier.name}`}
        right={
          <Pressable
            onPress={() => setAddSheet(true)}
            accessibilityRole="button"
            accessibilityLabel="Add piece"
            style={({ pressed }) => [styles.addBtn, pressed && styles.pressedDim]}
          >
            <Ionicons name="add" size={22} color={colors.white} />
          </Pressable>
        }
      />

      {atLimit ? (
        <View style={styles.banner}>
          <UsageLimitBanner
            message={`You've filled all ${tier.limits.wardrobeItems} ${tier.name} slots.`}
          />
        </View>
      ) : null}

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
        <>
          <View style={styles.searchWrap}>
            <TextField
              placeholder="Search your closet"
              value={query}
              onChangeText={setQuery}
              returnKeyType="search"
              autoCorrect={false}
              accessibilityLabel="Search your closet"
            />
          </View>
          <View>
            <ScrollView
              horizontal
              showsHorizontalScrollIndicator={false}
              contentContainerStyle={styles.categoryChips}
            >
              <Chip label="All" selected={category === null} onPress={() => setCategory(null)} />
              {WARDROBE_CATEGORIES.map((c) => (
                <Chip
                  key={c}
                  label={c}
                  selected={category === c}
                  onPress={() => setCategory(category === c ? null : c)}
                />
              ))}
            </ScrollView>
          </View>
          <FlatList
            data={visibleItems}
            keyExtractor={(i) => i.id}
            numColumns={NUM_COLUMNS}
            columnWrapperStyle={styles.column}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.blushDeep} />
            }
            ListEmptyComponent={
              <EmptyState
                icon="search-outline"
                title="No pieces match"
                body="Try a different search or category."
              />
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
        </>
      )}

      {/* Floating add button (thumb reachable) */}
      <FloatingActionButton
        icon="camera"
        tone="accent"
        loading={uploading}
        onPress={() => setAddSheet(true)}
        label="Add piece"
        style={styles.fab}
      />

      <BottomSheet visible={addSheet} onClose={() => setAddSheet(false)} title="Add to Closet">
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
        <SectionLabel hint="Leave unpicked and we'll sort it for you automatically.">
          CATEGORY
        </SectionLabel>
        <ChipWrap>
          {WARDROBE_CATEGORIES.map((c) => (
            <Chip
              key={c}
              label={c}
              selected={editCategory === c}
              onPress={() => setEditCategory(editCategory === c ? null : c)}
            />
          ))}
        </ChipWrap>
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
  const category =
    item.category && item.category !== 'Uncategorized' ? item.category : null;
  return (
    <Pressable
      onPress={onPress}
      onLongPress={() => {
        Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
        onLongPress();
      }}
      accessibilityRole="button"
      accessibilityLabel={item.name ?? 'Closet piece'}
      style={({ pressed }) => [styles.tile, pressed && styles.pressedDim]}
    >
      <View style={styles.tileImgWrap}>
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
      </View>
      <View style={styles.tileMeta}>
        <ThemedText variant="labelSmall" color={colors.ink} numberOfLines={1}>
          {item.name ?? 'Untitled piece'}
        </ThemedText>
        {category ? (
          <ThemedText variant="labelSmall" color={colors.inkMuted} numberOfLines={1} style={styles.tileCaption}>
            {category}
          </ThemedText>
        ) : null}
      </View>
    </Pressable>
  );
}

// Web closet grid: two editorial columns of white rounded cards.
const NUM_COLUMNS = 2;
const H_PADDING = spacing.lg;
const GAP = spacing.md;
const TILE_W =
  (Dimensions.get('window').width - H_PADDING * 2 - GAP * (NUM_COLUMNS - 1)) / NUM_COLUMNS;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    pad: { paddingHorizontal: spacing.lg },
    pressedDim: { opacity: 0.85 },
    // Web closet's round hot-pink add button with the pink glow shadow.
    addBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.pinkWarm,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 6 },
      elevation: 4,
    },
    banner: { paddingHorizontal: spacing.lg, paddingBottom: spacing.md },
    searchWrap: { paddingHorizontal: spacing.lg },
    categoryChips: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.sm,
    },
    list: { paddingHorizontal: H_PADDING, paddingBottom: 120, paddingTop: spacing.xs },
    column: { gap: GAP, marginBottom: GAP },
    // Web garment card: rounded-3xl white, pink-blush border, inner padding,
    // soft pink shadow.
    tile: {
      width: TILE_W,
      borderRadius: radius.lg,
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
      padding: 10, // web p-2.5
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.14,
      shadowRadius: 10,
      shadowOffset: { width: 0, height: 6 },
      elevation: 2,
    },
    tileImgWrap: {
      borderRadius: radius.md,
      overflow: 'hidden',
      backgroundColor: c.beige, // web --pink-cream well behind cutout photos
    },
    tileImg: { width: '100%', aspectRatio: 1 },
    tilePlaceholder: {
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
    tileMeta: { paddingHorizontal: spacing.xs, paddingTop: spacing.sm, paddingBottom: spacing.xs },
    tileCaption: { marginTop: 1 },
    editPreviewWrap: { alignItems: 'center', marginBottom: spacing.md },
    editPreview: {
      width: 88,
      height: 104,
      borderRadius: radius.md,
      backgroundColor: c.pearl,
    },
    editActions: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      gap: spacing.md,
      marginTop: spacing.lg,
    },
    // FloatingActionButton owns its size/color; lift it clear of the floating
    // tab bar (whose footprint is taller than the default FAB bottom offset).
    fab: { bottom: 108 },
  });
