// Preloaded course material, one pack per language. Italian is the only one for now;
// adding another means writing a pack and listing it here.
import italian from './italian';
import type { LearnPack } from './types';

export * from './types';

const PACKS: Record<string, LearnPack> = { it: italian };

export function packFor(lang: string): LearnPack | null {
  return PACKS[lang] ?? PACKS[lang.split('-')[0]] ?? null;
}

export function availablePacks(): LearnPack[] {
  return Object.values(PACKS);
}

/** Every phrase in a pack, flattened, for searching. */
export function searchPack(pack: LearnPack, query: string) {
  const q = query.trim().toLowerCase();
  if (!q) return [];
  const hits: { topic: string; phrase: LearnPack['topics'][0]['phrases'][0] }[] = [];
  for (const topic of pack.topics)
    for (const phrase of topic.phrases)
      if (phrase.it.toLowerCase().includes(q) || phrase.en.toLowerCase().includes(q))
        hits.push({ topic: topic.title, phrase });
  return hits;
}
