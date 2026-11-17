// Formality: "tu" or "Lei" in Italian, "du" or "Sie" in German, and so on.
// Free translation engines pick one more or less at random, which is how you end up
// addressing a landlord the way you would address a friend.
//
// Three things happen here, in order of how reliable they are:
//   1. nudge the English before translating, which steers the engine without risking grammar
//   2. read the register back out of the result, so it can be shown rather than guessed at
//   3. for Italian only, correct the most common verb forms if the result still came out wrong
// No file in here imports React Native, so it is all unit-testable.

export type Register = 'auto' | 'formal' | 'informal';
export type Detected = 'formal' | 'informal' | 'unknown';

/** Languages that distinguish formal and informal address. */
const TV_LANGUAGES = new Set(['it', 'fr', 'de', 'es', 'pt', 'nl', 'pl', 'ru', 'tr']);

export function hasRegister(lang: string): boolean {
  return TV_LANGUAGES.has(lang.split('-')[0]);
}

/** Only Italian gets corrections applied; elsewhere we detect and report. */
export function canCorrect(lang: string): boolean {
  return lang.split('-')[0] === 'it';
}

// ---- 2. reading the register out of a translation ----
// Only markers that cannot mean anything else. "è" and "ha" are deliberately absent:
// they are third person for things as well as polite address.
const MARKERS: Record<string, { formal: string[]; informal: string[] }> = {
  it: {
    formal: ['lei', 'potrebbe', 'vorrebbe', 'dovrebbe', 'saprebbe', 'scusi', 'senta', 'desidera', 'gentile', 'egregio', 'cordiali', 'distinti', 'suo', 'sua', 'suoi', 'sue'],
    informal: ['tu', 'ti', 'te', 'tuo', 'tua', 'tuoi', 'tue', 'puoi', 'sei', 'hai', 'vuoi', 'devi', 'sai', 'fai', 'vai', 'stai', 'dici', 'potresti', 'vorresti', 'dovresti', 'scusa', 'senti', 'ciao', 'dimmi', 'dammi', 'fammi'],
  },
  fr: { formal: ['vous', 'votre', 'vos'], informal: ['tu', 'ton', 'ta', 'tes', 'toi', 'peux', 'veux'] },
  de: { formal: ['sie', 'ihnen', 'ihre', 'ihr'], informal: ['du', 'dich', 'dir', 'dein', 'deine', 'kannst', 'willst', 'hast', 'bist'] },
  es: { formal: ['usted', 'ustedes', 'puede', 'podría'], informal: ['tú', 'ti', 'tu', 'tus', 'puedes', 'quieres', 'tienes', 'eres'] },
  pt: { formal: ['senhor', 'senhora', 'você'], informal: ['tu', 'teu', 'tua', 'contigo', 'podes', 'queres', 'tens'] },
  nl: { formal: ['u', 'uw'], informal: ['je', 'jij', 'jou', 'jouw', 'kun', 'wil'] },
  pl: { formal: ['pan', 'pani', 'państwo'], informal: ['ty', 'ciebie', 'twój', 'twoja', 'możesz'] },
  ru: { formal: ['вы', 'вас', 'ваш', 'ваша'], informal: ['ты', 'тебя', 'твой', 'твоя'] },
  tr: { formal: ['siz', 'sizin'], informal: ['sen', 'senin', 'sana'] },
};

function words(text: string): string[] {
  return text.toLowerCase().split(/[^\p{L}]+/u).filter(Boolean);
}

export function detectRegister(text: string, lang: string): Detected {
  const sets = MARKERS[lang.split('-')[0]];
  if (!sets || !text.trim()) return 'unknown';
  const found = words(text);
  let formal = 0;
  let informal = 0;
  for (const w of found) {
    if (sets.formal.includes(w)) formal++;
    if (sets.informal.includes(w)) informal++;
  }
  // German "sie" is also "she"/"they"; only trust it when capitalised mid-sentence
  if (lang.startsWith('de')) {
    const capitals = (text.match(/(?<!^)(?<![.!?]\s)\b(Sie|Ihnen|Ihre|Ihr)\b/g) || []).length;
    formal = capitals;
  }
  if (formal > informal) return 'formal';
  if (informal > formal) return 'informal';
  return 'unknown';
}

