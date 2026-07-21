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
import { openProductUrl } from '@/lib/affiliate';
import {
  AppHeader,
  BottomSheet,
  SheetAction,
  EmptyState,
  SkeletonGrid,
  Chip,
  Toast,
} from '@/components';
import { ThemedText } from '@/components';
import type { Colors } from '@/theme/colors';
import { fonts, radius, spacing, useThemedStyles } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import { useAuth } from '@/providers/AuthProvider';
import { useOutfits, type OutfitDisplay } from '@/hooks/useOutfits';
import { useSavedItems } from '@/hooks/useSavedItems';
import { addOutfitToCloset, type SavedItem } from '@/lib/api';

type Tab = 'outfits' | 'items';

export default function SavedScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const router = useRouter();
  const { outfits, loading, reload, remove } = useOutfits();
  const {
    items: savedItems,
    loading: itemsLoading,
    reload: reloadItems,
    remove: removeItem,
  } = useSavedItems();
  const { user } = useAuth();
  const [tab, setTab] = useState<Tab>('outfits');
  const [selected, setSelected] = useState<OutfitDisplay | null>(null);
  const [selectedItem, setSelectedItem] = useState<SavedItem | null>(null);
  // Outfits added to the closet this session — drives the tile's checkmark and
  // stops a second tap from creating a duplicate closet item.
  const [addedToCloset, setAddedToCloset] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Quick-tap: file a saved look straight into the closet, no questionnaire.
  const addToCloset = async (o: OutfitDisplay) => {
    if (!user || addedToCloset.has(o.id)) return;
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    setAddedToCloset((prev) => new Set(prev).add(o.id));
    try {
      await addOutfitToCloset(user.id, { image_url: o.image_url, name: o.name });
      setToast('Added to closet');
    } catch (e: any) {
      // Roll back the optimistic checkmark and explain.
      setAddedToCloset((prev) => {
        const next = new Set(prev);
        next.delete(o.id);
        return next;
      });
      const msg = String(e?.message ?? '');
      Alert.alert(
        'Could not add to closet',
        /limit|cap|maximum|full/i.test(msg)
          ? 'Your closet is full. Upgrade for more space, or remove a few pieces.'
          : 'Something went wrong adding this to your closet. Please try again.',
      );
    }
  };

  const confirmDelete = (o: OutfitDisplay) => {
    setSelected(null);
    Alert.alert('Delete outfit?', 'This removes it from your saved looks.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Delete', style: 'destructive', onPress: () => remove(o.id) },
    ]);
  };

  const confirmDeleteItem = (i: SavedItem) => {
    setSelectedItem(null);
    Alert.alert('Remove item?', 'This removes it from your saved items.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => removeItem(i.id) },
    ]);
  };

  const countLabel =
    tab === 'outfits'
      ? loading && outfits.length === 0
        ? 'Your outfit library'
        : `${outfits.length} saved ${outfits.length === 1 ? 'look' : 'looks'}`
      : itemsLoading && savedItems.length === 0
        ? 'One-off finds you kept'
        : `${savedItems.length} saved ${savedItems.length === 1 ? 'item' : 'items'}`;

  return (
    <View style={styles.root}>
      <AppHeader title="Saved Looks" subtitle={countLabel} />

      {/* Two-section toggle: composed outfits vs. one-off saved items. */}
      <View style={styles.tabs}>
        <Chip
          label={`Saved Outfits · ${outfits.length}`}
          selected={tab === 'outfits'}
          onPress={() => setTab('outfits')}
        />
        <Chip
          label={`Saved Items · ${savedItems.length}`}
          selected={tab === 'items'}
          onPress={() => setTab('items')}
        />
      </View>

      {tab === 'outfits' ? (
        <OutfitsTab
          outfits={outfits}
          loading={loading}
          reload={reload}
          onLongPress={setSelected}
          onOpen={(o) => router.push({ pathname: '/style/try-on', params: { outfitId: o.id } })}
          onCreate={() => router.push('/style/stylist')}
          onAddToCloset={addToCloset}
          addedIds={addedToCloset}
          styles={styles}
          colors={colors}
        />
      ) : (
        <ItemsTab
          items={savedItems}
          loading={itemsLoading}
          reload={reloadItems}
          onOpen={(i) => i.product_url && openProductUrl(i.product_url)}
          onLongPress={(i) => {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            setSelectedItem(i);
          }}
          onBrowse={() => router.push('/feed')}
          styles={styles}
          colors={colors}
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
        {/* Only shoppable looks (Get the Look matches) carry a source_url. */}
        {selected?.source_url ? (
          <SheetAction
            label="Get the look"
            icon={<Ionicons name="bag-handle-outline" size={22} color={colors.ink} />}
            onPress={() => {
              const url = selected.source_url;
              setSelected(null);
              openProductUrl(url);
            }}
          />
        ) : null}
        <SheetAction
          label="Delete outfit"
          destructive
          icon={<Ionicons name="trash-outline" size={22} color={colors.danger} />}
          onPress={() => selected && confirmDelete(selected)}
        />
      </BottomSheet>

      <BottomSheet
        visible={!!selectedItem}
        onClose={() => setSelectedItem(null)}
        title={selectedItem?.name ?? undefined}
      >
        {selectedItem?.product_url ? (
          <SheetAction
            label="Shop this item"
            icon={<Ionicons name="bag-handle-outline" size={22} color={colors.ink} />}
            onPress={() => {
              const url = selectedItem.product_url;
              setSelectedItem(null);
              if (url) openProductUrl(url);
            }}
          />
        ) : null}
        <SheetAction
          label="Remove item"
          destructive
          icon={<Ionicons name="trash-outline" size={22} color={colors.danger} />}
          onPress={() => selectedItem && confirmDeleteItem(selectedItem)}
        />
      </BottomSheet>

      <Toast message={toast} onHide={() => setToast(null)} />
    </View>
  );
}

function OutfitsTab({
  outfits,
  loading,
  reload,
  onLongPress,
  onOpen,
  onCreate,
  onAddToCloset,
  addedIds,
  styles,
  colors,
}: {
  outfits: OutfitDisplay[];
  loading: boolean;
  reload: () => void;
  onLongPress: (o: OutfitDisplay) => void;
  onOpen: (o: OutfitDisplay) => void;
  onCreate: () => void;
  onAddToCloset: (o: OutfitDisplay) => void;
  addedIds: Set<string>;
  styles: Styles;
  colors: Colors;
}) {
  if (loading && outfits.length === 0) {
    return (
      <View style={styles.pad}>
        <SkeletonGrid count={4} />
      </View>
    );
  }
  if (outfits.length === 0) {
    return (
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
            title="No outfits yet"
            body="Outfits you make in Style me or Virtual try-on will live here"
            actionLabel="Create a look"
            onAction={onCreate}
          />
        </View>
      </View>
    );
  }
  return (
    <FlatList
      data={outfits}
      keyExtractor={(o) => o.id}
      numColumns={2}
      columnWrapperStyle={styles.column}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.blushDeep} />
      }
      renderItem={({ item }) => {
        const added = addedIds.has(item.id);
        const count = item.item_ids?.length ?? 0;
        const meta = count > 0 ? `${count} ${count === 1 ? 'item' : 'items'}` : item.occasion;
        return (
          <Pressable
            style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
            onPress={() => onOpen(item)}
            onLongPress={() => {
              Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
              onLongPress(item);
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
            {/* Quick-tap: add this look to the closet (no questionnaire). */}
            <Pressable
              style={[styles.addBtn, added && styles.addBtnOn]}
              hitSlop={8}
              disabled={added}
              onPress={() => onAddToCloset(item)}
              accessibilityRole="button"
              accessibilityLabel={added ? 'Added to closet' : 'Add to closet'}
            >
              <Ionicons
                name={added ? 'checkmark' : 'add'}
                size={16}
                color={added ? colors.white : colors.pinkWarm}
              />
            </Pressable>
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
  );
}

function ItemsTab({
  items,
  loading,
  reload,
  onOpen,
  onLongPress,
  onBrowse,
  styles,
  colors,
}: {
  items: SavedItem[];
  loading: boolean;
  reload: () => void;
  onOpen: (i: SavedItem) => void;
  onLongPress: (i: SavedItem) => void;
  onBrowse: () => void;
  styles: Styles;
  colors: Colors;
}) {
  if (loading && items.length === 0) {
    return (
      <View style={styles.pad}>
        <SkeletonGrid count={4} />
      </View>
    );
  }
  if (items.length === 0) {
    return (
      <View style={styles.emptyContent}>
        <EmptyState
          icon="pricetag-outline"
          title="No saved items yet"
          body="Double-tap a piece in the feed, or keep looks in Get the look, to save them here"
          actionLabel="Browse the feed"
          onAction={onBrowse}
        />
      </View>
    );
  }
  return (
    <FlatList
      data={items}
      keyExtractor={(i) => i.id}
      numColumns={2}
      columnWrapperStyle={styles.column}
      contentContainerStyle={styles.list}
      showsVerticalScrollIndicator={false}
      refreshControl={
        <RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.blushDeep} />
      }
      renderItem={({ item }) => (
        <Pressable
          style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
          onPress={() => onOpen(item)}
          onLongPress={() => onLongPress(item)}
          accessibilityRole="button"
          accessibilityLabel={item.name ?? 'Saved item'}
          accessibilityHint="Opens the retailer product page. Long press for more options."
        >
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.img} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.img, styles.placeholder]}>
              <Ionicons name="pricetag-outline" size={26} color={colors.blushDeep} />
            </View>
          )}
          <View style={styles.label}>
            {item.brand ? (
              <ThemedText variant="labelSmall" color={colors.inkMuted} numberOfLines={1}>
                {item.brand.toUpperCase()}
              </ThemedText>
            ) : null}
            <ThemedText style={styles.lookName} numberOfLines={1}>
              {item.name ?? 'Saved item'}
            </ThemedText>
            {item.price != null && String(item.price).length > 0 ? (
              <ThemedText variant="labelSmall" color={colors.ink}>
                {String(item.price).startsWith('$') || String(item.price).match(/[€£¥]/)
                  ? String(item.price)
                  : `$${item.price}`}
              </ThemedText>
            ) : null}
          </View>
        </Pressable>
      )}
    />
  );
}

const GAP = spacing.md;
const GRID_GAP = 12;
const GRID_OPACITY = 0.15;

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    pad: { paddingHorizontal: spacing.lg },
    tabs: {
      flexDirection: 'row',
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingBottom: spacing.md,
    },
    list: { paddingHorizontal: spacing.lg, paddingBottom: 120 },
    column: { gap: GAP },
    // Editorial look card, matching the web saved grid: radius 24, blush-glow
    // border, soft rose shadow, 3:4 image with name + meta beneath.
    tile: {
      flex: 1,
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
    addBtn: {
      position: 'absolute',
      top: spacing.xs,
      right: spacing.xs,
      width: 28,
      height: 28,
      borderRadius: 14,
      backgroundColor: c.white,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
    },
    addBtnOn: { backgroundColor: c.pinkWarm, borderColor: c.pinkWarm },
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

type Styles = ReturnType<typeof makeStyles>;
