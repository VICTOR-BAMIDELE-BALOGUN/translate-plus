// Working out what language a piece of text is in, on the device, with no network.
// Two passes: the script narrows it down hard (Cyrillic is not Italian), then for
// Latin text a profile of very common words decides between the candidates.
// No React Native imports here, so it is unit-testable.

export type Guess = { lang: string; score: number; hits?: number };

const SCRIPTS: { lang: string; re: RegExp }[] = [
  { lang: 'ru', re: /[Ѐ-ӿ]/ },
  { lang: 'el', re: /[Ͱ-Ͽ]/ },
  { lang: 'iw', re: /[֐-׿]/ },
  { lang: 'ar', re: /[؀-ۿ]/ },
  { lang: 'hi', re: /[ऀ-ॿ]/ },
  { lang: 'bn', re: /[ঀ-৿]/ },
  { lang: 'ta', re: /[஀-௿]/ },
  { lang: 'te', re: /[ఀ-౿]/ },
  { lang: 'th', re: /[฀-๿]/ },
  { lang: 'km', re: /[ក-៿]/ },
  { lang: 'my', re: /[က-႟]/ },
  { lang: 'am', re: /[ሀ-፿]/ },
  { lang: 'ko', re: /[가-힯ᄀ-ᇿ]/ },
  { lang: 'ja', re: /[぀-ゟ゠-ヿ]/ },
  { lang: 'zh-CN', re: /[一-鿿]/ },
];

// Two lists per language. The common words are frequent but often shared with a
// neighbour (Spanish and Portuguese overlap heavily); the strong ones belong to
// that language and almost no other, so they count for more.
type Profile = { common: string[]; strong: string[] };

const WORDS: Record<string, Profile> = {
  en: {
    common: ['the', 'and', 'is', 'are', 'to', 'of', 'in', 'it', 'that', 'this', 'for', 'with', 'have', 'can', 'do', 'not', 'but', 'how', 'when', 'about', 'there', 'would', 'an', 'at', 'as', 'be', 'was', 'were', 'has', 'had', 'will', 'if', 'so', 'from', 'by', 'on', 'all', 'here', 'now', 'just'],
    strong: ['you', 'thanks', 'thank', 'hello', 'please', 'what', 'they', 'we', 'my', 'me', 'your', 'because', 'something', 'still', 'am', 'our', 'their', 'been', 'should', 'could', 'where', 'which', 'who', 'know', 'need', 'want', 'think'],
  },
  it: {
    common: ['il', 'la', 'le', 'lo', 'di', 'che', 'non', 'per', 'con', 'una', 'un', 'ma', 'come', 'questo', 'questa', 'mi', 'ti', 'ci', 'si', 'nel', 'quando', 'dove', 'essere', 'fare', 'sono', 'ho'],
    strong: ['gli', 'perché', 'però', 'anche', 'molto', 'grazie', 'buongiorno', 'della', 'alla', 'più', 'sì', 'appartamento', 'vorrei', 'libero', 'ancora', 'sapere', 'scrivo'],
  },
  es: {
    common: ['el', 'de', 'que', 'no', 'por', 'con', 'una', 'un', 'es', 'pero', 'como', 'esto', 'esta', 'me', 'te', 'se', 'para', 'del', 'cuando', 'donde', 'hacer', 'está'],
    strong: ['yo', 'usted', 'hola', 'gracias', 'buenos', 'hay', 'muy', 'los', 'las', 'y', 'más', 'porque', 'quiero', 'habitación', 'días', 'saber'],
  },
  pt: {
    common: ['o', 'a', 'os', 'as', 'de', 'que', 'por', 'com', 'uma', 'um', 'mas', 'como', 'isto', 'esta', 'me', 'te', 'se', 'para', 'do', 'da', 'quando', 'onde', 'fazer', 'está'],
    strong: ['eu', 'você', 'não', 'obrigado', 'obrigada', 'bom', 'ainda', 'muito', 'são', 'nós', 'também', 'já', 'olá', 'queria', 'quarto', 'livre', 'dia'],
  },
  fr: {
    common: ['le', 'la', 'les', 'de', 'des', 'que', 'ne', 'pas', 'pour', 'avec', 'une', 'un', 'est', 'mais', 'comme', 'ce', 'cette', 'me', 'te', 'se', 'du', 'quand', 'faire'],
    strong: ['je', 'vous', 'merci', 'bonjour', 'très', 'où', 'nous', 'voudrais', 'suis', 'chambre', 'savoir', 'avez', 'parce', 'être', 'plus'],
  },
  de: {
    common: ['der', 'die', 'das', 'und', 'ist', 'für', 'mit', 'eine', 'ein', 'aber', 'wie', 'auf', 'von', 'auch', 'noch', 'den', 'dem'],
    strong: ['ich', 'nicht', 'danke', 'guten', 'sehr', 'wir', 'haben', 'möchte', 'wissen', 'zimmer', 'weil', 'wann', 'sein', 'bin', 'sie', 'ob'],
  },
  nl: {
    common: ['de', 'een', 'en', 'is', 'voor', 'met', 'maar', 'meer', 'dit', 'deze', 'op', 'van', 'nog', 'als', 'naar', 'ook'],
    strong: ['het', 'ik', 'niet', 'dank', 'wij', 'jij', 'hebben', 'zijn', 'wil', 'weten', 'kamer', 'omdat', 'wanneer', 'waar', 'goedendag', 'vrij'],
  },
  pl: { common: ['nie', 'jest', 'na', 'do', 'to', 'w', 'z', 'ale', 'jak', 'czy', 'dla'], strong: ['się', 'że', 'dziękuję', 'dzień', 'gdzie', 'kiedy', 'bardzo', 'jestem', 'mam'] },
  tr: { common: ['bir', 'bu', 'ile', 'var', 'yok', 'ne', 'daha', 'olarak'], strong: ['için', 'ben', 'sen', 'çok', 'nasıl', 'teşekkür', 'merhaba', 'değil'] },
  id: { common: ['di', 'ini', 'itu', 'ada', 'apa', 'dan'], strong: ['yang', 'tidak', 'untuk', 'dengan', 'saya', 'anda', 'bagaimana', 'terima', 'kasih'] },
  sw: { common: ['na', 'ya', 'wa', 'ni', 'kwa', 'hii', 'hiyo'], strong: ['katika', 'asante', 'habari', 'nina', 'sana', 'kuwa', 'nini', 'wapi', 'ajili', 'nyumba', 'swali'] },
  yo: { common: ['ni', 'ti', 'mo', 'wa', 'bí', 'pé'], strong: ['àti', 'náà', 'kò', 'fún', 'ṣe', 'jọ̀wọ́', 'báwo', 'níbo', 'ẹ̀yin', 'ọmọ'] },
  ha: { common: ['da', 'ba', 'na', 'ne', 'ce', 'ya', 'ta'], strong: ['sun', 'ina', 'yaya', 'nagode', 'kuma', 'wannan', 'amma', 'gida'] },
  ig: { common: ['na', 'ya', 'ka', 'nke', 'dị'], strong: ['ndi', 'maka', 'anyị', 'gị', 'bụ', 'ihe', 'ole', 'ebee', 'daalụ'] },
};

