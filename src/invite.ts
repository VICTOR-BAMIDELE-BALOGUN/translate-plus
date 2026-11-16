// Browser-only part of call links; the pure helpers live in services/codec.
import { parseInvite, type Invite } from './services/codec';

export { buildInviteLink, parseInvite, type Invite } from './services/codec';

/** Where this copy of the app is served from. Lets the web build make links with no setup. */
export function defaultLinkBase(): string {
  if (typeof window === 'undefined' || !window.location) return '';
  const { origin, pathname } = window.location;
  if (!origin || origin === 'null') return '';
  return (origin + pathname).replace(/index\.html$/, '').replace(/\/+$/, '');
}

export function currentInvite(): Invite | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return parseInvite(window.location.hash || '');
}
