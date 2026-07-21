import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import { listOutfits, deleteOutfit as apiDelete, saveOutfit, type Outfit } from '@/lib/api';
import { signWardrobeUrl, uploadWardrobeImage } from '@/lib/storage';
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
      // The AI gateway can hand back the generated look as a base64 `data:` URL.
      // Storing that straight in outfits.image_url breaks signWardrobeUrl (it
      // can't sign a data URL), so the Saved tile renders blank. Upload the
      // bytes to the wardrobe bucket first and persist the storage path instead.
      let payload = data;
      const dataUrl = typeof data.image_url === 'string' ? data.image_url : null;
      const m = dataUrl?.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/s);
      if (m) {
        const ext = m[1].toLowerCase() === 'png' ? 'png' : 'jpg';
        const stored = await uploadWardrobeImage(user.id, m[2], ext);
        payload = { ...data, image_url: stored };
      }
      await saveOutfit(user.id, payload);
      await load();
    },
    [user, load],
  );

  return { outfits, loading, reload: load, remove, save };
}