function words(text: string): string[] {
  return text
    .toLowerCase()
    .replace(/[^\p{L}\p{M}\s'’]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

/**
 * Ranks the possible languages for a piece of text, best first.
 * An empty list means there was nothing to go on.
 */
export function rank(text: string, among?: string[]): Guess[] {
  const clean = text.trim();
  if (!clean) return [];

  // script first: it rules out almost everything and never needs a word list
  const letters = clean.replace(/[^\p{L}]/gu, '');
  for (const { lang, re } of SCRIPTS) {
    const hits = (clean.match(new RegExp(re.source, 'gu')) || []).length;
    if (letters.length && hits / letters.length > 0.3) {
      if (!among || among.includes(lang)) return [{ lang, score: 1 }];
    }
  }

  const found = words(clean);
  if (!found.length) return [];
  const candidates = among?.length ? among.filter((l) => WORDS[l]) : Object.keys(WORDS);
  const scores: Guess[] = [];
  for (const lang of candidates) {
    const profile = WORDS[lang];
    if (!profile) continue;
    let score = 0;
    let hits = 0;
    for (const w of found) {
      if (profile.strong.includes(w)) {
        score += 3;
        hits++;
      } else if (profile.common.includes(w)) {
        score += 1;
        hits++;
      }
    }
    if (score) scores.push({ lang, score: score / found.length, hits });
  }
  scores.sort((a, b) => b.score - a.score || a.lang.localeCompare(b.lang));
  return scores;
}

/** The single best guess, or null when the text is too short or too ambiguous. */
export function detect(text: string, among?: string[]): string | null {
  const ranked = rank(text, among);
  if (!ranked.length) return null;
  const [best, second] = ranked;
  // a near-tie between two languages is not a detection, it is a coin toss
  if (second && best.score - second.score < 0.05) return null;
  // a long sentence can carry a low ratio and still be certain, so accept either
  // a clear ratio or enough matched words to leave no real doubt
  if (best.score < 0.12 && !((best.hits ?? 0) >= 3 && best.score >= 0.07)) return null;
  return best.lang;
}

export type Segment = { text: string; lang: string | null };

/**
 * Splits text into sentences and labels each with its language, then merges
 * neighbours that agree so the result is a few blocks rather than many fragments.
 * Short fragments inherit the language around them, since three words rarely
 * carry enough signal on their own.
 */
export function segmentByLanguage(text: string, among?: string[]): Segment[] {
  const pieces = text.split(/(?<=[.!?。！？\n])\s+/).filter((p) => p.trim());
  if (pieces.length <= 1) return text.trim() ? [{ text: text.trim(), lang: detect(text, among) }] : [];

  const labelled = pieces.map((p) => ({ text: p.trim(), lang: detect(p, among) }));
  // fill gaps from the nearest labelled neighbour
  for (let i = 0; i < labelled.length; i++) {
    if (labelled[i].lang) continue;
    const before = labelled.slice(0, i).reverse().find((x) => x.lang)?.lang;
    const after = labelled.slice(i + 1).find((x) => x.lang)?.lang;
    labelled[i].lang = before ?? after ?? null;
  }

  const merged: Segment[] = [];
  for (const piece of labelled) {
    const last = merged[merged.length - 1];
    if (last && last.lang === piece.lang) last.text += ' ' + piece.text;
    else merged.push({ ...piece });
  }
  return merged;
}

/** True when the text holds more than one language. */
export function languagesIn(text: string, among?: string[]): string[] {
  const seen: string[] = [];
  for (const seg of segmentByLanguage(text, among))
    if (seg.lang && !seen.includes(seg.lang)) seen.push(seg.lang);
  return seen;
}
