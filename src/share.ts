// Text sent to the app from another app's selection menu or Share sheet arrives as
// translateplus://translate?text=… (see plugins/with-share-text.js).

export const SHARE_PREFIX = 'translateplus://translate';

/** The shared text in a link, or null if the link is not one of ours. */
export function parseShareLink(url: string | null | undefined): string | null {
  if (!url || !url.startsWith(SHARE_PREFIX)) return null;
  const match = /[?&]text=([^&#]*)/.exec(url);
  if (!match) return null;
  try {
    const text = decodeURIComponent(match[1].replace(/\+/g, '%20')).trim();
    return text || null;
  } catch {
    return null;
  }
}
