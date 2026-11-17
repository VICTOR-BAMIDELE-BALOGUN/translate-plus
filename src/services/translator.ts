// Chooses between the on-device model and the online services, by the user's setting.
import { getSettings } from '../store';
import { chooseRoute, translate as onlineTranslate, type TranslateResult } from './translate';
import { offlineAvailable, offlineSupported, offlineTranslate } from './offline';
import { canCorrect, correctItalian, detectRegister, hasRegister, steerSource, type Detected } from './register';

export type SmartResult = TranslateResult & {
  offline?: boolean;
  /** What register the translation actually came out in, where that is knowable. */
  register?: Detected;
  /** True when the text was corrected after the engine returned the wrong register. */
  registerCorrected?: boolean;
};

const supported = (code: string) => offlineAvailable() && offlineSupported(code);

export function canGoOffline(from: string, to: string): boolean {
  const s = getSettings();
  return chooseRoute(s.translationMode, from, to, supported, s.offlineLanguages).use === 'offline';
}

/** Applies the chosen register to a finished translation, and reports what it ended up as. */
function settleRegister(out: SmartResult, to: string, want: 'auto' | 'formal' | 'informal'): SmartResult {
  if (!hasRegister(to) || !out.text) return out;
  if (want !== 'auto' && detectRegister(out.text, to) !== want && canCorrect(to)) {
    const fixed = correctItalian(out.text, want);
    // the correction was deliberate, so report what we made it, not what the
    // detector can see: polite forms like "può" are ambiguous on their own
    if (fixed !== out.text) return { ...out, text: fixed, register: want, registerCorrected: true };
  }
  return { ...out, register: detectRegister(out.text, to), registerCorrected: false };
}

/** With auto-detect on, assume the person is writing in their own language. */
function sourceForSteering(from: string): string {
  return from === 'auto' ? getSettings().myLang : from;
}

export async function translate(text: string, from: string, to: string): Promise<SmartResult> {
  const clean = text.trim();
  if (!clean) return { text: '', provider: 'none' };
  const s = getSettings();
  const want = s.register;
  const route = chooseRoute(s.translationMode, from, to, supported, s.offlineLanguages);

  if (route.use === 'offline') {
    try {
      const out = await offlineTranslate(steerSource(clean, sourceForSteering(from), want), from, to);
      return settleRegister({ text: out, detected: from, provider: 'none', offline: true }, to, want);
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

  const out = await onlineTranslate(steerSource(clean, sourceForSteering(from), want), from, to, s.provider);
  return settleRegister(out, to, want);
}
