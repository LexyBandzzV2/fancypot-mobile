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

/**
 * Copy an existing wardrobe object to a fresh path in the same owner's folder,
 * returning the new object path. Used when adding a saved look to the closet so
 * the closet item owns an INDEPENDENT copy — removing that closet item later
 * (which deletes its storage object) can't break the saved look's image.
 */
export async function copyWardrobeObject(userId: string, srcObjectPath: string): Promise<string> {
  const ext = srcObjectPath.split('.').pop()?.toLowerCase() === 'png' ? 'png' : 'jpg';
  const dest = `${userId}/${uniqueName(ext)}`;
  const { error } = await supabase.storage.from(BUCKET).copy(srcObjectPath, dest);
  if (error) throw error;
  return dest;
}

/**
 * Persist an AI-generated result image (Style Me / Virtual try-on) into the
 * owner's wardrobe folder so it survives beyond the gateway's response and can
 * be signed for display later.
 *
 * The Lovable AI gateway returns generated images as base64 `data:` URLs.
 * Storing that multi-megabyte string directly in `outfits.image_url` is what
 * broke saving — signWardrobeUrl can't sign a data: URL, so the tile rendered
 * blank (and a large insert can fail outright). Here we strip the data URL and
 * upload the bytes, returning the stored object path (userId/uuid.ext). A plain
 * http(s) URL is already hosted, so it's returned unchanged.
 */
export async function persistGeneratedImage(
  userId: string,
  dataUrlOrUrl: string,
): Promise<string> {
  const m = dataUrlOrUrl.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (!m) return dataUrlOrUrl; // already a hosted URL (or unexpected shape)
  const ext = m[1].toLowerCase() === 'png' ? 'png' : 'jpg';
  return uploadWardrobeImage(userId, m[2], ext);
}