// ---- 1. steering the engine from the English side ----
const POLITE: [RegExp, string][] = [
  [/\bcan you\b/gi, 'could you kindly'],
  [/\bcould you\b/gi, 'could you kindly'],
  [/\bi want\b/gi, 'I would like'],
  [/\bi need\b/gi, 'I would need'],
  [/\bi'd like\b/gi, 'I would like'],
  [/\bgive me\b/gi, 'please provide me with'],
  [/\btell me\b/gi, 'please tell me'],
  [/\bthanks\b/gi, 'thank you'],
  [/\b(hi|hey)\b/gi, 'Good day'],
  [/\bsorry\b/gi, 'I apologise'],
  [/\bwanna\b/gi, 'would like to'],
  [/\bgonna\b/gi, 'going to'],
  [/\byou're\b/gi, 'you are'],
  [/\bcan't\b/gi, 'cannot'],
  [/\bdon't\b/gi, 'do not'],
  [/\bdoesn't\b/gi, 'does not'],
  [/\bisn't\b/gi, 'is not'],
  [/\bwon't\b/gi, 'will not'],
  [/\bi'm\b/gi, 'I am'],
  [/\bi've\b/gi, 'I have'],
  [/\bit's\b/gi, 'it is'],
];

const CASUAL: [RegExp, string][] = [
  [/\bcould you kindly\b/gi, 'can you'],
  [/\bi would like\b/gi, 'I want'],
  [/\bgood day\b/gi, 'hi'],
  [/\bi apologise\b/gi, 'sorry'],
];

/** Rewrites English to carry the register across; other source languages pass through. */
export function steerSource(text: string, sourceLang: string, want: Register): string {
  if (want === 'auto') return text;
  if (sourceLang.split('-')[0] !== 'en') return text;
  const rules = want === 'formal' ? POLITE : CASUAL;
  let out = text;
  for (const [pattern, replacement] of rules) out = out.replace(pattern, replacement);
  return out;
}

// ---- 3. correcting Italian that came out in the wrong register ----
// Verb forms only, and only ones with a single unambiguous counterpart. Clitics like
// "ti" are left alone because the correct replacement depends on the case.
const IT_TO_FORMAL: Record<string, string> = {
  puoi: 'può', potresti: 'potrebbe', sei: 'è', hai: 'ha', vuoi: 'vuole', vorresti: 'vorrebbe',
  devi: 'deve', dovresti: 'dovrebbe', sai: 'sa', sapresti: 'saprebbe', fai: 'fa', vai: 'va',
  stai: 'sta', dici: 'dice', vieni: 'viene', conosci: 'conosce', scusa: 'scusi', scusami: 'mi scusi',
  senti: 'senta', guarda: 'guardi', aspetta: 'aspetti', ciao: 'buongiorno',
  tuo: 'Suo', tua: 'Sua', tuoi: 'Suoi', tue: 'Sue',
};

const IT_TO_INFORMAL: Record<string, string> = {
  può: 'puoi', potrebbe: 'potresti', vuole: 'vuoi', vorrebbe: 'vorresti', deve: 'devi',
  dovrebbe: 'dovresti', scusi: 'scusa', senta: 'senti', buongiorno: 'ciao',
};

function matchCase(original: string, replacement: string): string {
  if (original[0] === original[0]?.toUpperCase() && original.slice(1) === original.slice(1).toLowerCase()) {
    return replacement[0].toUpperCase() + replacement.slice(1);
  }
  return replacement;
}

/** Applies the safe corrections. Returns the text unchanged when nothing applies. */
export function correctItalian(text: string, want: 'formal' | 'informal'): string {
  const table = want === 'formal' ? IT_TO_FORMAL : IT_TO_INFORMAL;
  return text.replace(/\p{L}+/gu, (word) => {
    const hit = table[word.toLowerCase()];
    return hit ? matchCase(word, hit) : word;
  });
}
