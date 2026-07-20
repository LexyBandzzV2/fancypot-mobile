import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
  Animated,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import {
  AppHeader,
  BottomSheet,
  Button,
  Chip,
  ChipWrap,
  EmptyState,
  SectionLabel,
  SkeletonGrid,
  ThemedText,
} from '@/components';
import type { Colors } from '@/theme/colors';
import { fonts, radius, spacing, useThemedStyles } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import {
  getFeed,
  getFreshFeed,
  getScrapedFeed,
  isSyntheticProduct,
  reactToProduct,
  type FeedProduct,
} from '@/lib/api';
import { openProductUrl } from '@/lib/affiliate';
import { brandsMatch, budgetTierAllowed, resolveSavedBudgets, STORES, BUDGETS } from '@/lib/brands';
import { useAuth } from '@/providers/AuthProvider';

// A session-only filter: explore price ranges / brands beyond the saved
// profile for this browse, without touching persisted preferences. null when
// the user hasn't opened the filter — the feed then follows their profile.
interface FeedFilter {
  budgets: string[]; // empty = all tiers
  brands: string[]; // empty = all brands
}

export default function FeedScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { profile } = useAuth();
  const router = useRouter();
  // The three sources are held separately: curated (feed-page) is
  // store-independent and only refetched on mount / pull-to-refresh; fresh
  // (feed-fresh, non-AI SerpAPI) is store-scoped and refetched when the
  // active chip changes; scraped (feed_scraped_products, refreshed monthly by
  // the feed-scrape cron) is the full-catalog backbone, scoped server-side to
  // the user's saved stores when they have any. Each source keeps its last
  // good value on failure so a flaky network can never blank a loaded feed.
  const [freshProducts, setFreshProducts] = useState<FeedProduct[]>([]);
  const [scrapedProducts, setScrapedProducts] = useState<FeedProduct[]>([]);
  const [curatedProducts, setCuratedProducts] = useState<FeedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [freshLoading, setFreshLoading] = useState(false);
  const [refreshing, setRefreshing] = useState(false);
  const [reactions, setReactions] = useState<Record<string, 'like' | 'dislike' | 'save'>>({});
  const [activeStore, setActiveStore] = useState<string | null>(null);
  // Bumped on every refresh to reshuffle the visible order — the monthly
  // scrape rarely changes, so a fresh shuffle is what makes a pull-to-refresh
  // feel like new finds even when the underlying rows are the same.
  const [shuffleSeed, setShuffleSeed] = useState(1);
  // Session-only explore filter (null = follow saved profile). `draft` is the
  // sheet's working copy, committed to `filter` on Apply.
  const [filter, setFilter] = useState<FeedFilter | null>(null);
  const [filterOpen, setFilterOpen] = useState(false);
  const [draft, setDraft] = useState<FeedFilter>({ budgets: [], brands: [] });
  // Shown once the user has scrolled a few screens down: a compact "back to
  // top" nudge that also triggers a shuffle-refresh.
  const [showScrollTop, setShowScrollTop] = useState(false);
  const listRef = useRef<FlatList<FeedProduct>>(null);
  // Monotonic sequence for fresh fetches: a slow older request that resolves
  // after a newer one must not clobber the newer results.
  const freshReq = useRef(0);

  const savedStores = useMemo(() => {
    const prefs = (profile?.preferences ?? {}) as { stores?: string[] };
    return Array.isArray(prefs.stores) ? prefs.stores.filter(Boolean) : [];
  }, [profile]);

  const savedBudgets = useMemo(() => {
    const prefs = (profile?.preferences ?? {}) as { budgets?: string[]; budget?: string };
    return resolveSavedBudgets(prefs);
  }, [profile]);

  const products = useMemo(
    () => mergeFeeds(freshProducts, scrapedProducts, curatedProducts),
    [freshProducts, scrapedProducts, curatedProducts],
  );

  const visibleProducts = useMemo(() => {
    // Effective criteria: the session filter overrides the profile when active.
    // Budget/brand lists that are empty mean "no constraint — show all".
    const budgets = filter ? filter.budgets : savedBudgets;
    const brands: string[] | null = filter
      ? filter.brands.length
        ? filter.brands
        : null
      : activeStore
        ? [activeStore]
        : savedStores.length
          ? savedStores
          : null;

    let list = products.filter((p) => budgetTierAllowed(budgets, p.budget_tier));
    if (brands) list = list.filter((p) => brands.some((b) => brandsMatch(p.brand, b)));
    // Seeded shuffle: deterministic for a given seed, so it stays stable
    // across re-renders (and as async sources stream in) but reorders on every
    // refresh. Makes the feed feel fresh without re-scraping.
    return seededShuffle(list, shuffleSeed);
  }, [products, activeStore, savedStores, savedBudgets, filter, shuffleSeed]);

  const loadCurated = useCallback(async () => {
    try {
      setCuratedProducts(await getFeed());
    } catch {
      // keep the previous curated list
    }
  }, []);

  const loadFresh = useCallback(async (store: string | null) => {
    const seq = ++freshReq.current;
    setFreshLoading(true);
    try {
      const rows = await getFreshFeed(store ?? undefined);
      if (seq === freshReq.current) setFreshProducts(rows);
    } catch {
      // keep the previous fresh list
    } finally {
      if (seq === freshReq.current) setFreshLoading(false);
    }
  }, []);

  const loadScraped = useCallback(async () => {
    try {
      // Always pull the whole catalog so the in-feed filter can explore brands
      // beyond the user's saved stores. Brand/budget scoping is applied
      // client-side in visibleProducts (the catalog is a few thousand rows —
      // one query, cached until refresh).
      setScrapedProducts(await getScrapedFeed());
    } catch {
      // keep the previous scraped list
    }
  }, []);

  useEffect(() => {
    (async () => {
      await Promise.all([loadCurated(), loadFresh(null)]);
      setLoading(false);
    })();
  }, [loadCurated, loadFresh]);

  // Load the scraped catalog once on mount (loadScraped no longer depends on
  // saved stores — it always fetches the full catalog, scoped client-side).
  useEffect(() => {
    loadScraped();
  }, [loadScraped]);

  // Chip change → re-scope only the fresh source (curated is store-independent;
  // refetching it here would be wasted I/O). Skipped on mount — the effect
  // above owns the initial load.
  const didMount = useRef(false);
  useEffect(() => {
    if (!didMount.current) {
      didMount.current = true;
      return;
    }
    loadFresh(activeStore);
  }, [activeStore, loadFresh]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    // Reshuffle first so the reorder is visible immediately, even before the
    // (usually unchanged) network refetch resolves.
    setShuffleSeed((s) => s + 1);
    // Re-pull all sources; the monthly pg_cron job owns catalog scraping.
    await Promise.all([loadCurated(), loadFresh(activeStore), loadScraped()]);
    setRefreshing(false);
  }, [loadCurated, loadFresh, loadScraped, activeStore]);

  // "Back to top" nudge: jump to the top, then run the same shuffle-refresh.
  const scrollToTopAndRefresh = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
    onRefresh();
  }, [onRefresh]);

  // Reveal the nudge after ~one screen of scrolling. Kept shallow on purpose:
  // a store/budget-filtered feed can be short, and a deeper trigger (this was
  // 1600 once) means the button never appears on it at all. setState with an
  // unchanged boolean is a no-op in React, so this is cheap to call on every
  // scroll frame.
  const onScroll = useCallback(
    (e: { nativeEvent: { contentOffset: { y: number } } }) => {
      setShowScrollTop(e.nativeEvent.contentOffset.y > 600);
    },
    [],
  );

  // Open the sheet seeded with whatever's currently applied (or the profile
  // defaults on first open), so the user edits from the live state.
  const openFilter = useCallback(() => {
    setDraft(filter ?? { budgets: savedBudgets, brands: [] });
    setFilterOpen(true);
  }, [filter, savedBudgets]);

  const applyFilter = useCallback(() => {
    // An empty selection is the same as no filter — fall back to the profile
    // rather than leaving an "active but matches everything" state.
    setFilter(draft.budgets.length || draft.brands.length ? draft : null);
    setFilterOpen(false);
    setShuffleSeed((s) => s + 1); // reshuffle so the new selection reads as fresh
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
  }, [draft]);

  const clearFilter = useCallback(() => {
    setFilter(null);
    setFilterOpen(false);
  }, []);

  const toggleDraft = useCallback((key: keyof FeedFilter, value: string) => {
    setDraft((d) => {
      const list = d[key];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...d, [key]: next };
    });
  }, []);

  const react = useCallback(
    async (product: FeedProduct, reaction: 'like' | 'dislike' | 'save') => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setReactions((prev) => ({ ...prev, [product.id]: reaction }));
      try {
        await reactToProduct(product.id, reaction);
        if (reaction === 'dislike') {
          setFreshProducts((prev) => prev.filter((p) => p.id !== product.id));
          setScrapedProducts((prev) => prev.filter((p) => p.id !== product.id));
          setCuratedProducts((prev) => prev.filter((p) => p.id !== product.id));
        }
      } catch {
        // ignore; optimistic
      }
    },
    [],
  );

  const filterCount = filter ? filter.budgets.length + filter.brands.length : 0;

  return (
    <View style={styles.root}>
      <AppHeader
        title="Style Feed"
        subtitle="Fresh finds from the places you love"
        right={
          // Web's circular search affordance — wired to the filter sheet (the
          // nearest real "narrow the feed" function; there is no text search).
          <Pressable
            onPress={openFilter}
            accessibilityRole="button"
            accessibilityLabel="Filter the feed"
            style={({ pressed }) => [styles.searchBtn, pressed && styles.pressedDim]}
          >
            <Ionicons name="search" size={17} color={colors.pinkWarm} />
          </Pressable>
        }
      />
      <View style={styles.controlsRow}>
        <Pressable
          onPress={openFilter}
          accessibilityRole="button"
          accessibilityLabel={filterCount > 0 ? `Filters, ${filterCount} active` : 'Filters'}
          style={({ pressed }) => [styles.filterPill, pressed && styles.pressedDim]}
        >
          <Ionicons name="options-outline" size={16} color={colors.pinkWarm} />
          <ThemedText variant="labelSmall">
            {filterCount > 0 ? `Filters · ${filterCount}` : 'Filters'}
          </ThemedText>
        </Pressable>
        {filter ? (
          <Pressable onPress={clearFilter} hitSlop={8} style={styles.clearBtn} accessibilityRole="button">
            <Ionicons name="close-circle" size={16} color={colors.inkMuted} />
            <ThemedText variant="label" color={colors.inkMuted}>
              Clear
            </ThemedText>
          </Pressable>
        ) : null}
      </View>
      {/* The saved-store quick chips make sense only when the session filter
          isn't overriding brand selection. */}
      {!filter && savedStores.length > 0 ? (
        <StoreChipRow stores={savedStores} active={activeStore} onChange={setActiveStore} />
      ) : null}
      {loading ? (
        <View style={styles.pad}>
          <SkeletonGrid count={4} />
        </View>
      ) : products.length === 0 ? (
        <>
          <EmptyState
            icon="sparkles-outline"
            title="No finds yet"
            body="Pull to refresh and we'll pull fresh pieces matched to your style."
            actionLabel="Refresh feed"
            onAction={onRefresh}
          />
          {savedStores.length === 0 ? (
            <View style={styles.pickStoresAction}>
              <Button
                label="Pick your favorite stores"
                fullWidth={false}
                onPress={() => router.push('/settings/preferences')}
              />
            </View>
          ) : null}
        </>
      ) : (
        <FlatList
          ref={listRef}
          data={visibleProducts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          onScroll={onScroll}
          scrollEventThrottle={64}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blushDeep} />
          }
          renderItem={({ item }) => (
            <ProductCard item={item} reaction={reactions[item.id]} onReact={react} />
          )}
          ListEmptyComponent={
            // A chip/filter can narrow the current list to nothing while its
            // fresh fetch is still in flight — show a skeleton, not a false empty.
            freshLoading ? (
              <SkeletonGrid count={2} />
            ) : filter ? (
              <EmptyState
                icon="funnel-outline"
                title="Nothing matches this filter"
                body="Try widening the price ranges or brands — or clear the filter."
              />
            ) : (
              <EmptyState
                icon="storefront-outline"
                title="Nothing from this store yet"
                body="Try another store, or pull to refresh."
              />
            )
          }
        />
      )}
      {!loading && products.length > 0 ? (
        <RefreshNudge visible={showScrollTop} onPress={scrollToTopAndRefresh} />
      ) : null}

      <BottomSheet visible={filterOpen} onClose={() => setFilterOpen(false)} title="Filters">
        <ScrollView showsVerticalScrollIndicator={false} style={styles.sheetScroll}>
          <SectionLabel hint="Mix any ranges — leave all off to see every price.">
            PRICE RANGE
          </SectionLabel>
          <ChipWrap>
            {BUDGETS.map((b) => (
              <Chip
                key={b}
                label={b}
                selected={draft.budgets.includes(b)}
                onPress={() => toggleDraft('budgets', b)}
              />
            ))}
          </ChipWrap>
          <SectionLabel hint="Explore any store — leave all off to see them all.">
            BRANDS
          </SectionLabel>
          <ChipWrap>
            {STORES.map((s) => (
              <Chip
                key={s}
                label={s}
                selected={draft.brands.includes(s)}
                onPress={() => toggleDraft('brands', s)}
              />
            ))}
          </ChipWrap>
        </ScrollView>
        {/* Web filters page: stacked full-width pills — pink-filled Clear on
            top, white pink-bordered Apply below. */}
        <View style={styles.sheetActions}>
          <Button label="Clear" variant="accent" onPress={clearFilter} style={styles.sheetClear} />
          <Button label="Apply Filters" variant="outline" onPress={applyFilter} style={styles.sheetApply} />
        </View>
      </BottomSheet>
    </View>
  );
}

