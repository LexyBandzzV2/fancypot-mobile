import { supabase } from './supabase';
import { decode, encode } from 'base64-arraybuffer';

const BUCKET = 'wardrobe';

/**
 * Fetch an image by URL and inline it as a `data:` URI.
 *
 * The AI edge functions run every image ref through a resolver that rejects
 * non-allowlisted hosts ("image host not allowed"). Outfit images routinely
 * come from arbitrary retailer/CDN hosts — the feed and Get-the-Look store the
 * product's own `image_url` — so those refs can never satisfy a host allowlist.
 * Inlining the bytes on-device sidesteps the check entirely: a data URI has no
 * host, so the resolver passes it through untouched (the same path the user's
 * own photo already takes). Returns null on any failure so the caller can
 * surface a clean error instead of shipping a ref the backend will reject.
 */
export async function imageUrlToDataUri(url: string): Promise<string | null> {
  try {
    const res = await fetch(url);
    if (!res.ok) return null;
    const contentType = res.headers.get('content-type') ?? '';
    // A hotlink-blocked CDN can answer 200 with an HTML/JSON error page — refuse
    // anything that clearly isn't image bytes rather than shipping garbage.
    if (contentType.startsWith('text/') || contentType.includes('html') || contentType.includes('json')) {
      return null;
    }
    const mime = contentType.startsWith('image/') ? contentType : 'image/jpeg';
    return `data:${mime};base64,${encode(await res.arrayBuffer())}`;
  } catch {
    return null;
  }
}

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
