// Theme data and resolution, with no React Native imports so it can be unit-tested.
export type Palette = {
  mode: 'dark' | 'light';
  bg: string; card: string; cardAlt: string; text: string; sub: string; line: string;
  accent: string; accentText: string; warm: string; danger: string; ok: string;
};

export type Theme = Palette & { id: string; name: string; pair: string };

// Four pairs: each dark theme has a light counterpart, so "Match phone" can swap
// between them without the colours jumping to something unrelated.
const list: Theme[] = [
  {
    id: 'midnight', name: 'Midnight', mode: 'dark', pair: 'daylight',
    bg: '#0E1513', card: '#18221F', cardAlt: '#1F2C28', text: '#F1F5F2', sub: '#93A39C', line: '#2A3A35',
    accent: '#3DDC97', accentText: '#06231A', warm: '#FFB454', danger: '#FF6B6B', ok: '#3DDC97',
  },
  {
    id: 'daylight', name: 'Daylight', mode: 'light', pair: 'midnight',
    bg: '#F4F7F5', card: '#FFFFFF', cardAlt: '#E9F0EC', text: '#10201A', sub: '#5C6F67', line: '#D5E0DA',
    accent: '#0E9F6E', accentText: '#FFFFFF', warm: '#C26A00', danger: '#D43C3C', ok: '#0E9F6E',
  },
  {
    id: 'ocean', name: 'Ocean', mode: 'dark', pair: 'sky',
    bg: '#0B1220', card: '#141E33', cardAlt: '#1B2942', text: '#EAF0FA', sub: '#8CA0C0', line: '#253451',
    accent: '#4CC9F0', accentText: '#04202E', warm: '#FFC46B', danger: '#FF7A7A', ok: '#4CC9F0',
  },
  {
    id: 'sky', name: 'Sky', mode: 'light', pair: 'ocean',
    bg: '#F2F6FC', card: '#FFFFFF', cardAlt: '#E6EEF9', text: '#0D1B2A', sub: '#5A6B82', line: '#D2DEEE',
    accent: '#0B6FA4', accentText: '#FFFFFF', warm: '#B46A00', danger: '#CC3B3B', ok: '#0B6FA4',
  },
  {
    id: 'dusk', name: 'Dusk', mode: 'dark', pair: 'sand',
    bg: '#16101A', card: '#211829', cardAlt: '#2C2036', text: '#F6EFF8', sub: '#A795B0', line: '#3B2C46',
    accent: '#E86FA8', accentText: '#2A0A1B', warm: '#FFB454', danger: '#FF7A8A', ok: '#7BD88F',
  },
  {
    id: 'sand', name: 'Sand', mode: 'light', pair: 'dusk',
    bg: '#FAF5EE', card: '#FFFFFF', cardAlt: '#F2E9DC', text: '#241C12', sub: '#6B5B48', line: '#E0D3BF',
    accent: '#C2612F', accentText: '#FFFFFF', warm: '#A86A00', danger: '#C2402F', ok: '#4F7A3A',
  },
  {
    // deliberately maximum contrast, for bright sunlight or tired eyes
    id: 'ink', name: 'Ink', mode: 'dark', pair: 'paper',
    bg: '#000000', card: '#0E0E0E', cardAlt: '#1A1A1A', text: '#FFFFFF', sub: '#B5B5B5', line: '#3A3A3A',
    accent: '#FFC93C', accentText: '#1A1200', warm: '#FFC93C', danger: '#FF7B7B', ok: '#5BD98A',
  },
  {
    id: 'paper', name: 'Paper', mode: 'light', pair: 'ink',
    bg: '#FFFFFF', card: '#FFFFFF', cardAlt: '#EFEFEF', text: '#000000', sub: '#4A4A4A', line: '#BFBFBF',
    accent: '#0B5FD0', accentText: '#FFFFFF', warm: '#8A5200', danger: '#C01B1B', ok: '#0A7A3D',
  },
];

export const THEMES = list;
export const DEFAULT_THEME = 'midnight';

const byId: Record<string, Theme> = Object.fromEntries(list.map((t) => [t.id, t]));

/** Old saved values were 'dark' | 'light' | 'system'; map them onto the new ids. */
export function normalizeThemeId(value: string): string {
  if (byId[value]) return value;
  if (value === 'light') return 'daylight';
  return DEFAULT_THEME; // covers 'dark', 'system' and anything unrecognised
}

export function themeById(id: string): Theme {
  return byId[normalizeThemeId(id)];
}

export function resolveTheme(id: string, followSystem: boolean, system: 'dark' | 'light'): Theme {
  const chosen = themeById(id);
  if (!followSystem || chosen.mode === system) return chosen;
  return byId[chosen.pair] ?? chosen;
}
