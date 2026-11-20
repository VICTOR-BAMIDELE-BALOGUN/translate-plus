import { t } from './i18n/t';

export type Lang = { code: string; name: string; speech: string };

// code = translation code, speech = BCP-47 locale for speech recognition and text-to-speech
export const LANGUAGES: Lang[] = [
  { code: 'en', name: 'English', speech: 'en-US' },
  { code: 'it', name: 'Italian', speech: 'it-IT' },
  { code: 'fr', name: 'French', speech: 'fr-FR' },
  { code: 'es', name: 'Spanish', speech: 'es-ES' },
  { code: 'de', name: 'German', speech: 'de-DE' },
  { code: 'pt', name: 'Portuguese', speech: 'pt-PT' },
  { code: 'yo', name: 'Yoruba', speech: 'yo-NG' },
  { code: 'ig', name: 'Igbo', speech: 'ig-NG' },
  { code: 'ha', name: 'Hausa', speech: 'ha-NG' },
  { code: 'sw', name: 'Swahili', speech: 'sw-KE' },
  { code: 'am', name: 'Amharic', speech: 'am-ET' },
  { code: 'zu', name: 'Zulu', speech: 'zu-ZA' },
  { code: 'af', name: 'Afrikaans', speech: 'af-ZA' },
  { code: 'so', name: 'Somali', speech: 'so-SO' },
  { code: 'ar', name: 'Arabic', speech: 'ar-SA' },
  { code: 'zh-CN', name: 'Chinese (Simplified)', speech: 'zh-CN' },
  { code: 'zh-TW', name: 'Chinese (Traditional)', speech: 'zh-TW' },
  { code: 'ja', name: 'Japanese', speech: 'ja-JP' },
  { code: 'ko', name: 'Korean', speech: 'ko-KR' },
  { code: 'hi', name: 'Hindi', speech: 'hi-IN' },
  { code: 'bn', name: 'Bengali', speech: 'bn-BD' },
  { code: 'ur', name: 'Urdu', speech: 'ur-PK' },
  { code: 'pa', name: 'Punjabi', speech: 'pa-IN' },
  { code: 'ta', name: 'Tamil', speech: 'ta-IN' },
  { code: 'te', name: 'Telugu', speech: 'te-IN' },
  { code: 'mr', name: 'Marathi', speech: 'mr-IN' },
  { code: 'gu', name: 'Gujarati', speech: 'gu-IN' },
  { code: 'ne', name: 'Nepali', speech: 'ne-NP' },
  { code: 'si', name: 'Sinhala', speech: 'si-LK' },
  { code: 'ru', name: 'Russian', speech: 'ru-RU' },
  { code: 'uk', name: 'Ukrainian', speech: 'uk-UA' },
  { code: 'pl', name: 'Polish', speech: 'pl-PL' },
  { code: 'ro', name: 'Romanian', speech: 'ro-RO' },
  { code: 'nl', name: 'Dutch', speech: 'nl-NL' },
  { code: 'sv', name: 'Swedish', speech: 'sv-SE' },
  { code: 'no', name: 'Norwegian', speech: 'nb-NO' },
  { code: 'da', name: 'Danish', speech: 'da-DK' },
  { code: 'fi', name: 'Finnish', speech: 'fi-FI' },
  { code: 'el', name: 'Greek', speech: 'el-GR' },
  { code: 'tr', name: 'Turkish', speech: 'tr-TR' },
  { code: 'cs', name: 'Czech', speech: 'cs-CZ' },
  { code: 'sk', name: 'Slovak', speech: 'sk-SK' },
  { code: 'hu', name: 'Hungarian', speech: 'hu-HU' },
  { code: 'bg', name: 'Bulgarian', speech: 'bg-BG' },
  { code: 'hr', name: 'Croatian', speech: 'hr-HR' },
  { code: 'sr', name: 'Serbian', speech: 'sr-RS' },
  { code: 'sl', name: 'Slovenian', speech: 'sl-SI' },
  { code: 'sq', name: 'Albanian', speech: 'sq-AL' },
  { code: 'lt', name: 'Lithuanian', speech: 'lt-LT' },
  { code: 'lv', name: 'Latvian', speech: 'lv-LV' },
  { code: 'et', name: 'Estonian', speech: 'et-EE' },
  { code: 'ca', name: 'Catalan', speech: 'ca-ES' },
  { code: 'iw', name: 'Hebrew', speech: 'he-IL' },
  { code: 'fa', name: 'Persian', speech: 'fa-IR' },
  { code: 'id', name: 'Indonesian', speech: 'id-ID' },
  { code: 'ms', name: 'Malay', speech: 'ms-MY' },
  { code: 'tl', name: 'Filipino', speech: 'fil-PH' },
  { code: 'vi', name: 'Vietnamese', speech: 'vi-VN' },
  { code: 'th', name: 'Thai', speech: 'th-TH' },
  { code: 'km', name: 'Khmer', speech: 'km-KH' },
  { code: 'my', name: 'Burmese', speech: 'my-MM' },
];

export const AUTO: Lang = { code: 'auto', name: 'Detect language', speech: '' };

export function langByCode(code: string): Lang {
  if (code === 'auto') return AUTO;
  return (
    LANGUAGES.find((l) => l.code === code) ??
    LANGUAGES.find((l) => l.code.split('-')[0] === code.split('-')[0]) ?? { code, name: code, speech: code }
  );
}

/** A language's name, in the app's own language. */
export function langName(code: string): string {
  return t(langByCode(code).name);
}

/**
 * The locale to use for speech, honouring the accent the user picked.
 * Imported lazily by callers that have access to settings.
 */
export function speechLocaleFor(code: string, accents: Record<string, string>): string {
  const chosen = accents[code];
  if (chosen) return chosen;
  return langByCode(code).speech || 'en-US';
}
