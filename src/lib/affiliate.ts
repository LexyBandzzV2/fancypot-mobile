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
