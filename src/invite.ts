// Browser-only part of call links; the pure helpers live in services/codec.
import { parseInvite, type Invite } from './services/codec';

export { buildInviteLink, parseInvite, type Invite } from './services/codec';

/** The published web app (GitHub Pages), used by the installed app when no address is set. */
export const PUBLISHED_LINK_BASE = 'https://victor-bamidele-balogun.github.io/translate-plus';

/** Where this copy of the app is served from, so the web build links to itself; the installed app uses the published copy. */
export function defaultLinkBase(): string {
  if (typeof window === 'undefined' || !window.location) return PUBLISHED_LINK_BASE;
  const { origin, pathname } = window.location;
  if (!origin || origin === 'null') return PUBLISHED_LINK_BASE;
  return (origin + pathname).replace(/index\.html$/, '').replace(/\/+$/, '');
}

export function currentInvite(): Invite | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return parseInvite(window.location.hash || '');
}