// Deterministic Fisher–Yates driven by a mulberry32 PRNG. Same seed → same
// order, so the shuffle is stable across re-renders and only changes when the
// caller bumps the seed. Does not mutate the input.
function seededShuffle<T>(arr: T[], seed: number): T[] {
  let s = seed >>> 0;
  const rand = () => {
    s = (s + 0x6d2b79f5) | 0;
    let t = Math.imul(s ^ (s >>> 15), 1 | s);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
  const out = arr.slice();
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rand() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

// Sources in priority order (fresh, scraped, curated), deduped by product_url
// (case-insensitive, first occurrence wins). Items with no product_url are
// kept as-is — there's nothing to dedupe them against.
function mergeFeeds(...sources: FeedProduct[][]): FeedProduct[] {
  const seen = new Set<string>();
  const merged: FeedProduct[] = [];
  for (const item of sources.flat()) {
    if (!item.product_url) {
      merged.push(item);
      continue;
    }
    const key = item.product_url.toLowerCase();
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged;
}

function StoreChipRow({
  stores,
  active,
  onChange,
}: {
  stores: string[];
  active: string | null;
  onChange: (v: string | null) => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.storeChips}
    >
      <Chip label="All" tone="accent" selected={active === null} onPress={() => onChange(null)} />
      {stores.map((store) => {
        const on = active === store;
        return (
          <Chip
            key={store}
            label={store}
            tone="accent"
            selected={on}
            onPress={() => onChange(on ? null : store)}
          />
        );
      })}
    </ScrollView>
  );
}

/**
 * Web feed's centered bottom "Refresh feed" pill: hot pink, up-arrow in a
 * translucent white circle, fading/sliding in past the scroll threshold.
 */
function RefreshNudge({ visible, onPress }: { visible: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const anim = useRef(new Animated.Value(0)).current;

  useEffect(() => {
    Animated.timing(anim, {
      toValue: visible ? 1 : 0,
      duration: 260,
      useNativeDriver: true,
    }).start();
  }, [visible, anim]);

  return (
    <Animated.View
      pointerEvents={visible ? 'box-none' : 'none'}
      style={[
        styles.nudgeWrap,
        {
          opacity: anim,
          transform: [{ translateY: anim.interpolate({ inputRange: [0, 1], outputRange: [12, 0] }) }],
        },
      ]}
    >
      <Pressable
        onPress={onPress}
        accessibilityRole="button"
        accessibilityLabel="Back to top and refresh"
        style={({ pressed }) => [styles.nudgePill, pressed && styles.pressedDim]}
      >
        <View style={styles.nudgeArrow}>
          <Ionicons name="arrow-up" size={14} color={colors.white} />
        </View>
        <ThemedText variant="labelSmall" color={colors.white} style={styles.nudgeLabel}>
          Refresh feed
        </ThemedText>
      </Pressable>
    </Animated.View>
  );
}

function ProductCard({
  item,
  reaction,
  onReact,
}: {
  item: FeedProduct;
  reaction?: 'like' | 'dislike' | 'save';
  onReact: (p: FeedProduct, r: 'like' | 'dislike' | 'save') => void;
}) {
  // Fresh-feed items are synthetic (no products row), so like/save can't
  // persist — hide those buttons rather than show a heart that lies. Dislike
  // stays: it's an honest session-local "hide this" either way.
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const synthetic = isSyntheticProduct(item.id);
  return (
    <View style={styles.card}>
      <View style={styles.cardImgWrap}>
        {item.image_url ? (
          <Image source={{ uri: item.image_url }} style={styles.cardImg} contentFit="cover" transition={200} />
        ) : (
          <View style={[styles.cardImg, styles.placeholder]}>
            <Ionicons name="pricetag-outline" size={30} color={colors.blushDeep} />
          </View>
        )}
        {/* Floating like — web FeedCard's heart on a white/90 circle. */}
        {!synthetic ? (
          <Pressable
            onPress={() => onReact(item, 'like')}
            hitSlop={8}
            accessibilityRole="button"
            accessibilityLabel="Like"
            accessibilityState={{ selected: reaction === 'like' }}
            style={styles.heartBtn}
          >
            <Ionicons
              name={reaction === 'like' ? 'heart' : 'heart-outline'}
              size={18}
              color={colors.pinkWarm}
            />
          </Pressable>
        ) : null}
      </View>
      <View style={styles.cardFooter}>
        <View style={styles.cardInfo}>
          <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.brand} numberOfLines={1}>
            {(item.brand ?? 'Brand').toUpperCase()}
          </ThemedText>
          <ThemedText style={styles.name} numberOfLines={1}>
            {item.name ?? 'Product'}
          </ThemedText>
          <ThemedText style={styles.price}>
            {/* Scraped prices can be pre-formatted display strings ("€2,310.00");
                only bare numbers need a currency symbol prepended. */}
            {item.price == null ? '' : typeof item.price === 'number' ? `$${item.price}` : item.price}
          </ThemedText>
        </View>
        <View style={styles.actions}>
          {!synthetic ? (
            <CircleBtn
              icon={reaction === 'save' ? 'bookmark' : 'bookmark-outline'}
              color={colors.pinkWarm}
              label="Save"
              selected={reaction === 'save'}
              onPress={() => onReact(item, 'save')}
            />
          ) : null}
          <CircleBtn
            icon="close"
            color={colors.inkMuted}
            label="Not for me"
            onPress={() => onReact(item, 'dislike')}
          />
          {item.product_url ? (
            <CircleBtn
              icon="open-outline"
              color={colors.pinkWarm}
              label="Open product page"
              onPress={() => openProductUrl(item.product_url)}
            />
          ) : null}
        </View>
      </View>
    </View>
  );
}

/** 36pt pink-blush-bordered circle button (web FeedCard's bookmark chip). */
function CircleBtn({
  icon,
  color,
  label,
  selected,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  color: string;
  label: string;
  selected?: boolean;
  onPress: () => void;
}) {
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable
      onPress={onPress}
      hitSlop={6}
      accessibilityRole="button"
      accessibilityLabel={label}
      accessibilityState={selected == null ? undefined : { selected }}
      style={({ pressed }) => [styles.circleBtn, pressed && styles.pressedDim]}
    >
      <Ionicons name={icon} size={16} color={color} />
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    pad: { paddingHorizontal: spacing.lg },
    pressedDim: { opacity: 0.8 },
    // 40pt circular header affordance on a blush glow fill (web's search).
    searchBtn: {
      width: 40,
      height: 40,
      borderRadius: 20,
      backgroundColor: c.pinkWarmGlow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    controlsRow: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    // Web Filters pill: white card, pink-blush border, soft pink shadow.
    filterPill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      minHeight: 36,
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
      elevation: 2,
    },
    clearBtn: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs },
    sheetScroll: { maxHeight: 420 },
    sheetActions: { gap: spacing.md, marginTop: spacing.xl },
    sheetClear: {
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.3,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 3,
    },
    sheetApply: { backgroundColor: c.white, borderColor: c.pinkWarmGlow },
    storeChips: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
      // Clear breathing room between the store chip row and the feed grid so
      // the first clothing card doesn't read as overlapping the chips.
      paddingBottom: spacing.md,
    },
    pickStoresAction: { alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.lg },
    list: { paddingHorizontal: spacing.lg, paddingBottom: 120, gap: spacing.lg, paddingTop: spacing.lg },
    // Web FeedCard: rounded-3xl white card, pink-blush border, soft pink shadow.
    card: {
      borderRadius: radius.lg,
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
      overflow: 'hidden',
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.18,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 8 },
      elevation: 2,
    },
    cardImgWrap: { backgroundColor: c.pinkWarmGlow },
    // Web: aspect-[3/4] editorial portrait.
    cardImg: { width: '100%', aspectRatio: 3 / 4 },
    placeholder: { alignItems: 'center', justifyContent: 'center' },
    heartBtn: {
      position: 'absolute',
      top: spacing.md,
      right: spacing.md,
      width: 36,
      height: 36,
      borderRadius: 18,
      backgroundColor: `${c.white}E6`, // web: bg-card/90
      alignItems: 'center',
      justifyContent: 'center',
    },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.md,
    },
    cardInfo: { flex: 1 },
    brand: { fontSize: 11, lineHeight: 15, letterSpacing: 2 },
    name: { fontFamily: fonts.display, fontSize: 18, lineHeight: 24 },
    price: { fontFamily: fonts.sansMedium, fontSize: 14, lineHeight: 20, marginTop: 1 },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.sm },
    circleBtn: {
      width: 36,
      height: 36,
      borderRadius: 18,
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
      alignItems: 'center',
      justifyContent: 'center',
    },
    // Centered bottom "Refresh feed" pill, fixed above the floating tab bar.
    nudgeWrap: {
      position: 'absolute',
      left: 0,
      right: 0,
      bottom: 108,
      alignItems: 'center',
    },
    nudgePill: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.pinkWarm,
      borderRadius: radius.pill,
      paddingLeft: spacing.md,
      paddingRight: spacing.lg,
      paddingVertical: spacing.sm,
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
    nudgeArrow: {
      width: 24,
      height: 24,
      borderRadius: 12,
      backgroundColor: `${c.white}33`, // primary-foreground/20
      alignItems: 'center',
      justifyContent: 'center',
    },
    nudgeLabel: { fontFamily: fonts.sansMedium },
  });
