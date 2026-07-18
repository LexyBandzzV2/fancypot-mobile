import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { listOutfits, deleteOutfit as apiDelete, saveOutfit, type Outfit } from '@/lib/api';
import { signWardrobeUrl } from '@/lib/storage';
import { useAuth } from '@/providers/AuthProvider';

export interface OutfitDisplay extends Outfit {
  signedUrl: string | null;
}

// Unique topic per subscription — supabase.channel() returns the existing
// channel for a matching topic, and adding listeners after subscribe() throws.
// The Saved tab and Try-on screen both mount this hook (see useWardrobe.ts).
let outfitsChannelSeq = 0;

export function useOutfits() {
  const { user } = useAuth();
  const [outfits, setOutfits] = useState<OutfitDisplay[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const rows = await listOutfits(user.id);
      const withUrls = await Promise.all(
        rows.map(async (r) => ({ ...r, signedUrl: await signWardrobeUrl(r.image_url) })),
      );
      setOutfits(withUrls);
    } catch (e) {
      // Keep the previous list on failure — an unhandled rejection here made a
      // network blip render the false "No looks yet" empty state.
      console.warn('useOutfits: load failed', e);
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
      .channel(`outfits-${user.id}-${++outfitsChannelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'outfits', filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

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
