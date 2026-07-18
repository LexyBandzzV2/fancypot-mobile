import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
  type NativeScrollEvent,
  type NativeSyntheticEvent,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { AppHeader, Button, Card, EmptyState, SkeletonGrid, ThemedText } from '@/components';
import { Glass } from '@/components/Glass';
import type { Colors } from '@/theme/colors';
import { radius, spacing, useThemedStyles } from '@/theme';
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
import { brandsMatch, budgetAllows } from '@/lib/brands';
import { useAuth } from '@/providers/AuthProvider';

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
  const [showTopNudge, setShowTopNudge] = useState(false);
  const listRef = useRef<FlatList<FeedProduct>>(null);
  // Monotonic sequence for fresh fetches: a slow older request that resolves
  // after a newer one must not clobber the newer results.
  const freshReq = useRef(0);

  const onScroll = useCallback((e: NativeSyntheticEvent<NativeScrollEvent>) => {
    setShowTopNudge(e.nativeEvent.contentOffset.y > 600);
  }, []);

  const scrollToTop = useCallback(() => {
    Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
    listRef.current?.scrollToOffset({ offset: 0, animated: true });
  }, []);

  const savedStores = useMemo(() => {
    const prefs = (profile?.preferences ?? {}) as { stores?: string[] };
    return Array.isArray(prefs.stores) ? prefs.stores.filter(Boolean) : [];
  }, [profile]);

  const savedBudget = useMemo(() => {
    const prefs = (profile?.preferences ?? {}) as { budget?: string };
    return typeof prefs.budget === 'string' ? prefs.budget : null;
  }, [profile]);

  const products = useMemo(
    () => mergeFeeds(freshProducts, scrapedProducts, curatedProducts),
    [freshProducts, scrapedProducts, curatedProducts],
  );

  const visibleProducts = useMemo(() => {
    // Budget subdivision: hide items priced above the user's saved tier
    // (cheaper tiers still show). Items with no tier metadata always pass.
    let list = products.filter((p) => budgetAllows(savedBudget, p.budget_tier));
    if (activeStore) list = list.filter((p) => brandsMatch(p.brand, activeStore));
    return list;
  }, [products, activeStore, savedBudget]);

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
      // No saved stores → whole catalog; saved stores → only those brands.
      setScrapedProducts(await getScrapedFeed(savedStores.length ? savedStores : undefined));
    } catch {
      // keep the previous scraped list
    }
  }, [savedStores]);

  useEffect(() => {
    (async () => {
      await Promise.all([loadCurated(), loadFresh(null)]);
      setLoading(false);
    })();
  }, [loadCurated, loadFresh]);

  // Separate effect: re-scopes on its own when the user's saved stores load
  // or change, without re-pulling the other two sources.
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
    // Re-pull all sources; the monthly pg_cron job owns catalog scraping.
    await Promise.all([loadCurated(), loadFresh(activeStore), loadScraped()]);
    setRefreshing(false);
  }, [loadCurated, loadFresh, loadScraped, activeStore]);

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

  return (
    <View style={styles.root}>
      <AppHeader title="Style Feed" subtitle="Fresh finds from the places you love" />
      {savedStores.length > 0 ? (
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
        <>
          <FlatList
            ref={listRef}
            data={visibleProducts}
            keyExtractor={(p) => p.id}
            contentContainerStyle={styles.list}
            showsVerticalScrollIndicator={false}
            onScroll={onScroll}
            scrollEventThrottle={120}
            refreshControl={
              <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blushDeep} />
            }
            renderItem={({ item }) => (
              <ProductCard item={item} reaction={reactions[item.id]} onReact={react} />
            )}
            ListEmptyComponent={
              // A chip can filter the current list to nothing while its fresh
              // fetch is still in flight — show a skeleton, not a false empty.
              freshLoading ? (
                <SkeletonGrid count={2} />
              ) : (
                <EmptyState
                  icon="storefront-outline"
                  title="Nothing from this store yet"
                  body="Try another store, or pull to refresh."
                />
              )
            }
          />
          {showTopNudge ? (
            <Pressable
              onPress={scrollToTop}
              style={styles.topNudge}
              accessibilityRole="button"
              accessibilityLabel="Back to top"
            >
              <Ionicons name="arrow-up" size={18} color={colors.cream} />
            </Pressable>
          ) : null}
        </>
      )}
    </View>
  );
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
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.storeChips}
    >
      <StoreChip label="All" on={active === null} onPress={() => onChange(null)} />
      {stores.map((store) => {
        const on = active === store;
        return (
          <StoreChip key={store} label={store} on={on} onPress={() => onChange(on ? null : store)} />
        );
      })}
    </ScrollView>
  );
}

