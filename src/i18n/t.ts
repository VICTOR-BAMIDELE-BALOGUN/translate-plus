// The translation lookup itself, with no React Native imports, so plain modules (and the
// unit tests) can use it. src/i18n/index.ts decides which table is active.

let active: { lang: string; table: Record<string, string> | null } = { lang: 'en', table: null };

/** Sets the table t() reads from; null means English. */
export function setActive(lang: string, table: Record<string, string> | null) {
  active = { lang, table };
}

export function activeLang(): string {
  return active.lang;
}

function fill(text: string, vars?: Record<string, string | number>): string {
  if (!vars) return text;
  return text.replace(/\{(\w+)\}/g, (m, name) => (name in vars ? String(vars[name]) : m));
}

/** An interface string in the app's language; `vars` fill its {placeholders}. */
export function t(en: string, vars?: Record<string, string | number>): string {
  return fill(active.table?.[en] ?? en, vars);
}

/**
 * Marks English text that is stored in a list or constant and translated later, where it is
 * shown, with t(value). It returns the text unchanged; it only tells the key collector.
 */
export function tk<T extends string>(en: T): T {
  return en;
}
