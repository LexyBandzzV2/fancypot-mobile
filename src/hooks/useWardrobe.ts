import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';

// Every mounted consumer of useWardrobe (the Closet tab AND the Stylist screen
// can be alive at once) needs its OWN realtime channel. Supabase dedupes
// channels by topic name, so a shared name makes the second subscriber call
// `.on()` on an already-subscribed channel → "cannot add postgres_changes
// callbacks after subscribe()". A per-instance suffix keeps them distinct.
let channelSeq = 0;
import {
  listWardrobe,
  insertWardrobeItem,
  deleteWardrobeItem as apiDelete,
  processWardrobeItem,
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
  // Stable, unique per hook instance (lazy init runs once).
  const [instanceId] = useState(() => ++channelSeq);

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
      .channel(`wardrobe-items-${user.id}-${instanceId}`)
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
  }, [user, load, instanceId]);

  const add = useCallback(
    async (base64: string) => {
      if (!user) throw new Error('Not signed in');
      // Uploading a piece triggers AI classification + background removal, so the
      // same third-party-AI consent applies here as on the explicit AI screens.
      const consented = await ensureConsent();
      if (!consented) return;
      const path = await uploadWardrobeImage(user.id, base64);
      const row = await insertWardrobeItem(user.id, path); // may throw on limit
      // Fire-and-forget AI classify + background removal.
      processWardrobeItem(row.id).catch(() => {});
      await load();
    },
    [user, load, ensureConsent],
  );

  const remove = useCallback(
    async (item: WardrobeDisplayItem) => {
      await apiDelete(item.id);
      if (item.image_url) await deleteWardrobeObject(item.image_url).catch(() => {});
      setItems((prev) => prev.filter((i) => i.id !== item.id));
    },
    [],
  );

  return { items, loading, error, reload: load, add, remove };
}
