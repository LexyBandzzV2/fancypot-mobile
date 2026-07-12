import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  ScrollView,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { useRouter } from 'expo-router';
import { AppHeader, Button, Card, EmptyState, SkeletonGrid, ThemedText } from '@/components';
import { colors, radius, spacing } from '@/theme';
import { getFeed, getFreshFeed, reactToProduct, type FeedProduct } from '@/lib/api';
import { openProductUrl } from '@/lib/affiliate';
import { brandsMatch } from '@/lib/brands';
import { useAuth } from '@/providers/AuthProvider';

export default function FeedScreen() {
  const { profile } = useAuth();
  const router = useRouter();
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reactions, setReactions] = useState<Record<string, 'like' | 'dislike' | 'save'>>({});
  const [activeStore, setActiveStore] = useState<string | null>(null);

  const savedStores = useMemo(() => {
    const prefs = (profile?.preferences ?? {}) as { stores?: string[] };
    return Array.isArray(prefs.stores) ? prefs.stores.filter(Boolean) : [];
  }, [profile]);

  const visibleProducts = useMemo(() => {
    if (!activeStore) return products;
    return products.filter((p) => brandsMatch(p.brand, activeStore));
  }, [products, activeStore]);

  // Curated (feed-page) and fresh (feed-fresh, non-AI SerpAPI) sources are
  // fetched side by side — one failing must not blank out the other. When a
  // store chip is active, the fresh source is asked for that store directly.
  const load = useCallback(async () => {
    const [freshResult, curatedResult] = await Promise.allSettled([
      getFreshFeed(activeStore ?? undefined),
      getFeed(),
    ]);
    const fresh = freshResult.status === 'fulfilled' ? freshResult.value : [];
    const curated = curatedResult.status === 'fulfilled' ? curatedResult.value : [];
    setProducts(mergeFeeds(fresh, curated));
    setLoading(false);
  }, [activeStore]);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    await load(); // re-pull both sources; the weekly pg_cron job owns AI scraping now
    setRefreshing(false);
  }, [load]);

  const react = useCallback(
    async (product: FeedProduct, reaction: 'like' | 'dislike' | 'save') => {
      Haptics.impactAsync(Haptics.ImpactFeedbackStyle.Light);
      setReactions((prev) => ({ ...prev, [product.id]: reaction }));
      try {
        await reactToProduct(product.id, reaction);
        if (reaction === 'dislike') {
          setProducts((prev) => prev.filter((p) => p.id !== product.id));
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
        <FlatList
          data={visibleProducts}
          keyExtractor={(p) => p.id}
          contentContainerStyle={styles.list}
          showsVerticalScrollIndicator={false}
          refreshControl={
            <RefreshControl refreshing={refreshing} onRefresh={onRefresh} tintColor={colors.blushDeep} />
          }
          renderItem={({ item }) => (
            <ProductCard item={item} reaction={reactions[item.id]} onReact={react} />
          )}
        />
      )}
    </View>
  );
}

// Fresh items first, then curated, deduped by product_url (case-insensitive,
// first occurrence wins). Items with no product_url are kept as-is — there's
// nothing to dedupe them against.
function mergeFeeds(fresh: FeedProduct[], curated: FeedProduct[]): FeedProduct[] {
  const seen = new Set<string>();
  const merged: FeedProduct[] = [];
  for (const item of [...fresh, ...curated]) {
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
  return (
    <ScrollView
      horizontal
      showsHorizontalScrollIndicator={false}
      contentContainerStyle={styles.storeChips}
    >
      <Pressable
        onPress={() => onChange(null)}
        style={[styles.storeChip, active === null && styles.storeChipOn]}
      >
        <ThemedText variant="label" color={active === null ? colors.cream : colors.ink}>
          All
        </ThemedText>
      </Pressable>
      {stores.map((store) => {
        const on = active === store;
        return (
          <Pressable
            key={store}
            onPress={() => onChange(on ? null : store)}
            style={[styles.storeChip, on && styles.storeChipOn]}
          >
            <ThemedText variant="label" color={on ? colors.cream : colors.ink}>
              {store}
            </ThemedText>
          </Pressable>
        );
      })}
    </ScrollView>
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
  return (
    <Card style={styles.card} padded={false}>
      {item.image_url ? (
        <Image source={{ uri: item.image_url }} style={styles.cardImg} contentFit="cover" transition={200} />
      ) : (
        <View style={[styles.cardImg, styles.placeholder]}>
          <Ionicons name="pricetag-outline" size={30} color={colors.blushDeep} />
        </View>
      )}
      <View style={styles.cardBody}>
        <ThemedText variant="labelSmall" color={colors.inkMuted}>
          {item.brand ?? 'Brand'}
        </ThemedText>
        <ThemedText variant="h3" numberOfLines={1}>
          {item.name ?? 'Product'}
        </ThemedText>
        <View style={styles.cardFooter}>
          <ThemedText variant="label" color={colors.ink}>
            {item.price != null ? `$${item.price}` : ''}
          </ThemedText>
          <View style={styles.actions}>
            <ReactBtn
              icon={reaction === 'like' ? 'heart' : 'heart-outline'}
              active={reaction === 'like'}
              onPress={() => onReact(item, 'like')}
            />
            <ReactBtn
              icon={reaction === 'save' ? 'bookmark' : 'bookmark-outline'}
              active={reaction === 'save'}
              onPress={() => onReact(item, 'save')}
            />
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
  return (
    <Pressable onPress={onPress} hitSlop={10} style={styles.reactBtn} accessibilityRole="button">
      <Ionicons name={icon} size={22} color={active ? colors.pinkWarm : colors.ink} />
    </Pressable>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: colors.cream },
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
    borderWidth: 1,
    borderColor: colors.borderStrong,
    backgroundColor: colors.white,
    minHeight: 40,
    justifyContent: 'center',
  },
  storeChipOn: { backgroundColor: colors.pinkWarm, borderColor: colors.pinkWarm },
  pickStoresAction: { alignItems: 'center', paddingHorizontal: spacing.xl, marginTop: spacing.lg },
  list: { paddingHorizontal: spacing.lg, paddingBottom: 120, gap: spacing.lg },
  card: { marginBottom: 0 },
  cardImg: { width: '100%', aspectRatio: 1.1 },
  placeholder: { backgroundColor: colors.pearl, alignItems: 'center', justifyContent: 'center' },
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
});
