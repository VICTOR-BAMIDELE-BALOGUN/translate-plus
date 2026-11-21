// Theme data and resolution, with no React Native imports so it can be unit-tested.
//
// Each theme is a set of design tokens. Screens only ever read tokens, never raw colours,
// so a theme changes the whole visual language (canvas, light, surfaces, borders, shadows,
// shapes and states) while the layout and behaviour stay the same.
import { tk } from './i18n/t';

export type Palette = {
  mode: 'dark' | 'light';
  /** page canvas, and the colour the ambient gradient fades towards */
  bg: string; bg2: string;
  /** decorative surface (cards); may be translucent glass */
  card: string;
  /** reading surface: text panels, inputs, unselected chips; always more opaque than card */
  cardAlt: string;
  text: string; sub: string;
  /** borders and dividers */
  line: string;
  accent: string; accent2: string;
  /** text and icons drawn on accent */
  accentText: string;
  warm: string; danger: string; ok: string;
  /** bottom navigation bar */
  nav: string;
  /** two soft lights behind the content; 'transparent' turns the effect off */
  glowA: string; glowB: string;
  /** CSS box-shadow for raised surfaces, or 'none' */
  shadow: string;
  /** keyboard-focus ring */
  focus: string;
  /** border widths: normal surfaces, and anything selected */
  border: number; borderOn: number;
  /** corner radius of cards; controls derive from it */
  radius: number;
  /** web only: background blur behind glass surfaces, in px (0 = solid) */
  blur: number;
};

export type Theme = Palette & { id: string; name: string; pair: string; mood: string };

const list: Theme[] = [
  {
    id: 'deep-blue-glass', name: tk('Deep Blue Glass'), mood: tk('Confident and focused'), mode: 'dark', pair: 'daylight-glass',
    bg: '#071731', bg2: '#0C2851',
    card: 'rgba(24, 58, 112, 0.42)', cardAlt: 'rgba(10, 32, 68, 0.82)',
    text: '#F3F7FF', sub: '#A9BDD9', line: 'rgba(120, 180, 255, 0.24)',
    accent: '#3EDBFF', accent2: '#5978FF', accentText: '#03202C',
    warm: '#FFC46B', danger: '#FF8094', ok: '#5BE3A6',
    nav: 'rgba(6, 20, 44, 0.9)',
    glowA: 'rgba(62, 219, 255, 0.20)', glowB: 'rgba(89, 120, 255, 0.26)',
    shadow: '0px 10px 30px rgba(0, 8, 30, 0.45)',
    focus: '#3EDBFF', border: 1, borderOn: 2, radius: 20, blur: 14,
  },
  {
    id: 'aurora-glow', name: tk('Aurora Glow'), mood: tk('Warm and creative'), mode: 'dark', pair: 'daylight-glass',
    bg: '#10132C', bg2: '#31285A',
    card: 'rgba(70, 56, 126, 0.38)', cardAlt: 'rgba(26, 22, 58, 0.84)',
    text: '#FFF9FF', sub: '#C1B8D8', line: 'rgba(255, 190, 235, 0.22)',
    accent: '#FF9BCF', accent2: '#8C91FF', accentText: '#3A0822',
    warm: '#FFC98A', danger: '#FF8A9A', ok: '#8BE3B5',
    nav: 'rgba(16, 19, 44, 0.9)',
    glowA: 'rgba(255, 155, 207, 0.22)', glowB: 'rgba(140, 145, 255, 0.26)',
    shadow: '0px 12px 32px rgba(10, 4, 30, 0.5)',
    focus: '#FFC2E2', border: 1, borderOn: 2, radius: 24, blur: 16,
  },
  {
    id: 'daylight-glass', name: tk('Daylight Glass'), mood: tk('Calm and fresh'), mode: 'light', pair: 'deep-blue-glass',
    bg: '#EEF3F0', bg2: '#F8FBF9',
    card: 'rgba(255, 255, 255, 0.74)', cardAlt: 'rgba(255, 255, 255, 0.96)',
    text: '#142B27', sub: '#566C65', line: '#CFDDD7',
    accent: '#137C65', accent2: '#65CDB0', accentText: '#FFFFFF',
    warm: '#9A5600', danger: '#BF3030', ok: '#137C65',
    nav: 'rgba(255, 255, 255, 0.94)',
    glowA: 'rgba(101, 205, 176, 0.30)', glowB: 'rgba(140, 200, 255, 0.28)',
    shadow: '0px 6px 20px rgba(20, 43, 39, 0.08)',
    focus: '#0B5E4C', border: 1, borderOn: 2, radius: 20, blur: 8,
  },
  {
    // maximum legibility: solid surfaces, strong borders, no glass and no glow
    id: 'clear-contrast', name: tk('Clear Contrast'), mood: tk('Direct and easy to read'), mode: 'dark', pair: 'daylight-glass',
    bg: '#050505', bg2: '#050505',
    card: '#121212', cardAlt: '#1C1C1C',
    text: '#FFFFFF', sub: '#DEDEDE', line: '#8C8C8C',
    accent: '#F5FF62', accent2: '#36E2E2', accentText: '#0A0A00',
    warm: '#FFB347', danger: '#FF7070', ok: '#36E2E2',
    nav: '#0B0B0B',
    glowA: 'transparent', glowB: 'transparent',
    shadow: 'none',
    focus: '#36E2E2', border: 1.5, borderOn: 3, radius: 14, blur: 0,
  },
];

export const THEMES = list;
export const DEFAULT_THEME = 'deep-blue-glass';

const byId: Record<string, Theme> = Object.fromEntries(list.map((t) => [t.id, t]));

// themes from earlier versions, mapped to the closest new one
const OLD: Record<string, string> = {
  dark: 'deep-blue-glass', system: 'deep-blue-glass', light: 'daylight-glass',
  midnight: 'deep-blue-glass', ocean: 'deep-blue-glass', dusk: 'aurora-glow',
  daylight: 'daylight-glass', sky: 'daylight-glass', sand: 'daylight-glass',
  ink: 'clear-contrast', paper: 'clear-contrast',
};

export function normalizeThemeId(value: string): string {
  if (byId[value]) return value;
  return OLD[value] ?? DEFAULT_THEME;
}

export function themeById(id: string): Theme {
  return byId[normalizeThemeId(id)];
}

export function resolveTheme(id: string, followSystem: boolean, system: 'dark' | 'light'): Theme {
  const chosen = themeById(id);
  if (!followSystem || chosen.mode === system) return chosen;
  return byId[chosen.pair] ?? chosen;
}

/** The tokens as CSS custom properties, for the web page around the app. */
export function cssVariables(p: Palette): Record<string, string> {
  return {
    '--tp-bg': p.bg, '--tp-bg2': p.bg2, '--tp-card': p.card, '--tp-card-alt': p.cardAlt,
    '--tp-text': p.text, '--tp-sub': p.sub, '--tp-line': p.line,
    '--tp-accent': p.accent, '--tp-accent2': p.accent2, '--tp-on-accent': p.accentText,
    '--tp-focus': p.focus, '--tp-radius': `${p.radius}px`, '--tp-shadow': p.shadow,
  };
}
