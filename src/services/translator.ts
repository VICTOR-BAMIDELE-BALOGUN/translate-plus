// Chooses between the on-device model and the online services, by the user's setting.
import { getSettings } from '../store';
import { chooseRoute, translate as onlineTranslate, type TranslateResult } from './translate';
import { offlineAvailable, offlineSupported, offlineTranslate } from './offline';
import { canCorrect, correctItalian, detectRegister, hasRegister, steerSource, type Detected } from './register';
import { segmentByLanguage } from './detect';

export type SmartResult = TranslateResult & {
  offline?: boolean;
  /** What register the translation actually came out in, where that is knowable. */
  register?: Detected;
  /** True when the text was corrected after the engine returned the wrong register. */
  registerCorrected?: boolean;
  /** Every language found in the source, when it turned out to hold more than one. */
  languages?: string[];
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

/**
 * Text that switches language part-way through is translated a block at a time,
 * each with its own source language, then joined back together. A single-language
 * message costs exactly one request, as before.
 */
async function translateMixed(clean: string, to: string): Promise<SmartResult | null> {
  const blocks = segmentByLanguage(clean);
  const languages = [...new Set(blocks.map((b) => b.lang).filter(Boolean) as string[])];
  if (languages.length < 2) return null;

  const parts: string[] = [];
  for (const block of blocks) {
    if (block.lang === to) {
      parts.push(block.text); // already in the target language, leave it alone
      continue;
    }
    const out = await translateOne(block.text, block.lang ?? 'auto', to);
    parts.push(out.text);
  }
  return { text: parts.join(' '), provider: 'google', languages };
}

async function translateOne(text: string, from: string, to: string): Promise<SmartResult> {
  const s = getSettings();
  const route = chooseRoute(s.translationMode, from, to, supported, s.offlineLanguages);
  if (route.use === 'offline') {
    try {
      return { text: await offlineTranslate(text, from, to), detected: from, provider: 'none', offline: true };
    } catch {
      if (s.translationMode === 'offlineOnly') throw new Error('Offline translation failed for part of this text.');
    }
  }
  return onlineTranslate(text, from, to, s.provider);
}

export async function translate(text: string, from: string, to: string): Promise<SmartResult> {
  const clean = text.trim();
  if (!clean) return { text: '', provider: 'none' };
  const s = getSettings();

  if (from === 'auto') {
    const mixed = await translateMixed(clean, to);
    if (mixed) return settleRegister(mixed, to, s.register);
  }
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
