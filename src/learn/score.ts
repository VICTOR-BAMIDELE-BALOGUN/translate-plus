// Pronunciation check: compares what speech recognition heard with the phrase that was
// meant, word by word. Pure, so it can be unit-tested.

export type WordMark = { word: string; mark: 'ok' | 'close' | 'missed' };
export type Score = { words: WordMark[]; percent: number; heard: string };

/** Lower case, accents and punctuation removed; apostrophes split words ("c'è" → "c e"). */
export function normalizeWords(text: string): string[] {
  return text
    .toLowerCase()
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .replace(/[’'`]/g, ' ')
    .replace(/[^\p{L}\p{N}\s]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
}

function distance(a: string, b: string): number {
  const row = Array.from({ length: b.length + 1 }, (_, j) => j);
  for (let i = 1; i <= a.length; i++) {
    let prev = row[0];
    row[0] = i;
    for (let j = 1; j <= b.length; j++) {
      const cur = row[j];
      row[j] = Math.min(row[j] + 1, row[j - 1] + 1, prev + (a[i - 1] === b[j - 1] ? 0 : 1));
      prev = cur;
    }
  }
  return row[b.length];
}

/** 2 = same word, 1 = nearly (one letter off in a longer word), 0 = different. */
function similarity(a: string, b: string): number {
  if (a === b) return 2;
  if (Math.min(a.length, b.length) >= 4 && distance(a, b) <= 1) return 1;
  return 0;
}

/**
 * Scores what was heard against the target phrase. Words are aligned in order (so extra or
 * skipped words don't shift everything after them); each word of the target is marked.
 */
export function scorePronunciation(target: string, heard: string): Score {
  const want = normalizeWords(target);
  const got = normalizeWords(heard);
  // best alignment by dynamic programming over similarity
  const best: number[][] = Array.from({ length: want.length + 1 }, () => new Array(got.length + 1).fill(0));
  for (let i = 1; i <= want.length; i++)
    for (let j = 1; j <= got.length; j++)
      best[i][j] = Math.max(best[i - 1][j], best[i][j - 1], best[i - 1][j - 1] + similarity(want[i - 1], got[j - 1]));
  const marks: WordMark['mark'][] = new Array(want.length).fill('missed');
  for (let i = want.length, j = got.length; i > 0 && j > 0; ) {
    const sim = similarity(want[i - 1], got[j - 1]);
    if (sim > 0 && best[i][j] === best[i - 1][j - 1] + sim) {
      marks[i - 1] = sim === 2 ? 'ok' : 'close';
      i--;
      j--;
    } else if (best[i][j] === best[i - 1][j]) i--;
    else j--;
  }
  // show the phrase's own words (with accents and capitals), not the normalised ones
  const shown = target.split(/\s+/).filter(Boolean);
  const words: WordMark[] = [];
  let k = 0;
  for (const w of shown) {
    const parts = normalizeWords(w).length;
    const slice = marks.slice(k, k + parts);
    k += parts;
    const mark = !slice.length ? 'ok' : slice.every((m) => m === 'ok') ? 'ok' : slice.some((m) => m !== 'missed') ? 'close' : 'missed';
    words.push({ word: w, mark });
  }
  const points = marks.reduce((n, m) => n + (m === 'ok' ? 1 : m === 'close' ? 0.5 : 0), 0);
  return { words, percent: want.length ? Math.round((points / want.length) * 100) : 0, heard };
}

/** A short verdict for a score. */
export function verdict(percent: number): string {
  if (percent >= 90) return 'Perfetto!';
  if (percent >= 70) return 'Very close';
  if (percent >= 40) return 'Getting there';
  return 'Try again';
}