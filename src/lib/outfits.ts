import { saveOutfit, type Outfit } from './api';
import { uploadWardrobeImage } from './storage';

/**
 * Persist an outfit for a user, transparently handling a base64 `data:` image
 * URL. The AI gateway can hand back a generated look as a `data:` URL, and
 * storing that straight in outfits.image_url breaks signWardrobeUrl (it can't
 * sign a data URL), so the Saved tile renders blank. Upload the bytes to the
 * wardrobe bucket first and persist the storage path instead.
 *
 * Hook-free on purpose: shared by useOutfits.save (foreground) and the try-on
 * background saver, which must run to completion after its screen unmounts and
 * so cannot depend on any React state/context (it captures userId at call time).
 */
export async function persistOutfitImage(
  userId: string,
  data: Partial<Outfit>,
): Promise<Outfit> {
  let payload = data;
  const dataUrl = typeof data.image_url === 'string' ? data.image_url : null;
  const m = dataUrl?.match(/^data:image\/([a-zA-Z0-9.+-]+);base64,(.+)$/s);
  if (m) {
    const ext = m[1].toLowerCase() === 'png' ? 'png' : 'jpg';
    const stored = await uploadWardrobeImage(userId, m[2], ext);
    payload = { ...data, image_url: stored };
  }
  return saveOutfit(userId, payload);
}
