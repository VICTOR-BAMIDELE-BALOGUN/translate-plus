// Accents. A recogniser trained on one variety of a language does noticeably worse
// on another, so where a regional model exists it is worth choosing deliberately:
// a Nigerian speaking English is better served by en-NG than by en-US.
//
// What this cannot do is make a model for a language-and-accent pair that nobody
// trained — there is no "Italian as spoken by a Nigerian" recogniser. The UI says so.

import { tk } from '../i18n/t';

export type Variant = { code: string; label: string };

// Curated regional variants, most useful first. Codes are BCP-47, which is what
// both Android's recogniser and the browser's Web Speech API expect.
const VARIANTS: Record<string, Variant[]> = {
  en: [
    { code: 'en-US', label: tk('United States') },
    { code: 'en-GB', label: tk('United Kingdom') },
    { code: 'en-NG', label: tk('Nigeria') },
    { code: 'en-GH', label: tk('Ghana') },
    { code: 'en-KE', label: tk('Kenya') },
    { code: 'en-ZA', label: tk('South Africa') },
    { code: 'en-IN', label: tk('India') },
    { code: 'en-IE', label: tk('Ireland') },
    { code: 'en-AU', label: tk('Australia') },
    { code: 'en-CA', label: tk('Canada') },
    { code: 'en-PH', label: tk('Philippines') },
    { code: 'en-SG', label: tk('Singapore') },
  ],
  it: [
    { code: 'it-IT', label: tk('Italy') },
    { code: 'it-CH', label: tk('Switzerland') },
  ],
  de: [
    { code: 'de-DE', label: tk('Germany') },
    { code: 'de-AT', label: tk('Austria') },
    { code: 'de-CH', label: tk('Switzerland') },
  ],
  fr: [
    { code: 'fr-FR', label: tk('France') },
    { code: 'fr-CA', label: tk('Canada') },
    { code: 'fr-BE', label: tk('Belgium') },
    { code: 'fr-CH', label: tk('Switzerland') },
  ],
  es: [
    { code: 'es-ES', label: tk('Spain') },
    { code: 'es-MX', label: tk('Mexico') },
    { code: 'es-AR', label: tk('Argentina') },
    { code: 'es-CO', label: tk('Colombia') },
    { code: 'es-US', label: tk('United States') },
  ],
  pt: [
    { code: 'pt-PT', label: tk('Portugal') },
    { code: 'pt-BR', label: tk('Brazil') },
  ],
  ar: [
    { code: 'ar-SA', label: tk('Saudi Arabia') },
    { code: 'ar-EG', label: tk('Egypt') },
    { code: 'ar-MA', label: tk('Morocco') },
    { code: 'ar-AE', label: tk('United Arab Emirates') },
  ],
  nl: [
    { code: 'nl-NL', label: tk('Netherlands') },
    { code: 'nl-BE', label: tk('Belgium') },
  ],
  sw: [
    { code: 'sw-KE', label: tk('Kenya') },
    { code: 'sw-TZ', label: tk('Tanzania') },
  ],
  'zh-CN': [{ code: 'zh-CN', label: tk('Mainland, Mandarin') }],
  'zh-TW': [
    { code: 'zh-TW', label: tk('Taiwan') },
    { code: 'zh-HK', label: tk('Hong Kong') },
  ],
};

/** The regional choices for a language, or an empty list when there is only one. */
export function variantsFor(lang: string): Variant[] {
  return VARIANTS[lang] ?? VARIANTS[lang.split('-')[0]] ?? [];
}

export function hasVariants(lang: string): boolean {
  return variantsFor(lang).length > 1;
}

/** True when `code` is a regional form of `lang` — used to match device locales. */
export function belongsTo(code: string, lang: string): boolean {
  const base = lang.split('-')[0].toLowerCase();
  return code.toLowerCase().replace('_', '-').split('-')[0] === base;
}

/**
 * Merges the curated list with whatever the device reports, so a locale the phone
 * actually has is never hidden and one it lacks is marked.
 */
export function mergeVariants(lang: string, deviceLocales: string[]): (Variant & { installed?: boolean })[] {
  const normalise = (c: string) => c.replace('_', '-');
  const have = new Set(deviceLocales.map((c) => normalise(c).toLowerCase()));
  const out: (Variant & { installed?: boolean })[] = variantsFor(lang).map((v) => ({
    ...v,
    installed: have.size ? have.has(v.code.toLowerCase()) : undefined,
  }));
  for (const raw of deviceLocales) {
    const code = normalise(raw);
    if (!belongsTo(code, lang)) continue;
    if (out.some((v) => v.code.toLowerCase() === code.toLowerCase())) continue;
    out.push({ code, label: code, installed: true });
  }
  return out;
}

/** The locale to hand the recogniser and the voice, honouring the user's choice. */
export function localeFor(lang: string, chosen: Record<string, string>, fallback: string): string {
  const pick = chosen[lang];
  if (pick && belongsTo(pick, lang)) return pick;
  const list = variantsFor(lang);
  return list[0]?.code ?? fallback;
}
