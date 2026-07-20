import { Linking } from 'react-native';

/**
 * Wrap product links with affiliate commission program (Skimlinks).
 * Falls back to raw links until EXPO_PUBLIC_SKIMLINKS_ID is configured.
 */

export function wrapAffiliate(url: string): string {
  if (!url) return url;

  const skimId = process.env.EXPO_PUBLIC_SKIMLINKS_ID;
  if (!skimId) return url;

  return `https://go.skimresources.com/?id=${skimId}&url=${encodeURIComponent(url)}`;
}

export function openProductUrl(url: string | null | undefined): void {
  if (!url) return;
  Linking.openURL(wrapAffiliate(url)).catch(() => {});
}

/**
 * "Get the look" opener for a saved outfit. Prefer the exact product page we
 * captured at save time (`source_url`); when that's missing — e.g. older looks
 * saved before the retailer link was persisted, or a Lens match that returned
 * no link — fall back to a Google search of the look's name so the button is
 * always present and always lands the user on the item's real source.
 */
export function openLookSource(
  url: string | null | undefined,
  name?: string | null,
): void {
  if (url) {
    openProductUrl(url);
    return;
  }
  const query = (name ?? '').trim();
  if (!query) return;
  Linking.openURL(`https://www.google.com/search?q=${encodeURIComponent(query)}`).catch(
    () => {},
  );
}
