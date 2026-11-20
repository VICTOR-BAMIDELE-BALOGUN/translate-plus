// The app's own language. Every interface string is written in English in the code and
// passed through t(); the English text is its own key. Built-in languages ship with the app;
// any other language is machine-translated once, the first time it is chosen, and kept on
// the phone. Anything missing falls back to English.
import { useEffect, useState } from 'react';
import { I18nManager, Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { getSettings, useSettings } from '../store';
import { LANGUAGES } from '../languages';
import { BUILT_IN } from './catalogs';
import { KEYS, KEYS_VERSION } from './keys';
import { translateCatalog } from './machine';
import { translateBatch } from '../services/translate';
import { activeLang, setActive } from './t';

import { tk } from './t';

export { t, tk } from './t';

/** Languages written right to left: the layout is mirrored for them. */
export const RTL = new Set(['ar', 'iw', 'he', 'fa', 'ur']);

const machine = new Map<string, Record<string, string>>();

/** The phone's own language setting, e.g. "it-IT". */
export function phoneLocale(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().locale || 'en';
  } catch {
    return 'en';
  }
}

/** Maps a locale such as "it-IT", "zh-Hans-CN" or "pt-BR" to one of the app's languages. */
export function interfaceCode(locale: string, available: string[] = LANGUAGES.map((l) => l.code)): string {
  const lower = locale.replace('_', '-').toLowerCase();
  if (lower.startsWith('zh')) return /hant|tw|hk|mo/.test(lower) ? 'zh-TW' : 'zh-CN';
  if (lower.startsWith('he')) return 'iw';
  if (lower.startsWith('nb') || lower.startsWith('nn')) return 'no';
  if (lower.startsWith('fil')) return 'tl';
  const base = lower.split('-')[0];
  return available.find((c) => c.toLowerCase() === lower) ?? available.find((c) => c.toLowerCase().split('-')[0] === base) ?? 'en';
}

/** The interface language in use: the chosen one, or the phone's when set to follow it. */
export function uiLang(): string {
  const chosen = getSettings().uiLang;
  return chosen && chosen !== 'auto' ? chosen : interfaceCode(phoneLocale());
}

export function isBuiltIn(lang: string): boolean {
  return lang === 'en' || !!BUILT_IN[lang];
}

/** Makes `lang` the active table if it is ready (built in, or machine-translated earlier). */
function activate(lang: string): boolean {
  if (lang === 'en') setActive('en', null);
  else if (BUILT_IN[lang]) setActive(lang, BUILT_IN[lang]);
  else if (machine.has(lang)) setActive(lang, machine.get(lang)!);
  else return false;
  return true;
}

const storageKey = (lang: string) => `translateplus.ui.${lang}.${KEYS_VERSION}`;

/** Loads, or makes, the machine translation for a language that is not built in. */
async function prepare(lang: string, onProgress: (done: number, total: number) => void): Promise<void> {
  if (isBuiltIn(lang) || machine.has(lang)) return;
  const saved = await AsyncStorage.getItem(storageKey(lang)).catch(() => null);
  if (saved) {
    machine.set(lang, JSON.parse(saved));
    return;
  }
  const table = await translateCatalog(KEYS, lang, translateBatch, onProgress);
  if (Object.keys(table).length < KEYS.length * 0.5) throw new Error('Too little came back');
  machine.set(lang, table);
  AsyncStorage.setItem(storageKey(lang), JSON.stringify(table)).catch(() => {});
}

/** Throws away a saved machine translation, so it is made again next time it is chosen. */
export async function forgetMachineTranslation(lang: string) {
  machine.delete(lang);
  await AsyncStorage.removeItem(storageKey(lang)).catch(() => {});
}

export type UiState = { lang: string; ready: boolean; progress: number; error: string | null; rtlRestart: boolean };

/**
 * Follows the chosen interface language: switches tables at once when it can, prepares a
 * machine translation when needed (with progress), and mirrors the layout for right-to-left
 * languages. Call it once, near the top of the app; the returned `lang` changes when the
 * active table does, so the caller can re-render everything under it.
 */
export function useUiLanguage(): UiState & { retry: () => void } {
  const settings = useSettings();
  const wanted = uiLang();
  // switch synchronously when possible, so the first frame is already in the right language
  const ready = activate(wanted);
  const [state, setState] = useState<UiState>({ lang: wanted, ready, progress: ready ? 1 : 0, error: null, rtlRestart: false });
  const [attempt, setAttempt] = useState(0);

  useEffect(() => {
    let alive = true;
    const rtl = RTL.has(wanted.split('-')[0]);
    let rtlRestart = false;
    if (Platform.OS !== 'web' && I18nManager.isRTL !== rtl) {
      I18nManager.allowRTL(rtl);
      I18nManager.forceRTL(rtl);
      rtlRestart = true; // React Native mirrors the layout only after the app restarts
    }
    if (activate(wanted)) {
      setState({ lang: wanted, ready: true, progress: 1, error: null, rtlRestart });
      return;
    }
    setState({ lang: activeLang(), ready: false, progress: 0, error: null, rtlRestart });
    prepare(wanted, (done, total) => alive && setState((s) => ({ ...s, progress: done / total })))
      .then(() => {
        if (!alive) return;
        activate(wanted);
        setState({ lang: wanted, ready: true, progress: 1, error: null, rtlRestart });
      })
      .catch(() => {
        if (!alive) return;
        setState({
          lang: activeLang(),
          ready: true, // carry on in the current language rather than block the app
          progress: 0,
          error: tk('Could not translate the app into this language. Check your internet connection and try again.'),
          rtlRestart,
        });
      });
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [wanted, settings.uiLang, attempt]);

  return { ...state, retry: () => setAttempt((n) => n + 1) };
}
