import React, { useState } from 'react';
import { View, StyleSheet, Pressable } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { spacing, useThemedStyles } from '@/theme';
import type { Colors } from '@/theme/colors';
import { useTheme } from '@/providers/ThemeProvider';
import type { PiecePick } from '@/lib/api';
import { openProductUrl } from '@/lib/affiliate';
import { Button } from './Button';
import { Card } from './Card';
import { SectionLabel } from './SectionLabel';
import { ThemedText } from './Typography';

/**
 * "Complete the look" gap picks: up to 3 shoppable suggestions shown under a
 * generated / saved outfit. Like/Save state is LOCAL and per-card (keyed by the
 * pick's original index): Like is a subtle highlight only, Dislike removes the
 * card from view, Save writes a real Saved item via the parent's onSavePick.
 *
 * Shared by the Style Me screen and the saved-outfit detail screen so the card
 * UI lives in exactly one place.
 */
export function RecommendCards({
  picks,
  onSavePick,
}: {
  picks: PiecePick[];
  onSavePick: (pick: PiecePick) => Promise<void>;
}) {
  const styles = useThemedStyles(makeStyles);
  const [dismissed, setDismissed] = useState<Set<number>>(new Set());
  const [liked, setLiked] = useState<Set<number>>(new Set());
  const [saved, setSaved] = useState<Set<number>>(new Set());

  const dismiss = (i: number) =>
    setDismissed((prev) => {
      const next = new Set(prev);
      next.add(i);
      return next;
    });

  const toggleLike = (i: number) =>
    setLiked((prev) => {
      const next = new Set(prev);
      if (next.has(i)) next.delete(i);
      else next.add(i);
      return next;
    });

  const savePick = async (pick: PiecePick, i: number) => {
    if (saved.has(i)) return;
    try {
      await onSavePick(pick);
      setSaved((prev) => {
        const next = new Set(prev);
        next.add(i);
        return next;
      });
    } catch {
      // Leave the card unsaved so the user can retry.
    }
  };

  // Keep original indices as stable keys so dismissing one card never reshuffles
  // the like/save state of the others.
  const visible = picks.map((pick, i) => ({ pick, i })).filter(({ i }) => !dismissed.has(i));
  if (visible.length === 0) return null;

  return (
    <View style={styles.recWrap}>
      <SectionLabel hint="Real pieces that would complete this look.">
        COMPLETE THE LOOK
      </SectionLabel>
      {visible.map(({ pick, i }) => (
        <PieceCard
          key={i}
          pick={pick}
          liked={liked.has(i)}
          saved={saved.has(i)}
          onLike={() => toggleLike(i)}
          onDismiss={() => dismiss(i)}
          onSave={() => savePick(pick, i)}
        />
      ))}
    </View>
  );
}

function PieceCard({
  pick,
  liked,
  saved,
  onLike,
  onDismiss,
  onSave,
}: {
  pick: PiecePick;
  liked: boolean;
  saved: boolean;
  onLike: () => void;
  onDismiss: () => void;
  onSave: () => void;
}) {
  const { colors } = useTheme();
  const styles = useThemedStyles(makeStyles);
  return (
    <Card style={liked ? styles.recCardLiked : undefined}>
      <Pressable
        onPress={onDismiss}
        hitSlop={8}
        style={styles.recClose}
        accessibilityRole="button"
        accessibilityLabel="Dismiss suggestion"
      >
        <Ionicons name="close" size={16} color={colors.inkMuted} />
      </Pressable>

      <View style={styles.recBody}>
        {pick.gap ? (
          <ThemedText variant="labelSmall" color={colors.pinkWarm} style={styles.recEyebrow}>
            {pick.gap.toUpperCase()}
          </ThemedText>
        ) : null}
        <ThemedText variant="label" numberOfLines={2} style={styles.recName}>
          {pick.name}
        </ThemedText>
        {pick.reason ? (
          <ThemedText variant="labelSmall" color={colors.inkMuted} style={styles.recReason}>
            {pick.reason}
          </ThemedText>
        ) : null}
        <View style={styles.recStoreRow}>
          <Ionicons name="storefront-outline" size={13} color={colors.inkMuted} />
          <ThemedText variant="labelSmall" color={colors.inkMuted} numberOfLines={1} style={styles.recStore}>
            {pick.store}
          </ThemedText>
        </View>
      </View>

      <View style={styles.recActions}>
        <Button
          label="Shop"
          variant="accent"
          fullWidth={false}
          onPress={() => openProductUrl(pick.url)}
          icon={<Ionicons name="bag-handle-outline" size={16} color={colors.white} />}
          style={styles.recShop}
        />
        <View style={styles.recIconRow}>
          <Pressable
            onPress={onLike}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel="Like"
            accessibilityState={{ selected: liked }}
            style={[styles.recCircle, liked && styles.recCircleLiked]}
          >
            <Ionicons
              name={liked ? 'heart' : 'heart-outline'}
              size={18}
              color={liked ? colors.white : colors.ink}
            />
          </Pressable>
          <Pressable
            onPress={onSave}
            hitSlop={6}
            accessibilityRole="button"
            accessibilityLabel={saved ? 'Saved to looks' : 'Save to looks'}
            accessibilityState={{ selected: saved }}
            style={[styles.recCircle, saved && styles.recCircleSaved]}
          >
            <Ionicons
              name={saved ? 'bookmark' : 'bookmark-outline'}
              size={18}
              color={saved ? colors.white : colors.ink}
            />
          </Pressable>
        </View>
      </View>
    </Card>
  );
}

const makeStyles = (colors: Colors) =>
  StyleSheet.create({
    recWrap: { gap: spacing.md },
    recCardLiked: { borderWidth: 1.5, borderColor: colors.pinkWarm },
    recClose: {
      position: 'absolute',
      top: spacing.sm,
      right: spacing.sm,
      width: 26,
      height: 26,
      borderRadius: 13,
      alignItems: 'center',
      justifyContent: 'center',
      backgroundColor: colors.white,
      borderWidth: 1,
      borderColor: colors.border,
      zIndex: 1,
    },
    recBody: { paddingRight: spacing.xl, gap: 3 },
    recEyebrow: { letterSpacing: 1 },
    recName: { marginTop: 2 },
    recReason: { marginTop: 2 },
    recStoreRow: { flexDirection: 'row', alignItems: 'center', gap: spacing.xs, marginTop: spacing.xs },
    recStore: { flex: 1 },
    recActions: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      gap: spacing.sm,
      marginTop: spacing.md,
    },
    recShop: { paddingHorizontal: spacing.lg },
    recIconRow: { flexDirection: 'row', gap: spacing.sm },
    recCircle: {
      width: 44,
      height: 44,
      borderRadius: 22,
      alignItems: 'center',
      justifyContent: 'center',
      borderWidth: 1,
      borderColor: colors.borderStrong,
      backgroundColor: colors.white,
    },
    recCircleLiked: { backgroundColor: colors.pinkWarm, borderColor: colors.pinkWarm },
    recCircleSaved: { backgroundColor: colors.ink, borderColor: colors.ink },
  });
