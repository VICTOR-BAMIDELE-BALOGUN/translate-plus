// Free translation with two keyless providers, a small cache and timeouts.
// Primary: Google's public web endpoint (unofficial, no key). Fallback: MyMemory (official free tier).
import { t } from '../i18n/t';

export type TranslateResult = { text: string; detected?: string; provider: 'google' | 'mymemory' | 'none' };
export type Provider = 'google' | 'mymemory';

const cache = new Map<string, TranslateResult>();
const CACHE_MAX = 400;
const TIMEOUT_MS = 6000;

async function fetchJson(url: string): Promise<any> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
  try {
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return await res.json();
  } finally {
    clearTimeout(timer);
  }
}

export function parseGoogle(data: any): TranslateResult {
  if (!Array.isArray(data) || !Array.isArray(data[0])) throw new Error('Unexpected response');
  const text = data[0].map((seg: any) => (Array.isArray(seg) && typeof seg[0] === 'string' ? seg[0] : '')).join('');
  if (!text) throw new Error('Empty translation');
  return { text, detected: typeof data[2] === 'string' ? data[2] : undefined, provider: 'google' };
}

export function parseMyMemory(data: any): TranslateResult {
  const text = data?.responseData?.translatedText;
  if (typeof text !== 'string' || !text || Number(data?.responseStatus) >= 400) {
    throw new Error(typeof data?.responseDetails === 'string' && data.responseDetails ? data.responseDetails : t('Translation failed'));
  }
  const detected = data?.responseData?.detectedLanguage;
  return { text, detected: typeof detected === 'string' ? detected : undefined, provider: 'mymemory' };
}

async function google(text: string, from: string, to: string): Promise<TranslateResult> {
  const url =
    'https://translate.googleapis.com/translate_a/single?client=gtx&dt=t' +
    `&sl=${encodeURIComponent(from)}&tl=${encodeURIComponent(to)}&q=${encodeURIComponent(text)}`;
  return parseGoogle(await fetchJson(url));
}

const MYMEMORY_MAX = 450;

/** MyMemory caps the query length, so long text is split on sentence or word breaks. */
export function splitForLength(text: string, max = MYMEMORY_MAX): string[] {
  const clean = text.trim();
  if (clean.length <= max) return clean ? [clean] : [];
  const out: string[] = [];
  let rest = clean;
  while (rest.length > max) {
    const window = rest.slice(0, max);
    let cut = Math.max(window.lastIndexOf('. '), window.lastIndexOf('? '), window.lastIndexOf('! '));
    cut = cut > max * 0.4 ? cut + 1 : window.lastIndexOf(' ');
    if (cut <= 0) cut = max; // one very long word: split it rather than lose it
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

async function myMemory(text: string, from: string, to: string): Promise<TranslateResult> {
  const src = from === 'auto' ? 'autodetect' : from;
  const ask = async (part: string) => {
    const url = `https://api.mymemory.translated.net/get?q=${encodeURIComponent(part)}&langpair=${encodeURIComponent(src)}|${encodeURIComponent(to)}`;
    return parseMyMemory(await fetchJson(url));
  };
  const parts = splitForLength(text);
  if (parts.length <= 1) return ask(parts[0] ?? text);
  const results = [];
  for (const part of parts) results.push(await ask(part));
  return { text: results.map((r) => r.text).join(' '), detected: results[0]?.detected, provider: 'mymemory' };
}

const base = (code: string) => code.toLowerCase().split('-')[0];

export async function translate(text: string, from: string, to: string, prefer: Provider = 'google'): Promise<TranslateResult> {
  const clean = text.trim();
  if (!clean) return { text: '', provider: 'none' };
  if (from !== 'auto' && base(from) === base(to) && from === to) return { text: clean, detected: from, provider: 'none' };
  const key = `${from}|${to}|${clean}`;
  const hit = cache.get(key);
  if (hit) return hit;

  const order = prefer === 'google' ? [google, myMemory] : [myMemory, google];
  let lastError: unknown;
  for (const fn of order) {
    try {
      const out = await fn(clean, from, to);
      if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
      cache.set(key, out);
      return out;
    } catch (e) {
      lastError = e;
    }
  }
  throw new Error(t('Translation unavailable. Check your connection. ({n})', { n: lastError instanceof Error ? lastError.message : 'error' }));
}

/**
 * Opens the connections a call will use (translation and the online voice) before the
 * first sentence, so it does not pay for setting them up. Failures are ignored.
 */
export function warmUp(to: string) {
  const ctrl = new AbortController();
  setTimeout(() => ctrl.abort(), 5000);
  const q = encodeURIComponent('ok ' + Date.now().toString(36)); // never cached, so it really goes out
  fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=en&tl=${encodeURIComponent(to)}&q=${q}`, { signal: ctrl.signal }).catch(() => {});
  if (typeof document === 'undefined') {
    fetch(`https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${encodeURIComponent(to)}&q=ok`, { signal: ctrl.signal }).catch(() => {});
  }
}

/**
 * Translates a large block of text in one request (POST, so it can be long), from English.
 * Used to translate the app's own interface into languages that are not built in.
 */
export async function translateBatch(text: string, to: string): Promise<string> {
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 20000);
  try {
    const res = await fetch(`https://translate.googleapis.com/translate_a/single?client=gtx&dt=t&sl=en&tl=${encodeURIComponent(to)}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded;charset=UTF-8' },
      body: 'q=' + encodeURIComponent(text),
      signal: ctrl.signal,
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    return parseGoogle(await res.json()).text;
  } finally {
    clearTimeout(timer);
  }
}

export function clearTranslateCache() {
  cache.clear();
}

// Route decision, kept here so it can be unit-tested without React Native.
export type Mode = 'online' | 'offlineFirst' | 'offlineOnly';
export type Route = { use: 'offline' | 'online' } | { use: 'error'; reason: string };

export function chooseRoute(
  mode: Mode,
  from: string,
  to: string,
  isSupported: (code: string) => boolean,
  downloaded: string[]
): Route {
  const ready =
    from !== 'auto' && isSupported(from) && isSupported(to) && downloaded.includes(from) && downloaded.includes(to);
  if (mode !== 'online' && ready) return { use: 'offline' };
  if (mode === 'offlineOnly') {
    return {
      use: 'error',
      reason:
        from === 'auto'
          ? 'Offline mode needs a specific language, not auto-detect. Pick the language or switch to online.'
          : 'This language pair is not downloaded for offline use. Download it in Settings, or switch to online.',
    };
  }
  return { use: 'online' };
}
