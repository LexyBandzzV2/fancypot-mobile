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
import { openLookSource, openProductUrl } from '@/lib/affiliate';
import {
  AppHeader,
  BottomSheet,
  SheetAction,
  EmptyState,
  SkeletonGrid,
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
  const { user } = useAuth();
  const { outfits, loading, reload, remove } = useOutfits();
  const {
    items: savedItems,
    loading: itemsLoading,
    reload: reloadItems,
    remove: removeItem,
  } = useSavedItems();
  const [selected, setSelected] = useState<OutfitDisplay | null>(null);
  const [selectedItem, setSelectedItem] = useState<SavedItem | null>(null);
  const [tab, setTab] = useState<Tab>('items');
  // Outfits added to the closet this session — drives the tile's checkmark and
  // stops a second tap from creating a duplicate closet item.
  const [addedToCloset, setAddedToCloset] = useState<Set<string>>(new Set());
  const [toast, setToast] = useState<string | null>(null);

  // Outfits are the AI-composed looks (Style Me / Try-on). Items now come from
  // the real saved_items table (feed / Get the Look), so the Outfits tab shows
  // ALL outfits — no more source_url split.
  const outfitLooks = outfits;

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
    Alert.alert('Remove this?', 'This removes it from your saved library.', [
      { text: 'Cancel', style: 'cancel' },
      { text: 'Remove', style: 'destructive', onPress: () => remove(o.id) },
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
        ? 'Your saved library'
        : `${outfitLooks.length} saved ${outfitLooks.length === 1 ? 'outfit' : 'outfits'}`
      : itemsLoading && savedItems.length === 0
        ? 'Your saved library'
        : `${savedItems.length} saved ${savedItems.length === 1 ? 'item' : 'items'}`;

  const showOutfits = tab === 'outfits';

  return (
    <View style={styles.root}>
      <AppHeader title="Saved" subtitle={countLabel} />

      {/* Segmented toggle between the two libraries. */}
      <View style={styles.segment}>
        <SegmentPill label="Items" count={savedItems.length} active={tab === 'items'} onPress={() => setTab('items')} />
        <SegmentPill label="Outfits" count={outfitLooks.length} active={tab === 'outfits'} onPress={() => setTab('outfits')} />
      </View>

      {showOutfits ? (
        loading && outfits.length === 0 ? (
          <View style={styles.pad}>
            <SkeletonGrid count={4} />
          </View>
        ) : outfitLooks.length === 0 ? (
          <EmptyLibrary styles={styles}>
            <EmptyState
              icon="sparkles-outline"
              title="No outfits yet"
              body="Generate an outfit in Style Me and save the ones you love."
              actionLabel="Create an outfit"
              onAction={() => router.push('/style/stylist')}
            />
          </EmptyLibrary>
        ) : (
          <FlatList
            data={outfitLooks}
            keyExtractor={(o) => o.id}
            numColumns={NUM_COLUMNS}
            columnWrapperStyle={styles.column}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            refreshControl={
              <RefreshControl refreshing={false} onRefresh={reload} tintColor={colors.blushDeep} />
            }
            renderItem={({ item }) => {
              const added = addedToCloset.has(item.id);
              const count = item.item_ids?.length ?? 0;
              const meta =
                count > 0 ? `${count} ${count === 1 ? 'piece' : 'pieces'}` : item.occasion;
              return (
                <Pressable
                  style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
                  onPress={() =>
                    router.push({ pathname: '/style/outfit/[id]', params: { id: item.id } })
                  }
                  onLongPress={() => {
                    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                    setSelected(item);
                  }}
                  accessibilityRole="button"
                  accessibilityLabel={item.name ?? 'Saved look'}
                  accessibilityHint="Opens the outfit with recommendations. Long press for more options."
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
                    onPress={() => addToCloset(item)}
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
        )
      ) : itemsLoading && savedItems.length === 0 ? (
        <View style={styles.pad}>
          <SkeletonGrid count={4} />
        </View>
      ) : savedItems.length === 0 ? (
        <EmptyLibrary styles={styles}>
          <EmptyState
            icon="bookmark-outline"
            title="Nothing saved yet"
            body="Browse the Style Feed or swipe looks in Get the Look — pieces you love land here."
            actionLabel="Get the look"
            onAction={() => router.push('/style/get-the-look')}
          />
        </EmptyLibrary>
      ) : (
        <FlatList
          data={savedItems}
          keyExtractor={(i) => i.id}
          numColumns={NUM_COLUMNS}
          columnWrapperStyle={styles.column}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={false} onRefresh={reloadItems} tintColor={colors.blushDeep} />
          }
          renderItem={({ item }) => (
            <Pressable
              style={({ pressed }) => [styles.tile, pressed && styles.tilePressed]}
              onPress={() => item.product_url && openProductUrl(item.product_url)}
              onLongPress={() => {
                Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
                setSelectedItem(item);
              }}
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
      )}

      {/* Outfit actions. */}
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
          label="Remove"
          destructive
          icon={<Ionicons name="trash-outline" size={22} color={colors.danger} />}
          onPress={() => selected && confirmDelete(selected)}
        />
      </BottomSheet>

      {/* Saved item actions. */}
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
          label="Remove"
          destructive
          icon={<Ionicons name="trash-outline" size={22} color={colors.danger} />}
          onPress={() => selectedItem && confirmDeleteItem(selectedItem)}
        />
      </BottomSheet>

      <Toast message={toast} onHide={() => setToast(null)} />
    </View>
  );
}

/** Shared empty-state shell with the decorative faint pink grid background. */
function EmptyLibrary({
  children,
  styles,
}: {
  children: React.ReactNode;
  styles: ReturnType<typeof makeStyles>;
}) {
  return (
    <View style={styles.emptyContainer}>
      <View style={styles.gridBackground} pointerEvents="none">
        {[...Array(8)].map((_, rowIdx) => (
          <View key={`row-${rowIdx}`} style={styles.gridRow}>
            {[...Array(3)].map((_, colIdx) => (
              <View key={`cell-${rowIdx}-${colIdx}`} style={styles.gridCell} />
            ))}
          </View>
        ))}
      </View>
      <View style={styles.emptyContent}>{children}</View>
    </View>
  );
}

/** One pill in the Outfits / Items segmented toggle. */
function SegmentPill({
  label,
  count,
  active,
  onPress,
}: {
  label: string;
  count: number;
  active: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      style={[styles.segPill, active && styles.segPillOn]}
      accessibilityRole="button"
      accessibilityState={{ selected: active }}
    >
      <ThemedText variant="label" color={active ? colors.white : colors.ink}>
        {label}
      </ThemedText>
      <ThemedText variant="labelSmall" color={active ? colors.white : colors.inkMuted}>
        {count}
      </ThemedText>
    </Pressable>
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
    // Outfits / Items segmented toggle on a blush track (matches the appearance
    // selector's pink-fill selection language).
    segment: {
      flexDirection: 'row',
      gap: spacing.xs,
      backgroundColor: c.pinkWarmGlow,
      borderRadius: radius.pill,
      padding: spacing.xs,
      marginHorizontal: spacing.lg,
      marginBottom: spacing.sm,
    },
    segPill: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'center',
      gap: spacing.xs,
      paddingVertical: spacing.sm,
      minHeight: 38,
      borderRadius: radius.pill,
    },
    segPillOn: { backgroundColor: c.pinkWarm },
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
    // Floating quick-add-to-closet button on outfit tiles.
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
