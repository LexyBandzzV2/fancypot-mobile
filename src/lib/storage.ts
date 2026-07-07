import { supabase } from './supabase';
import { decode } from 'base64-arraybuffer';

const BUCKET = 'wardrobe';

/**
 * The `wardrobe` bucket is private (owner-scoped RLS). Any stored path must be
 * converted to a short-lived signed URL before it can render. Remote http(s)
 * URLs (e.g. AI-generated result images) pass through untouched.
 */
export async function signWardrobeUrl(pathOrUrl: string | null): Promise<string | null> {
  if (!pathOrUrl) return null;
  if (pathOrUrl.startsWith('http') && !pathOrUrl.includes(`/${BUCKET}/`)) {
    return pathOrUrl;
  }
  // Extract the object path if a full storage URL was stored.
  const match = pathOrUrl.match(new RegExp(`/${BUCKET}/(.+)$`));
  const objectPath = match ? match[1] : pathOrUrl;
  const { data, error } = await supabase.storage
    .from(BUCKET)
    .createSignedUrl(objectPath, 60 * 60);
  if (error) return null;
  return data.signedUrl;
}

/**
 * Upload a local image (base64) to the owner's folder in the wardrobe bucket.
 * Returns the stored object path (userId/uuid.jpg).
 */
/** Collision-safe filename without relying on crypto.randomUUID (not in RN runtime). */
function uniqueName(ext: string): string {
  return `${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 10)}.${ext}`;
}

export async function uploadWardrobeImage(
  userId: string,
  base64: string,
  ext = 'jpg',
): Promise<string> {
  const path = `${userId}/${uniqueName(ext)}`;
  const { error } = await supabase.storage
    .from(BUCKET)
    .upload(path, decode(base64), {
      contentType: ext === 'png' ? 'image/png' : 'image/jpeg',
      upsert: false,
    });
  if (error) throw error;
  return path;
}

export async function deleteWardrobeObject(path: string): Promise<void> {
  await supabase.storage.from(BUCKET).remove([path]);
}
