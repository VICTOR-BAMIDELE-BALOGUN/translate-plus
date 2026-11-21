import { useColorScheme } from 'react-native';
import { useSettings } from './store';
import { resolveTheme, type Palette } from './themes';

export { THEMES, DEFAULT_THEME, normalizeThemeId, themeById, resolveTheme, cssVariables } from './themes';
export type { Palette, Theme } from './themes';

export function usePalette(): Palette {
  const system = useColorScheme();
  const { theme, followSystem } = useSettings();
  return resolveTheme(theme, followSystem, system === 'light' ? 'light' : 'dark');
}
