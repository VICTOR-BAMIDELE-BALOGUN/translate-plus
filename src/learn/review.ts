// Saved phrases and spaced review. A card climbs a box each time it is remembered and
// drops back to the start when it is not; higher boxes come back less often.
// Pure, so it can be unit-tested.

export type Card = {
  id: string;
  front: string; // in my language: the prompt
  back: string; // in the language being learnt: the answer, and what is spoken
  lang: string; // language of `back`
  addedAt: number;
  box: number; // 0 = new or forgotten
  due: number; // when it next comes up (ms)
  seen: number; // times reviewed
};

const DAY = 24 * 60 * 60 * 1000;
/** Days until the next review for each box. */
export const BOX_DAYS = [0, 1, 3, 7, 14, 30, 90];
export const MAX_CARDS = 500;

export function newCard(id: string, front: string, back: string, lang: string, now: number): Card {
  return { id, front: front.trim(), back: back.trim(), lang, addedAt: now, box: 0, due: now, seen: 0 };
}

/** Adds a card unless the same phrase is already saved; newest first, capped. */
export function addCard(list: Card[], card: Card): Card[] {
  const key = card.back.toLowerCase();
  if (!card.back || list.some((c) => c.back.toLowerCase() === key && c.lang === card.lang)) return list;
  return [card, ...list].slice(0, MAX_CARDS);
}

export function isSaved(list: Card[], back: string, lang: string): boolean {
  const key = back.trim().toLowerCase();
  return list.some((c) => c.back.toLowerCase() === key && c.lang === lang);
}

/** Records one review: remembered moves the card up a box, forgotten sends it back to box 0. */
export function grade(card: Card, remembered: boolean, now: number): Card {
  const box = remembered ? Math.min(card.box + 1, BOX_DAYS.length - 1) : 0;
  // a forgotten card comes back later in the same session, not straight away
  const due = remembered ? now + BOX_DAYS[box] * DAY : now + 60 * 1000;
  return { ...card, box, due, seen: card.seen + 1 };
}

/** Cards due now, the ones overdue longest first. */
export function dueCards(list: Card[], now: number): Card[] {
  return list.filter((c) => c.due <= now).sort((a, b) => a.due - b.due);
}

/** Which side of a translation is the one being learnt. */
export function cardSides(
  original: string,
  originalLang: string,
  translated: string,
  translatedLang: string,
  myLang: string
): { front: string; back: string; lang: string } | null {
  const o = original.trim();
  const t = translated.trim();
  if (!o || !t) return null;
  const base = (c: string) => c.split('-')[0];
  if (base(translatedLang) !== base(myLang)) return { front: o, back: t, lang: translatedLang };
  if (originalLang && originalLang !== 'auto' && base(originalLang) !== base(myLang)) return { front: t, back: o, lang: originalLang };
  return null; // both sides are in my own language: nothing to learn
}
