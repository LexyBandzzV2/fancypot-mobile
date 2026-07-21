import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/lib/supabase';
import {
  listSavedItems,
  saveItem as apiSaveItem,
  deleteSavedItem as apiDeleteSavedItem,
  type SavedItem,
} from '@/lib/api';
import { useAuth } from '@/providers/AuthProvider';

// Unique topic per subscription — supabase.channel() returns the existing
// channel for a matching topic, so a shared static topic across mounts would
// throw when a second screen adds listeners after subscribe(). Mirrors the
// pattern in useOutfits.ts.
let savedItemsChannelSeq = 0;

export function useSavedItems() {
  const { user } = useAuth();
  const [items, setItems] = useState<SavedItem[]>([]);
  const [loading, setLoading] = useState(true);

  const load = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      setItems(await listSavedItems(user.id));
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
      .channel(`saved-items-${user.id}-${++savedItemsChannelSeq}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'saved_items', filter: `user_id=eq.${user.id}` },
        () => load(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user, load]);

  const remove = useCallback(async (id: string) => {
    await apiDeleteSavedItem(id);
    setItems((prev) => prev.filter((i) => i.id !== id));
  }, []);

  const save = useCallback(
    async (data: Partial<SavedItem>) => {
      if (!user) throw new Error('Not signed in');
      await apiSaveItem(user.id, data);
      await load();
    },
    [user, load],
  );

  return { items, loading, reload: load, remove, save };
}
