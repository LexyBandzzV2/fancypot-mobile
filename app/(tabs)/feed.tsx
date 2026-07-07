import React, { useCallback, useEffect, useState } from 'react';
import {
  View,
  StyleSheet,
  FlatList,
  RefreshControl,
  Pressable,
  Linking,
} from 'react-native';
import { Image } from 'expo-image';
import { Ionicons } from '@expo/vector-icons';
import * as Haptics from 'expo-haptics';
import { AppHeader, Card, EmptyState, SkeletonGrid, ThemedText } from '@/components';
import { colors, radius, spacing } from '@/theme';
import { getFeed, refreshFeed, reactToProduct, type FeedProduct } from '@/lib/api';

export default function FeedScreen() {
  const [products, setProducts] = useState<FeedProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [reactions, setReactions] = useState<Record<string, 'like' | 'dislike' | 'save'>>({});

  const load = useCallback(async () => {
    try {
      const rows = await getFeed();
      setProducts(rows);
    } catch {
      setProducts([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const onRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refreshFeed(); // scrape fresh products server-side
      await load();
    } catch {
      // keep existing list on failure
    } finally {
      setRefreshing(false);
    }
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
      {loading ? (
        <View style={styles.pad}>
          <SkeletonGrid count={4} />
        </View>
      ) : products.length === 0 ? (
        <EmptyState
          icon="sparkles-outline"
          title="No finds yet"
          body="Pull to refresh and we'll pull fresh pieces matched to your style."
          actionLabel="Refresh feed"
          onAction={onRefresh}
        />
      ) : (
        <FlatList
          data={products}
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
              <ReactBtn icon="open-outline" onPress={() => Linking.openURL(item.product_url!)} />
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
