// The phrasebook's explanations (meanings, topic titles, notes, course descriptions) are written
// in English. When the app is set to another language they are machine-translated once, the
// first time Learn opens, and kept on the phone. The phrases being learnt are never touched.
import { useEffect, useState } from 'react';
import AsyncStorage from '@react-native-async-storage/async-storage';
import type { LearnPack } from './types';
import { translateCatalog } from '../i18n/machine';
import { translateBatch } from '../services/translate';
import { activeLang } from '../i18n/t';

/** Every English explanation in a pack, once each. */
export function packEnglish(pack: LearnPack): string[] {
  const out = new Set<string>();
  const add = (s?: string) => s && s.trim() && out.add(s);
  add(pack.intro);
  pack.notes.forEach((n) => (add(n.title), add(n.body)));
  pack.topics.forEach((tp) => {
    add(tp.title);
    add(tp.note);
    tp.phrases.forEach((ph) => add(ph.en));
  });
  pack.resources.forEach((r) => (add(r.what), add(r.cost)));
  return [...out];
}

/** The pack with its explanations swapped for translations, where there is one. */
export function applyTable(pack: LearnPack, table: Record<string, string>): LearnPack {
  const tr = (s: string) => table[s] ?? s;
  return {
    ...pack,
    intro: tr(pack.intro),
    notes: pack.notes.map((n) => ({ ...n, title: tr(n.title), body: tr(n.body) })),
    topics: pack.topics.map((tp) => ({
      ...tp,
      title: tr(tp.title),
      note: tp.note ? tr(tp.note) : tp.note,
      phrases: tp.phrases.map((ph) => ({ ...ph, en: tr(ph.en) })),
    })),
    resources: pack.resources.map((r) => ({ ...r, what: tr(r.what), cost: tr(r.cost) })),
  };
}

function hash(s: string): string {
  let h = 5381;
  for (let i = 0; i < s.length; i++) h = ((h << 5) + h + s.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

const loaded = new Map<string, Record<string, string>>();

/**
 * The pack in the app's language. Returns the English pack straight away and swaps in the
 * translated one when it is ready; `translating` is true meanwhile.
 */
export function useLocalizedPack(pack: LearnPack | null): { pack: LearnPack | null; translating: boolean } {
  const lang = activeLang();
  const english = pack ? packEnglish(pack) : [];
  const key = pack ? `translateplus.learn.${pack.lang}.${lang}.${hash(english.join('\n'))}` : '';
  const [table, setTable] = useState<Record<string, string> | null>(() => loaded.get(key) ?? null);
  const [translating, setTranslating] = useState(false);

  useEffect(() => {
    if (!pack || lang === 'en' || lang === pack.lang) return;
    if (loaded.has(key)) {
      setTable(loaded.get(key)!);
      return;
    }
    let alive = true;
    (async () => {
      const saved = await AsyncStorage.getItem(key).catch(() => null);
      if (saved) {
        loaded.set(key, JSON.parse(saved));
        if (alive) setTable(loaded.get(key)!);
        return;
      }
      if (alive) setTranslating(true);
      try {
        const made = await translateCatalog(english, lang, translateBatch);
        if (Object.keys(made).length) {
          loaded.set(key, made);
          AsyncStorage.setItem(key, JSON.stringify(made)).catch(() => {});
          if (alive) setTable(made);
        }
      } catch {
        // offline: the explanations stay in English for now and are tried again next time
      } finally {
        if (alive) setTranslating(false);
      }
    })();
    return () => {
      alive = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [key]);

  if (!pack || lang === 'en' || lang === pack.lang || !table) return { pack, translating };
  return { pack: applyTable(pack, table), translating };
}
