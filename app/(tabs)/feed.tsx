import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
  Animated,
  TextInput,
  ActivityIndicator,
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
import { fonts, radius, spacing, fillObject, useThemedStyles } from '@/theme';
import { useTheme } from '@/providers/ThemeProvider';
import {
  getFeed,
  getFreshFeed,
  getScrapedFeed,
  isSyntheticProduct,
  reactToProduct,
  saveItem,
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

// First-paint cap for a user with no saved stores — one page is plenty to fill
// the screen; the rest of the catalog streams in behind it.
const INITIAL_SCRAPED_ROWS = 1000;

export default function FeedScreen() {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  const { profile, user } = useAuth();
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
  // Feed pieces the user has saved to their Saved Looks this session (drives the
  // filled-bookmark state). Independent of like/dislike so a piece can be both
  // liked and saved.
  const [savedIds, setSavedIds] = useState<Set<string>>(new Set());
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
  // Free-text search across ANY brand/category, independent of the saved
  // budget + favorite-brand filters. `search` is the live query text;
  // `searchFresh` holds live Google Shopping results fetched on submit so the
  // search can reach brands beyond the loaded catalog.
  const [searchOpen, setSearchOpen] = useState(false);
  const [search, setSearch] = useState('');
  const [searchFresh, setSearchFresh] = useState<FeedProduct[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const searchReq = useRef(0);
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
    // An active search overrides every saved/profile filter: match the query
    // (all whitespace-separated tokens) against brand + name + category across
    // the whole loaded catalog plus any live search results.
    const q = search.trim().toLowerCase();
    if (q) {
      const tokens = q.split(/\s+/).filter(Boolean);
      const pool = mergeFeeds(searchFresh, products);
      const matched = pool.filter((p) => {
        const hay = `${p.brand ?? ''} ${p.name ?? ''} ${p.category ?? ''}`.toLowerCase();
        return tokens.every((t) => hay.includes(t));
      });
      return seededShuffle(matched, shuffleSeed);
    }

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
  }, [products, searchFresh, search, activeStore, savedStores, savedBudgets, filter, shuffleSeed]);

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

  // FAST first paint: pull only what the default view shows — the user's saved
  // stores (a few hundred rows, one page) — or, for a user with no saved
  // stores, a single capped page. Paging the WHOLE ~14k-row catalog up front
  // was the real reason the feed sat on a skeleton for seconds.
  const loadScrapedInitial = useCallback(async () => {
    try {
      const rows = savedStores.length
        ? await getScrapedFeed(savedStores)
        : await getScrapedFeed(undefined, { maxRows: INITIAL_SCRAPED_ROWS });
      // Never let a smaller initial slice clobber an already-loaded full catalog
      // (e.g. a refresh racing the background fill).
      setScrapedProducts((prev) => (rows.length >= prev.length ? rows : prev));
    } catch {
      // keep the previous scraped list
    }
  }, [savedStores]);

  // BACKGROUND: page the whole catalog so the filter/search can reach brands
  // beyond the saved stores. Runs after first paint; never gates the skeleton.
  const loadScrapedFull = useCallback(async () => {
    try {
      const rows = await getScrapedFeed();
      setScrapedProducts((prev) => (rows.length >= prev.length ? rows : prev));
    } catch {
      // keep whatever the initial load produced
    }
  }, []);

  // The skeleton waits on curated + the SCOPED scraped slice — both small,
  // direct table reads that resolve fast. The full catalog and `loadFresh` (a
  // LIVE Google Shopping call, 1-4s on a cache miss) both stream in afterward
  // via their own state, so neither holds up the first cards.
  useEffect(() => {
    (async () => {
      await Promise.all([loadCurated(), loadScrapedInitial()]);
      setLoading(false);
    })();
    loadFresh(null);
    loadScrapedFull();
  }, [loadCurated, loadScrapedInitial, loadScrapedFull, loadFresh]);

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
    // Re-pull the fast sources so the spinner clears quickly; the full catalog
    // refreshes in the background (the monthly pg_cron job owns scraping).
    await Promise.all([loadCurated(), loadFresh(activeStore), loadScrapedInitial()]);
    loadScrapedFull();
    setRefreshing(false);
  }, [loadCurated, loadFresh, loadScrapedInitial, loadScrapedFull, activeStore]);

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

  const openSearch = useCallback(() => setSearchOpen(true), []);

  const closeSearch = useCallback(() => {
    setSearchOpen(false);
    setSearch('');
    setSearchFresh([]);
    searchReq.current += 1; // cancel any in-flight live search
    setSearchLoading(false);
  }, []);

  // On submit, pull live Google Shopping results for the query (reaching
  // brands beyond the loaded catalog) and jump to the top. The catalog match
  // in visibleProducts already updates live as the user types.
  const submitSearch = useCallback(async () => {
    const q = search.trim();
    if (!q) return;
    listRef.current?.scrollToOffset({ offset: 0, animated: false });
    const seq = ++searchReq.current;
    setSearchLoading(true);
    try {
      const rows = await getFreshFeed(q.slice(0, 40)); // feed-fresh caps at 40 chars
      if (seq === searchReq.current) setSearchFresh(rows);
    } catch {
      // Keep the catalog matches even if the live search fails.
    } finally {
      if (seq === searchReq.current) setSearchLoading(false);
    }
  }, [search]);

  const toggleDraft = useCallback((key: keyof FeedFilter, value: string) => {
    setDraft((d) => {
      const list = d[key];
      const next = list.includes(value) ? list.filter((v) => v !== value) : [...list, value];
      return { ...d, [key]: next };
    });
  }, []);

  const react = useCallback(
    async (product: FeedProduct, reaction: 'like' | 'dislike') => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setReactions((prev) => ({ ...prev, [product.id]: reaction }));
      if (reaction === 'dislike') {
        setFreshProducts((prev) => prev.filter((p) => p.id !== product.id));
        setScrapedProducts((prev) => prev.filter((p) => p.id !== product.id));
        setCuratedProducts((prev) => prev.filter((p) => p.id !== product.id));
      }
      // Synthetic (fresh-/scraped-) ids have no products row — the reaction
      // can't persist, but the like/hide still works locally. Only real
      // products record the reaction server-side.
      if (!isSyntheticProduct(product.id)) {
        try {
          await reactToProduct(product.id, reaction);
        } catch {
          // ignore; optimistic
        }
      }
    },
    [],
  );

  // Save a feed piece to Saved Items. Works for EVERY source — including the
  // synthetic scraped/fresh items that can't persist a product_reaction —
  // because saved_items stores the product's own fields, not an FK to a
  // products row.
  const saveToItems = useCallback(
    async (product: FeedProduct) => {
      if (!user || savedIds.has(product.id)) return; // already saved this session
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
      setSavedIds((prev) => new Set(prev).add(product.id));
      try {
        await saveItem(user.id, {
          name: product.name,
          brand: product.brand,
          price: product.price,
          image_url: product.image_url,
          product_url: product.product_url,
          source: 'feed',
        });
      } catch {
        // Roll back the filled bookmark if the save didn't land.
        setSavedIds((prev) => {
          const next = new Set(prev);
          next.delete(product.id);
          return next;
        });
      }
    },
    [savedIds, user],
  );

  const filterCount = filter ? filter.budgets.length + filter.brands.length : 0;

  return (
    <View style={styles.root}>
      <AppHeader
        title="Style Feed"
        subtitle="Fresh finds from the places you love"
        right={
          // Opens a free-text search over any brand/category (separate from the
          // Filters sheet, which only narrows within saved preferences).
          <Pressable
            onPress={openSearch}
            accessibilityRole="button"
            accessibilityLabel="Search the feed"
            style={({ pressed }) => [styles.searchBtn, pressed && styles.pressedDim]}
          >
            <Ionicons name="search" size={17} color={colors.pinkWarm} />
          </Pressable>
        }
      />
      {searchOpen ? (
        <View style={styles.searchBar}>
          <View style={styles.searchFieldWrap}>
            <Ionicons name="search" size={18} color={colors.inkMuted} />
            <TextInput
              style={styles.searchInput}
              placeholder="Search any brand or category"
              placeholderTextColor={colors.inkMuted}
              value={search}
              onChangeText={setSearch}
              autoFocus
              returnKeyType="search"
              onSubmitEditing={submitSearch}
              autoCorrect={false}
              autoCapitalize="none"
              accessibilityLabel="Search any brand or category"
            />
            {search.length > 0 ? (
              <Pressable
                onPress={() => setSearch('')}
                hitSlop={8}
                accessibilityRole="button"
                accessibilityLabel="Clear search text"
              >
                <Ionicons name="close-circle" size={18} color={colors.inkMuted} />
              </Pressable>
            ) : null}
          </View>
          <Pressable onPress={closeSearch} hitSlop={8} accessibilityRole="button" accessibilityLabel="Close search">
            <ThemedText variant="label" color={colors.pinkWarm}>
              Cancel
            </ThemedText>
          </Pressable>
        </View>
      ) : (
        <>
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
        </>
      )}
      {loading ? (
        <View style={styles.pad}>
          {/* A clean spinner over the image grid skeleton — the brand chips
              above keep their normal shape while the feed loads. */}
          <ActivityIndicator color={colors.pinkWarm} style={styles.loadingSpinner} />
          <SkeletonGrid count={4} />
        </View>
      ) : products.length === 0 && !search.trim() ? (
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
          // Render just the first screen immediately instead of measuring/
          // mounting the whole list up front — the rest streams in as the user
          // scrolls, so the initial paint doesn't wait on off-screen rows.
          initialNumToRender={6}
          maxToRenderPerBatch={6}
          windowSize={7}
          removeClippedSubviews
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blushDeep} />
          }
          renderItem={({ item }) => (
            <ProductCard
              item={item}
              reaction={reactions[item.id]}
              saved={savedIds.has(item.id)}
              onReact={react}
              onSave={saveToItems}
            />
          )}
          ListEmptyComponent={
            // A chip/filter/search can narrow the current list to nothing while
            // its fetch is still in flight — show a skeleton, not a false empty.
            searchLoading || freshLoading ? (
              <SkeletonGrid count={2} />
            ) : search.trim() ? (
              <EmptyState
                icon="search-outline"
                title="No matches"
                body={`Nothing found for "${search.trim()}". Try another brand or category.`}
              />
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
  // Wrapping the horizontal ScrollView in a plain View bounds its height to the
  // chips' natural size. Without it, the ScrollView stretches to fill leftover
  // vertical space during loading and the chips (pill-radius) balloon into tall
  // ovals — matching the Closet's category chip row, which wraps for the same
  // reason.
  return (
    <View>
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
    </View>
  );
}

/**
 * Compact "back to top & refresh" nudge, tucked into the bottom-RIGHT corner
 * (above the floating tab bar) as a small hot-pink circle so it never covers
 * the clothing in the middle of the feed. Fades/slides in past the scroll
 * threshold.
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
        accessibilityLabel="Back to top and refresh feed"
        style={({ pressed }) => [styles.nudgeButton, pressed && styles.pressedDim]}
      >
        <Ionicons name="arrow-up" size={22} color={colors.white} />
      </Pressable>
    </Animated.View>
  );
}

function ProductCard({
  item,
  reaction,
  saved,
  onReact,
  onSave,
}: {
  item: FeedProduct;
  reaction?: 'like' | 'dislike' | 'save';
  saved?: boolean;
  onReact: (p: FeedProduct, r: 'like' | 'dislike') => void;
  onSave: (p: FeedProduct) => void;
}) {
  // Like/Save now work on EVERY card. Save writes to Saved Items (works even
  // for synthetic scraped/live items); Like persists server-side only for real
  // products but still gives a local heart on synthetic ones.
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  // Double-tap-to-save: track the previous tap time; a second tap within the
  // window saves the item to Saved Items and plays the heart burst. saved_items
  // persists the product's own fields, so this works for synthetic scraped/
  // fresh items too (unlike product_reactions, which needs a real products row).
  const lastTap = useRef(0);
  const burst = useRef(new Animated.Value(0)).current;

  const playBurst = () => {
    burst.setValue(0);
    Animated.sequence([
      Animated.spring(burst, { toValue: 1, useNativeDriver: true, friction: 4, tension: 90 }),
      Animated.timing(burst, { toValue: 0, duration: 380, delay: 260, useNativeDriver: true }),
    ]).start();
  };

  const onImageTap = () => {
    const now = Date.now();
    if (now - lastTap.current < 280) {
      lastTap.current = 0;
      onSave(item);
      playBurst();
    } else {
      lastTap.current = now;
    }
  };

  const burstStyle = {
    opacity: burst.interpolate({ inputRange: [0, 1], outputRange: [0, 0.95] }),
    transform: [{ scale: burst.interpolate({ inputRange: [0, 1], outputRange: [0.3, 1] }) }],
  };

  return (
    <View style={styles.card}>
      <Pressable onPress={onImageTap} accessibilityLabel="Double-tap to save to your items">
        <View style={styles.cardImgWrap}>
          {item.image_url ? (
            <Image source={{ uri: item.image_url }} style={styles.cardImg} contentFit="cover" transition={200} />
          ) : (
            <View style={[styles.cardImg, styles.placeholder]}>
              <Ionicons name="pricetag-outline" size={30} color={colors.blushDeep} />
            </View>
          )}
          {/* Floating like — web FeedCard's heart on a white/90 circle. */}
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
          {/* Double-tap heart burst, centered over the product image. */}
          <Animated.View style={[styles.burst, burstStyle]} pointerEvents="none">
            <Ionicons name="heart" size={96} color={colors.white} />
          </Animated.View>
        </View>
      </Pressable>
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
          <CircleBtn
            icon={saved ? 'bookmark' : 'bookmark-outline'}
            color={colors.pinkWarm}
            label={saved ? 'Saved to your looks' : 'Save to your looks'}
            selected={saved}
            onPress={() => onSave(item)}
          />
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
    // Inline search bar: a rounded field + Cancel, shown in place of the
    // filters row when the header search is tapped.
    searchBar: {
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.md,
      paddingHorizontal: spacing.lg,
      paddingTop: spacing.sm,
    },
    searchFieldWrap: {
      flex: 1,
      flexDirection: 'row',
      alignItems: 'center',
      gap: spacing.sm,
      backgroundColor: c.white,
      borderWidth: 1,
      borderColor: c.pinkWarmGlow,
      borderRadius: radius.pill,
      paddingHorizontal: spacing.lg,
      minHeight: 40,
    },
    searchInput: {
      flex: 1,
      fontFamily: fonts.sans,
      fontSize: 15,
      color: c.ink,
      paddingVertical: spacing.sm,
    },
    loadingSpinner: { marginTop: spacing.lg, marginBottom: spacing.md },
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
    // Double-tap heart-burst, centered over the product image.
    burst: {
      ...fillObject,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.ink,
      shadowOpacity: 0.35,
      shadowRadius: 12,
      shadowOffset: { width: 0, height: 4 },
    },
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
    // Compact circular "back to top & refresh" button, tucked into the
    // bottom-right corner above the floating tab bar so it never covers the
    // clothing in the feed.
    nudgeWrap: {
      position: 'absolute',
      right: spacing.lg,
      bottom: 120,
    },
    nudgeButton: {
      width: 48,
      height: 48,
      borderRadius: 24,
      backgroundColor: c.pinkWarm,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: c.pinkWarm,
      shadowOpacity: 0.35,
      shadowRadius: 14,
      shadowOffset: { width: 0, height: 8 },
      elevation: 6,
    },
  });
