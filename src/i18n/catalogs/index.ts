// Built-in interface translations: written for the app, shipped with it, and usable with no
// internet. Each language file maps a number to a translation; the number is the position of
// the English text in _en.json, the list the translations were written against. Text added to
// the app later is not in _en.json, so it shows in English (or is machine-translated) until
// the files are extended. Any language not listed here is machine-translated when chosen.
import en from './_en.json';
import ar from './ar.json';
import bn from './bn.json';
import de from './de.json';
import el from './el.json';
import es from './es.json';
import fr from './fr.json';
import hi from './hi.json';
import it from './it.json';
import nl from './nl.json';
import pl from './pl.json';
import pt from './pt.json';
import ro from './ro.json';
import ru from './ru.json';
import sv from './sv.json';
import uk from './uk.json';
import zhCN from './zh-CN.json';

const ENGLISH: string[] = en;

/** Numbered translations → English text → translation. */
export function byEnglish(numbered: Record<string, string>, english: string[] = ENGLISH): Record<string, string> {
  const out: Record<string, string> = {};
  for (const [i, text] of Object.entries(numbered)) {
    const key = english[Number(i)];
    if (key !== undefined && text) out[key] = text;
  }
  return out;
}

const NUMBERED: Record<string, Record<string, string>> = {
  ar, bn, de, el, es, fr, hi, it, nl, pl, pt, ro, ru, sv, uk, 'zh-CN': zhCN,
};

export const BUILT_IN_CODES = Object.keys(NUMBERED);

const cache = new Map<string, Record<string, string>>();

/** Built-in tables, converted on first use so start-up stays quick. */
export const BUILT_IN: Record<string, Record<string, string>> = new Proxy({} as Record<string, Record<string, string>>, {
  get(_, lang: string) {
    if (!(lang in NUMBERED)) return undefined;
    if (!cache.has(lang)) cache.set(lang, byEnglish(NUMBERED[lang]));
    return cache.get(lang);
  },
  has(_, lang: string) {
    return lang in NUMBERED;
  },
});
