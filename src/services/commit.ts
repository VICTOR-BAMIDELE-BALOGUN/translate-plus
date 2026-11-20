// Sending speech before the sentence is over. When the speaker pauses briefly, what they
// have said so far is sent at once instead of waiting for the recogniser to decide the
// sentence has ended; the rest of the sentence follows on its own. Pure, so it can be tested.

export function words(text: string): string[] {
  return text.trim().split(/\s+/).filter(Boolean);
}

/** The part of a recognised utterance not sent yet, given how many of its words already went. */
export function unsent(text: string, sentWords: number): string {
  return words(text).slice(sentWords).join(' ');
}

/** Whether a pending piece is worth sending on its own: a single filler word is not. */
export function worthSending(piece: string, minWords = 2): boolean {
  const w = words(piece);
  if (w.length >= minWords) return true;
  // one long word ("Grazie", "Perfetto", "Arrivederci") still makes sense alone
  return w.length === 1 && w[0].replace(/[^\p{L}]/gu, '').length >= 6;
}
