import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { listOutfits, deleteOutfit as apiDelete, saveOutfit, type Outfit } from '@/lib/api';
import { signWardrobeUrl } from '@/lib/storage';
import { useAuth } from '@/providers/AuthProvider';

export interface OutfitDisplay extends Outfit {
  signedUrl: string | null;
}

// Saved tab, Stylist, and Try-on can all mount this hook at the same time.
// Supabase dedupes realtime channels by topic name, so a shared name makes the
// second subscriber call `.on()` on an already-subscribed channel and crash
// ("cannot add postgres_changes callbacks after subscribe()"). Unique suffix
// per hook instance keeps every subscription independent.
let channelSeq = 0;

export function useOutfits() {
  const { user } = useAuth();
  const [outfits, setOutfits] = useState<OutfitDisplay[]>([]);
  const [loading, setLoading] = useState(true);
  const [instanceId] = useState(() => ++channelSeq);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await listOutfits(user.id);
      const withUrls = await Promise.all(
        rows.map(async (r) => ({ ...r, signedUrl: await signWardrobeUrl(r.image_url) })),
      );
      setOutfits(withUrls);
    } finally {
      setLoading(false);
    }
  }, [user]);

  useEffect(() => {
    load();
  }, [load]);

  useEffect(() => {
    if (!user) return;
    const channel = supabase
      .channel(`outfits-${user.id}-${instanceId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'outfits', filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load, instanceId]);

  const remove = useCallback(async (id: string) => {
    await apiDelete(id);
    setOutfits((prev) => prev.filter((o) => o.id !== id));
  }, []);

  const save = useCallback(
    async (data: Partial<Outfit>) => {
      if (!user) throw new Error('Not signed in');
      await saveOutfit(user.id, data);
      await load();
    },
    [user, load],
  );

  return { outfits, loading, reload: load, remove, save };
}
