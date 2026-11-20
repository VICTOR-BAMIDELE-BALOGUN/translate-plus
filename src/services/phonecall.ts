// Phone-call mode logic, kept free of React Native so it can be unit-tested:
// quick phrases, their translation cache, and saved caption sessions.
import type { Entry } from './recap';

export type QuickPhrase = { id: string; text: string; lang: string; label?: string; builtin?: boolean };

// One-tap replies, written in English and translated on demand.
export const BUILTIN_PHRASES: QuickPhrase[] = [
  { id: 'b-intro', label: 'Introduce me', text: 'Hello. I am using a translation app, so there may be short pauses. Please speak slowly and stop after each sentence.' },
  { id: 'b-repeat', label: 'Please repeat', text: 'Sorry, could you please repeat that?' },
  { id: 'b-slow', label: 'Slower please', text: 'Could you please speak more slowly?' },
  { id: 'b-wait', label: 'One moment', text: 'One moment please, I am typing my answer.' },
  { id: 'b-yes', label: 'Yes', text: 'Yes.' },
  { id: 'b-no', label: 'No', text: 'No.' },
  { id: 'b-ok', label: 'I understand', text: 'I understand.' },
  { id: 'b-sms', label: 'Text it to me', text: 'Could you please send that to me by text message?' },
  { id: 'b-thanks', label: 'Thank you', text: 'Thank you very much.' },
  { id: 'b-bye', label: 'Goodbye', text: 'Thank you. Goodbye.' },
].map((p) => ({ ...p, lang: 'en', builtin: true }));

export const MAX_CUSTOM_PHRASES = 12;
export const MAX_PHRASE_LENGTH = 200;

/** Cleans a phrase the user typed; null if there is nothing worth saving. */
export function cleanPhrase(text: string): string | null {
  const t = text.replace(/\s+/g, ' ').trim().slice(0, MAX_PHRASE_LENGTH);
  return t.length ? t : null;
}

/** Adds a custom phrase unless it is a duplicate; newest first, capped. */
export function addPhrase(list: QuickPhrase[], phrase: QuickPhrase): QuickPhrase[] {
  const key = phrase.text.toLowerCase();
  const rest = list.filter((p) => p.text.toLowerCase() !== key);
  return [phrase, ...rest].slice(0, MAX_CUSTOM_PHRASES);
}

/** A short chip label: the phrase's own label, else its first few words. */
export function chipLabel(text: string, max = 24): string {
  const t = text.trim();
  if (t.length <= max) return t;
  const cut = t.slice(0, max);
  const space = cut.lastIndexOf(' ');
  return (space > 8 ? cut.slice(0, space) : cut) + '…';
}

// ---------- translation cache ----------

type TranslateFn = (text: string, from: string, to: string) => Promise<string>;
export type PhraseStore = { load: () => Promise<Record<string, string>>; save: (data: Record<string, string>) => void };

export const MAX_CACHED = 400;

export function cacheKey(text: string, from: string, to: string) {
  return `${from}>${to}|${text}`;
}

/**
 * Translations of quick phrases, kept between calls (and app restarts, given a store),
 * so a tap speaks at once even on a weak or missing connection.
 */
export function createPhraseCache(translate: TranslateFn, store?: PhraseStore) {
  let data: Record<string, string> = {};
  let loaded: Promise<void> | null = null;
  const inflight = new Map<string, Promise<string>>();

  const ready = () =>
    (loaded ??= (store ? store.load() : Promise.resolve({}))
      .then((d) => {
        data = { ...(d || {}), ...data };
      })
      .catch(() => {}));

  const remember = (key: string, value: string) => {
    delete data[key]; // re-insert so the newest stays when trimming
    data[key] = value;
    const keys = Object.keys(data);
    if (keys.length > MAX_CACHED) for (const k of keys.slice(0, keys.length - MAX_CACHED)) delete data[k];
    store?.save(data);
  };

  async function get(text: string, from: string, to: string): Promise<string> {
    if (from === to) return text;
    await ready();
    const key = cacheKey(text, from, to);
    if (data[key]) return data[key];
    let job = inflight.get(key);
    if (!job) {
      job = translate(text, from, to).then((out) => {
        remember(key, out);
        return out;
      });
      job.finally(() => inflight.delete(key)).catch(() => {});
      inflight.set(key, job);
    }
    return job;
  }

  /** Cached already, without translating. */
  function peek(text: string, from: string, to: string): string | undefined {
    return from === to ? text : data[cacheKey(text, from, to)];
  }

  /**
   * Translates every job ahead of time, a few at a time. Failures are counted, not
   * thrown: a phrase that could not be prepared is simply translated when tapped.
   */
  async function warm(
    jobs: { text: string; from: string; to: string }[],
    onProgress?: (done: number, total: number, failed: number) => void,
    concurrency = 3
  ): Promise<{ done: number; failed: number }> {
    await ready();
    let next = 0;
    let done = 0;
    let failed = 0;
    const worker = async () => {
      while (next < jobs.length) {
        const j = jobs[next++];
        try {
          await get(j.text, j.from, j.to);
        } catch {
          failed++;
        }
        done++;
        onProgress?.(done, jobs.length, failed);
      }
    };
    await Promise.all(Array.from({ length: Math.min(concurrency, jobs.length) }, worker));
    return { done, failed };
  }

  return { get, peek, warm, ready };
}

/** Everything phone-call mode wants translated before the first tap. */
export function warmJobs(phrases: QuickPhrase[], theirLang: string, myLang: string) {
  const jobs: { text: string; from: string; to: string }[] = [];
  for (const p of phrases) {
    if (p.lang !== theirLang) jobs.push({ text: p.text, from: p.lang, to: theirLang }); // what they hear
    if (p.lang !== myLang) jobs.push({ text: p.text, from: p.lang, to: myLang }); // what I see in the transcript
    if (p.label && p.lang !== myLang) jobs.push({ text: p.label, from: p.lang, to: myLang }); // chip label
  }
  const seen = new Set<string>();
  return jobs.filter((j) => {
    const k = cacheKey(j.text, j.from, j.to);
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// ---------- caption sessions ----------

export type CaptionLine = { id: string; original: string; translated: string; mine?: boolean; ts?: number };
export type CaptionSession = {
  id: string;
  startedAt: number;
  updatedAt: number;
  theirLang: string;
  myLang: string;
  callMode: boolean;
  lines: CaptionLine[];
};

export const MAX_SESSIONS = 20;
export const MAX_SESSION_LINES = 300;

/** Archives a session: newest first, replacing any copy with the same id, capped. */
export function archiveSession(list: CaptionSession[], session: CaptionSession): CaptionSession[] {
  if (!session.lines.length) return list;
  return [session, ...list.filter((s) => s.id !== session.id)].slice(0, MAX_SESSIONS);
}

/** The session's lines in the form the recap understands. */
export function sessionEntries(session: Pick<CaptionSession, 'lines'>): Entry[] {
  return session.lines.map((l) => ({
    who: l.mine ? 'Me' : 'Them',
    mine: !!l.mine,
    original: l.original,
    translated: l.translated,
    ts: l.ts,
  }));
}

export function sessionTitle(session: Pick<CaptionSession, 'startedAt' | 'callMode'>, langName: (code: string) => string, theirLang: string): string {
  const d = new Date(session.startedAt);
  const pad = (n: number) => String(n).padStart(2, '0');
  const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  const when = `${d.getDate()} ${months[d.getMonth()]} ${pad(d.getHours())}:${pad(d.getMinutes())}`;
  return `${session.callMode ? 'Call' : 'Captions'} · ${langName(theirLang)} · ${when}`;
}