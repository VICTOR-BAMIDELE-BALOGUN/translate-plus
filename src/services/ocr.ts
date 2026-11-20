// Reading text out of a photo, on the phone, with Google ML Kit.
// The browser build uses ocr.web.ts instead, which Metro picks automatically.
import TextRecognition, { TextRecognitionScript } from '@react-native-ml-kit/text-recognition';
import { t } from '../i18n/t';

// ML Kit reads these five scripts; a language outside them cannot be read on the phone.
const SCRIPTS: Record<string, TextRecognitionScript> = {
  'zh-CN': TextRecognitionScript.CHINESE,
  'zh-TW': TextRecognitionScript.CHINESE,
  ja: TextRecognitionScript.JAPANESE,
  ko: TextRecognitionScript.KOREAN,
  hi: TextRecognitionScript.DEVANAGARI,
  mr: TextRecognitionScript.DEVANAGARI,
  ne: TextRecognitionScript.DEVANAGARI,
};

// Latin covers most European languages plus Vietnamese, Turkish, Swahili and others.
const UNSUPPORTED = new Set(['ar', 'iw', 'fa', 'ur', 'th', 'am', 'my', 'km', 'bn', 'ta', 'te', 'gu', 'pa', 'si', 'el', 'ru', 'uk', 'bg', 'sr']);

export const ocrNeedsDownload = false;

export function ocrSupported(code: string): boolean {
  return !UNSUPPORTED.has(code);
}

export function ocrNote(code: string): string | null {
  return ocrSupported(code) ? null : 'The phone cannot read this alphabet from a photo. The web version can.';
}

export async function readTextFromImage(
  uri: string,
  lang: string,
  _onProgress?: (fraction: number) => void
): Promise<string> {
  if (!ocrSupported(lang)) throw new Error(ocrNote(lang) as string);
  try {
    const result = await TextRecognition.recognize(uri, SCRIPTS[lang] ?? TextRecognitionScript.LATIN);
    return (result?.text ?? '').trim();
  } catch (e) {
    const message = e instanceof Error ? e.message : 'Could not read the photo.';
    if (message.includes("doesn't seem to be linked")) {
      throw new Error(t('Reading photos is not available in this build of the app.'));
    }
    throw new Error(message);
  }
}
