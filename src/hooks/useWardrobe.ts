import { useCallback, useEffect, useState } from 'react';
import { Alert } from 'react-native';
import { supabase } from '@/lib/supabase';
import {
  listWardrobe,
  insertWardrobeItem,
  deleteWardrobeItem as apiDelete,
  processWardrobeItem,
  updateWardrobeItem,
  UsageLimitError,
  type WardrobeItem,
} from '@/lib/api';
import {
  signWardrobeUrl,
  uploadWardrobeImage,
  deleteWardrobeObject,
} from '@/lib/storage';
import { useAuth } from '@/providers/AuthProvider';
import { useAIConsent } from '@/providers/AIConsentProvider';

export interface WardrobeDisplayItem extends WardrobeItem {
  /** Signed, renderable URL (the raw image_url is a private storage path). */
  signedUrl: string | null;
}

// Channel topics must be unique per subscription: supabase.channel() returns
// the EXISTING channel when the topic matches, and adding `postgres_changes`
// listeners to an already-subscribed channel throws ("cannot add
// `postgres_changes` callbacks ... after `subscribe()`"). Two screens mount
// this hook at once (Closet tab stays mounted while the Stylist opens), so a
// shared `wardrobe-items-${user.id}` topic crashed the second mount.
let wardrobeChannelSeq = 0;

/**
 * Loads the signed-in user's closet, keeps it live via Supabase realtime, and
 * exposes add/delete. The DB trigger enforce_wardrobe_limit rejects inserts past
 * the per-plan cap, so `add` surfaces that error for the UI to gate on.
 */
export function useWardrobe() {
  const { user } = useAuth();
  const { ensureConsent } = useAIConsent();
  const [items, setItems] = useState<WardrobeDisplayItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  // Ids with a styling call currently in flight. The tile UI otherwise derives
  // entirely from the DB row, which still says failed/stalled while a retry
  // runs — so without this, tapping "Tap to retry" gave no visible feedback.
  const [processingIds, setProcessingIds] = useState<Set<string>>(new Set());

  const hydrate = useCallback(async (rows: WardrobeItem[]) => {
    const withUrls = await Promise.all(
      rows.map(async (r) => ({ ...r, signedUrl: await signWardrobeUrl(r.image_url) })),
    );
    setItems(withUrls);
  }, []);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    setError(null);
    try {
      const rows = await listWardrobe(user.id);
      await hydrate(rows);
    } catch (e: any) {
      setError(e?.message ?? 'Could not load your closet.');
    } finally {
      setLoading(false);
    }
  }, [user, hydrate]);

  useEffect(() => {
    load();
  }, [load]);

  // Realtime: reflect the async wardrobe-process results without polling.
  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`wardrobe-items-${user.id}-${++wardrobeChannelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'wardrobe_items', filter: `user_id=eq.${user.id}` },
        () => {
          load();
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  // Kick classify + background removal without blocking the UI, but never
  // swallow a refusal: the metered backend can decline (plan budget / rate
  // limit), and silently dropping that left items at "Styling…" forever.
  const kickProcessing = useCallback(
    (itemId: string) => {
      setProcessingIds((prev) => {
        if (prev.has(itemId)) return prev; // already in flight — ignore re-taps
        const next = new Set(prev);
        next.add(itemId);
        return next;
      });
      processWardrobeItem(itemId)
        .catch((e) => {
          const msg =
            e instanceof UsageLimitError
              ? `${e.message}\n\nYour piece is saved — long-press it to retry styling later.`
              : 'We could not style that piece right now. Long-press it in your closet to retry.';
          Alert.alert('Styling paused', msg);
        })
        .finally(() => {
          setProcessingIds((prev) => {
            const next = new Set(prev);
            next.delete(itemId);
            return next;
          });
          // Backup for missed realtime events: pull the row's final status.
          load();
        });
    },
    [load],
  );

  const add = useCallback(
    async (base64: string): Promise<WardrobeItem | null> => {
      if (!user) throw new Error('Not signed in');
      // Uploading a piece triggers AI classification + background removal, so the
      // same third-party-AI consent applies here as on the explicit AI screens.
      const consented = await ensureConsent();
      if (!consented) return null;
      const path = await uploadWardrobeImage(user.id, base64);
      const row = await insertWardrobeItem(user.id, path); // may throw on limit
      kickProcessing(row.id);
      await load();
      return row;
    },
    [user, load, ensureConsent, kickProcessing],
  );

  /** Re-run styling for a piece whose processing failed or stalled. */
  const retryProcessing = useCallback(
    (item: WardrobeDisplayItem) => {
      kickProcessing(item.id);
    },
    [kickProcessing],
  );

  /** Rename / re-categorize a piece and refresh the list. */
  const update = useCallback(
    async (id: string, fields: { name?: string | null; category?: string | null }) => {
      await updateWardrobeItem(id, fields);
      await load();
    },
    [load],
  );

  const remove = useCallback(
    async (item: WardrobeDisplayItem) => {
      await apiDelete(item.id);
      if (item.image_url) await deleteWardrobeObject(item.image_url).catch(() => {});
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    },
    [],
  );

  return { items, loading, error, processingIds, reload: load, add, remove, retryProcessing, update };
}
