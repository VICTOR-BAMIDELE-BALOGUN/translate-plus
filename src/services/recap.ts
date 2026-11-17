// What was agreed, pulled out of a finished conversation.
// There is no language model here, so this does not invent prose: it finds the
// things people actually need afterwards — times, dates, amounts, addresses,
// phone numbers — and shows each one with the sentence it came from.

export type Entry = { who: string; mine: boolean; original: string; translated?: string; ts?: number };
export type DetailKind = 'time' | 'date' | 'money' | 'phone' | 'email' | 'place';
export type Detail = { kind: DetailKind; value: string; line: string };

const MONTHS =
  'january|february|march|april|may|june|july|august|september|october|november|december|' +
  'gennaio|febbraio|marzo|aprile|maggio|giugno|luglio|agosto|settembre|ottobre|novembre|dicembre';
const DAYS =
  'monday|tuesday|wednesday|thursday|friday|saturday|sunday|today|tomorrow|tonight|' +
  'lunedì|martedì|mercoledì|giovedì|venerdì|sabato|domenica|oggi|domani|stasera|dopodomani';

const PATTERNS: { kind: DetailKind; re: RegExp }[] = [
  { kind: 'email', re: /\b[\w.+-]+@[\w-]+\.[\w.-]+\b/g },
  { kind: 'money', re: /(?:[€$£₦]\s?\d[\d.,]*)|(?:\b\d[\d.,]*\s?(?:euro?s?|eur|dollars?|pounds?|naira)\b)/gi },
  { kind: 'time', re: /\b\d{1,2}[:.]\d{2}\b|\b(?:alle|at|um|à|ore)\s+\d{1,2}(?:[:.]\d{2})?\b/gi },
  { kind: 'date', re: new RegExp(`\\b\\d{1,2}[/.-]\\d{1,2}(?:[/.-]\\d{2,4})?\\b|\\b(?:${DAYS})\\b|\\b\\d{1,2}\\s+(?:${MONTHS})\\b|\\b(?:${MONTHS})\\s+\\d{1,2}\\b`, 'gi') },
  { kind: 'phone', re: /(?:\+\d{1,3}[\s.-]?)?(?:\d[\s.-]?){8,13}\d\b/g },
  { kind: 'place', re: /\b(?:via|viale|piazza|corso|strada|street|road|avenue)\s+[\p{Lu}][\p{L}'’.-]*(?:\s+[\p{Lu}][\p{L}'’.-]*)*(?:\s+\d+[\p{L}]?)?/gu },
];

function tidy(value: string): string {
  return value.trim().replace(/\s+/g, ' ').replace(/[.,;:]+$/, '');
}

/**
 * Finds the details worth keeping. Each language's own text is searched as well as
 * the translation, because a time or a price often survives translation unchanged
 * while the sentence around it does not.
 */
export function extractDetails(entries: Entry[]): Detail[] {
  const found: Detail[] = [];
  const seen = new Set<string>();
  for (const entry of entries) {
    for (const source of [entry.original, entry.translated]) {
      if (!source) continue;
      for (const { kind, re } of PATTERNS) {
        re.lastIndex = 0;
        for (const match of source.matchAll(re)) {
          const value = tidy(match[0]);
          // a bare year or a one-digit fragment is noise, not a detail
          if (kind === 'phone' && value.replace(/\D/g, '').length < 9) continue;
          if (value.length < 3) continue;
          const key = `${kind}:${value.toLowerCase()}`;
          if (seen.has(key)) continue;
          seen.add(key);
          found.push({ kind, value, line: tidy(source) });
        }
      }
    }
  }
  const order: DetailKind[] = ['date', 'time', 'money', 'place', 'phone', 'email'];
  return found.sort((a, b) => order.indexOf(a.kind) - order.indexOf(b.kind));
}

export const KIND_LABELS: Record<DetailKind, string> = {
  date: 'Day',
  time: 'Time',
  money: 'Amount',
  place: 'Place',
  phone: 'Phone',
  email: 'Email',
};

function clock(ts?: number): string {
  if (!ts) return '';
  const d = new Date(ts);
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())} `;
}

/** The whole recap as plain text, for copying into notes or a message. */
export function buildRecap(title: string, entries: Entry[], details: Detail[]): string {
  const lines: string[] = [title, ''];
  if (details.length) {
    lines.push('Key details');
    for (const d of details) lines.push(`- ${KIND_LABELS[d.kind]}: ${d.value}`);
    lines.push('');
  }
  lines.push('Conversation');
  for (const e of entries) {
    const body = e.translated && e.translated !== e.original ? `${e.original}  →  ${e.translated}` : e.original;
    lines.push(`${clock(e.ts)}${e.who}: ${body}`);
  }
  return lines.join('\n');
}