function StoreChip({ label, on, onPress }: { label: string; on: boolean; onPress: () => void }) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);

  if (on) {
    return (
      <Pressable onPress={onPress} style={[styles.storeChip, styles.storeChipOn]}>
        <ThemedText variant="label" color={colors.cream}>
          {label}
        </ThemedText>
      </Pressable>
    );
  }

  return (
    <Pressable onPress={onPress}>
      <Glass intensity={30} style={styles.storeChip}>
        <ThemedText variant="label" color={colors.ink}>
          {label}
        </ThemedText>
      </Glass>
    </Pressable>
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
    <Card style={styles.card} padded={false}>
      <Pressable
        onLongPress={() => {
          if (item.product_url) {
            Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Medium);
            openProductUrl(item.product_url);
          }
        }}
        delayLongPress={350}
      >
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.cardImg} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.cardImg, styles.placeholder]}>
          <Ionicons name="pricetag-outline" size={30} color={colors.blushDeep} />
        </View>
      )}
      </Pressable>
      <View style={styles.cardBody}>
        <ThemedText variant="labelSmall" color={colors.inkMuted}>
          {item.brand ?? 'Brand'}
        </ThemedText>
        <ThemedText variant="h3" numberOfLines={1}>
          {item.name ?? 'Product'}
        </ThemedText>
        <View style={styles.cardFooter}>
          <ThemedText variant="label" color={colors.ink}>
            {typeof item.price === 'number' ? `$${item.price}` : item.price ?? ''}
          </ThemedText>
          <View style={styles.actions}>
            {!synthetic ? (
              <ReactBtn
                icon={reaction === 'like' ? 'heart' : 'heart-outline'}
                active={reaction === 'like'}
                onPress={() => onReact(item, 'like')}
              />
            ) : null}
            {!synthetic ? (
              <ReactBtn
                icon={reaction === 'save' ? 'bookmark' : 'bookmark-outline'}
                active={reaction === 'save'}
                onPress={() => onReact(item, 'save')}
              />
            ) : null}
            <ReactBtn icon="close" onPress={() => onReact(item, 'dislike')} />
            {item.product_url ? (
              <ReactBtn icon="open-outline" onPress={() => openProductUrl(item.product_url)} />
            ) : null}
          </View>
        </View>
      </View>
    </Card>
  );
}

function ReactBtn({
  icon,
  active,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  active?: boolean;
  onPress: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.reactBtn} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={active ? colors.pinkWarm : colors.ink} />
    </Pressable>
  );
}

const makeStyles = (c: Colors) =>
  StyleSheet.create({
    root: { flex: 1, backgroundColor: c.cream },
    pad: { paddingHorizontal: spacing.lg },
    storeChips: {
      gap: spacing.sm,
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
    },
    storeChip: {
      paddingHorizontal: spacing.lg,
      paddingVertical: spacing.sm,
      borderRadius: radius.pill,
      minHeight: 40,
      justifyContent: 'center',
    },
    storeChipOn: { backgroundColor: c.pinkWarm, borderColor: c.pinkWarm, borderWidth: 1 },
    pickStoresAction: { alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.lg },
    list: { paddingHorizontal: spacing.lg, paddingBottom: 120, gap: spacing.lg },
    card: { marginBottom: 0 },
    cardImg: { width: '100%', aspectRatio: 1.1 },
    placeholder: { backgroundColor: c.pearl, alignItems: 'center', justifyContent: 'center' },
    cardBody: { padding: spacing.lg, gap: spacing.xs },
    cardFooter: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      marginTop: spacing.sm,
    },
    actions: { flexDirection: 'row', alignItems: 'center', gap: spacing.md },
    reactBtn: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
    },
    topNudge: {
      position: 'absolute',
      right: spacing.lg,
      bottom: 130,
      width: 44,
      height: 44,
      borderRadius: 22,
      backgroundColor: c.ink,
      alignItems: 'center',
      justifyContent: 'center',
      shadowColor: '#000',
      shadowOpacity: 0.2,
      shadowRadius: 8,
      shadowOffset: { width: 0, height: 4 },
      elevation: 4,
    },
  });
