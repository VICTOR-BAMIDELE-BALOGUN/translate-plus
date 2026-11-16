// Browser-only part of call links; the pure helpers live in services/codec.
import { parseInvite, type Invite } from './services/codec';

export { buildInviteLink, parseInvite, type Invite } from './services/codec';

export function currentInvite(): Invite | null {
  if (typeof window === 'undefined' || !window.location) return null;
  return parseInvite(window.location.hash || '');
}
