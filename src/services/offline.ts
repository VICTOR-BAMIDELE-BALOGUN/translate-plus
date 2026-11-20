// On-device translation via Google ML Kit. Models are downloaded once per language
// (roughly 30 MB each) and then work with no internet at all.
// Loaded lazily so the web build, which has no native module, never touches it.
import { Platform } from 'react-native';
import { t } from '../i18n/t';

// ML Kit's on-device set is smaller than our online language list, and a few codes differ.
const MLKIT: Record<string, string> = {
  af: 'af', sq: 'sq', ar: 'ar', bn: 'bn', bg: 'bg', ca: 'ca', 'zh-CN': 'zh', 'zh-TW': 'zh',
  hr: 'hr', cs: 'cs', da: 'da', nl: 'nl', en: 'en', et: 'et', fi: 'fi', fr: 'fr', de: 'de',
  el: 'el', gu: 'gu', iw: 'he', hi: 'hi', hu: 'hu', id: 'id', it: 'it', ja: 'ja', ko: 'ko',
  lv: 'lv', lt: 'lt', ms: 'ms', mr: 'mr', no: 'no', fa: 'fa', pl: 'pl', pt: 'pt', ro: 'ro',
  ru: 'ru', sk: 'sk', sl: 'sl', es: 'es', sw: 'sw', sv: 'sv', tl: 'tl', ta: 'ta', te: 'te',
  th: 'th', tr: 'tr', uk: 'uk', ur: 'ur', vi: 'vi',
};

let cached: any;

function moduleOrNull(): any {
  if (cached !== undefined) return cached;
  if (Platform.OS === 'web') {
    cached = null;
    return cached;
  }
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    cached = require('@react-native-ml-kit/translate-text').default ?? null;
  } catch {
    cached = null;
  }
  return cached;
}

export function offlineAvailable(): boolean {
  return moduleOrNull() !== null;
}

export function offlineCode(code: string): string | null {
  return MLKIT[code] ?? MLKIT[code.split('-')[0]] ?? null;
}

export function offlineSupported(code: string): boolean {
  return code !== 'auto' && offlineCode(code) !== null;
}

/** Languages from our list that ML Kit can handle on the device. */
export function offlineLanguageCodes(): string[] {
  return Object.keys(MLKIT);
}

async function run(text: string, from: string, to: string, download: boolean): Promise<string> {
  const mod = moduleOrNull();
  if (!mod) throw new Error(t('Offline translation is not available in this build.'));
  const sourceLanguage = offlineCode(from);
  const targetLanguage = offlineCode(to);
  if (!sourceLanguage || !targetLanguage) throw new Error(t('That language has no offline model.'));
  const result = await mod.translate({
    text,
    sourceLanguage,
    targetLanguage,
    downloadModelIfNeeded: download,
  });
  if (typeof result !== 'string') throw new Error(t('Offline translation returned nothing.'));
  return result;
}

export function offlineTranslate(text: string, from: string, to: string): Promise<string> {
  // never downloads mid-conversation: models are fetched explicitly from Settings
  return run(text, from, to, false);
}

/** Fetch the model for one language, pairing it with English, which ML Kit always pivots through. */
export async function downloadOfflineModel(code: string): Promise<void> {
  const mlk = offlineCode(code);
  if (!mlk) throw new Error(t('That language has no offline model.'));
  if (mlk === 'en') {
    await run('hello', 'en', 'en', true);
    return;
  }
  await run('hello', 'en', code, true);
}
