// Chooses between the on-device model and the online services, by the user's setting.
import { getSettings } from '../store';
import { chooseRoute, translate as onlineTranslate, type TranslateResult } from './translate';
import { offlineAvailable, offlineSupported, offlineTranslate } from './offline';

export type SmartResult = TranslateResult & { offline?: boolean };

const supported = (code: string) => offlineAvailable() && offlineSupported(code);

export function canGoOffline(from: string, to: string): boolean {
  const s = getSettings();
  return chooseRoute(s.translationMode, from, to, supported, s.offlineLanguages).use === 'offline';
}

export async function translate(text: string, from: string, to: string): Promise<SmartResult> {
  const clean = text.trim();
  if (!clean) return { text: '', provider: 'none' };
  const s = getSettings();
  const route = chooseRoute(s.translationMode, from, to, supported, s.offlineLanguages);

  if (route.use === 'offline') {
    try {
      const out = await offlineTranslate(clean, from, to);
      return { text: out, detected: from, provider: 'none', offline: true };
    } catch (e) {
      if (s.translationMode === 'offlineOnly') {
        throw new Error(
          `Offline translation failed: ${e instanceof Error ? e.message : 'unknown error'}. Re-download the language in Settings, or switch to online.`
        );
      }
      // offlineFirst: fall through to the online services
    }
  } else if (route.use === 'error') {
    throw new Error(route.reason);
  }

  return onlineTranslate(clean, from, to, s.provider);
}
