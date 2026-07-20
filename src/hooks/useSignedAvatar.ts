import { useEffect, useState } from 'react';
import { signWardrobeUrl } from '@/lib/storage';

/**
 * Resolves a stored `profiles.avatar_url` into a renderable image URL. Avatars
 * live in the private `wardrobe` bucket (owner-scoped), so a stored object path
 * must be signed before it can render; remote http(s) URLs pass through. Returns
 * null while resolving or when there's no avatar (callers fall back to initials).
 */
export function useSignedAvatar(avatarUrl: string | null | undefined): string | null {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    let active = true;
    if (!avatarUrl) {
      setUrl(null);
      return;
    }
    signWardrobeUrl(avatarUrl)
      .then((signed) => {
        if (active) setUrl(signed);
      })
      .catch(() => {
        if (active) setUrl(null);
      });
    return () => {
      active = false;
    };
  }, [avatarUrl]);

  return url;
}
