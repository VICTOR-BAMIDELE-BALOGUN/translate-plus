// Machine translation of the interface into languages that are not built into the app.
// Every interface string is sent in a few large batches, each line tagged with its number
// so the answers can be matched back, and placeholders protected from being translated.
// Pure apart from the `send` function passed in, so it can be unit-tested.

export type Send = (text: string, to: string) => Promise<string>;

const VAR = /\{(\w+)\}/g;

/** {name} → ⟦v0⟧, so the translator leaves placeholders alone; also returns the names. */
export function protect(text: string): { text: string; vars: string[] } {
  const vars: string[] = [];
  const out = text
    .replace(VAR, (_, name) => {
      vars.push(name);
      return `⟦v${vars.length - 1}⟧`;
    })
    .replace(/\n/g, ' ⟦br⟧ ');
  return { text: out, vars };
}

/** The reverse of protect; null if a placeholder went missing on the way. */
export function restore(text: string, vars: string[]): string | null {
  let out = text.replace(/\s*⟦br⟧\s*/g, '\n');
  for (let i = 0; i < vars.length; i++) {
    const tag = new RegExp(`⟦\\s*v\\s*${i}\\s*⟧`);
    if (!tag.test(out)) return null;
    out = out.replace(tag, `{${vars[i]}}`);
  }
  if (/⟦|⟧/.test(out)) return null;
  return out.trim();
}

/** Groups numbered lines into requests of at most `max` characters. */
export function batches(lines: string[], max = 3000): number[][] {
  const out: number[][] = [];
  let cur: number[] = [];
  let size = 0;
  lines.forEach((line, i) => {
    const len = line.length + 8;
    if (cur.length && size + len > max) {
      out.push(cur);
      cur = [];
      size = 0;
    }
    cur.push(i);
    size += len;
  });
  if (cur.length) out.push(cur);
  return out;
}

/** Reads a translated batch back into numbered lines; a marker may have moved within its line. */
export function parseBatch(text: string): Map<number, string> {
  const found = new Map<number, string>();
  for (const raw of text.split('\n')) {
    const m = /⟦\s*(\d+)\s*⟧/.exec(raw);
    if (!m) continue;
    const line = (raw.slice(0, m.index) + ' ' + raw.slice(m.index + m[0].length)).replace(/\s+/g, ' ').trim();
    if (line) found.set(Number(m[1]), line);
  }
  return found;
}

const hasLetters = (s: string) => /\p{L}{2,}/u.test(s);

/**
 * Translates every English interface string into `to`. Strings that fail, lose a placeholder
 * or come back unchanged are tried once more on their own; whatever still fails is left out,
 * so the interface shows English for it.
 */
export async function translateCatalog(
  keys: string[],
  to: string,
  send: Send,
  onProgress?: (done: number, total: number) => void
): Promise<Record<string, string>> {
  const prepared = keys.map(protect);
  const result: Record<string, string> = {};
  const retry: number[] = [];
  const groups = batches(prepared.map((p) => p.text));
  let done = 0;

  for (const group of groups) {
    const body = group.map((i) => `⟦${i}⟧ ${prepared[i].text}`).join('\n');
    let parsed = new Map<number, string>();
    try {
      parsed = parseBatch(await send(body, to));
    } catch {
      // the whole batch failed: each line gets its own try below
    }
    for (const i of group) {
      const back = parsed.get(i);
      const text = back !== undefined ? restore(back, prepared[i].vars) : null;
      if (text && !(hasLetters(keys[i]) && text === keys[i])) result[keys[i]] = text;
      else retry.push(i);
    }
    done += group.length;
    onProgress?.(done, keys.length);
  }

  for (const i of retry) {
    try {
      const text = restore(await send(prepared[i].text, to), prepared[i].vars);
      if (text) result[keys[i]] = text;
    } catch {
      // stays in English
    }
  }
  return result;
}
