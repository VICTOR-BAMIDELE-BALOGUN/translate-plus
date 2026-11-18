// Accents. A recogniser trained on one variety of a language does noticeably worse
// on another, so where a regional model exists it is worth choosing deliberately:
// a Nigerian speaking English is better served by en-NG than by en-US.
//
// What this cannot do is make a model for a language-and-accent pair that nobody
// trained — there is no "Italian as spoken by a Nigerian" recogniser. The UI says so.

export type Variant = { code: string; label: string };

// Curated regional variants, most useful first. Codes are BCP-47, which is what
// both Android's recogniser and the browser's Web Speech API expect.
const VARIANTS: Record<string, Variant[]> = {
  en: [
    { code: 'en-US', label: 'United States' },
    { code: 'en-GB', label: 'United Kingdom' },
    { code: 'en-NG', label: 'Nigeria' },
    { code: 'en-GH', label: 'Ghana' },
    { code: 'en-KE', label: 'Kenya' },
    { code: 'en-ZA', label: 'South Africa' },
    { code: 'en-IN', label: 'India' },
    { code: 'en-IE', label: 'Ireland' },
    { code: 'en-AU', label: 'Australia' },
    { code: 'en-CA', label: 'Canada' },
    { code: 'en-PH', label: 'Philippines' },
    { code: 'en-SG', label: 'Singapore' },
  ],
  it: [
    { code: 'it-IT', label: 'Italy' },
    { code: 'it-CH', label: 'Switzerland' },
  ],
  de: [
    { code: 'de-DE', label: 'Germany' },
    { code: 'de-AT', label: 'Austria' },
    { code: 'de-CH', label: 'Switzerland' },
  ],
  fr: [
    { code: 'fr-FR', label: 'France' },
    { code: 'fr-CA', label: 'Canada' },
    { code: 'fr-BE', label: 'Belgium' },
    { code: 'fr-CH', label: 'Switzerland' },
  ],
  es: [
    { code: 'es-ES', label: 'Spain' },
    { code: 'es-MX', label: 'Mexico' },
    { code: 'es-AR', label: 'Argentina' },
    { code: 'es-CO', label: 'Colombia' },
    { code: 'es-US', label: 'United States' },
  ],
  pt: [
    { code: 'pt-PT', label: 'Portugal' },
    { code: 'pt-BR', label: 'Brazil' },
  ],
  ar: [
    { code: 'ar-SA', label: 'Saudi Arabia' },
    { code: 'ar-EG', label: 'Egypt' },
    { code: 'ar-MA', label: 'Morocco' },
    { code: 'ar-AE', label: 'United Arab Emirates' },
  ],
  nl: [
    { code: 'nl-NL', label: 'Netherlands' },
    { code: 'nl-BE', label: 'Belgium' },
  ],
  sw: [
    { code: 'sw-KE', label: 'Kenya' },
    { code: 'sw-TZ', label: 'Tanzania' },
  ],
  'zh-CN': [{ code: 'zh-CN', label: 'Mainland, Mandarin' }],
  'zh-TW': [
    { code: 'zh-TW', label: 'Taiwan' },
    { code: 'zh-HK', label: 'Hong Kong' },
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
