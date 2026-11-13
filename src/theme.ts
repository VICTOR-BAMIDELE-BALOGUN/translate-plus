import { useColorScheme } from 'react-native';
import { useSettings } from './store';

export type Palette = {
  bg: string; card: string; cardAlt: string; text: string; sub: string; line: string;
  accent: string; accentText: string; warm: string; danger: string; ok: string;
};

const dark: Palette = {
  bg: '#0E1513', card: '#18221F', cardAlt: '#1F2C28', text: '#F1F5F2', sub: '#93A39C', line: '#2A3A35',
  accent: '#3DDC97', accentText: '#06231A', warm: '#FFB454', danger: '#FF6B6B', ok: '#3DDC97',
};
const light: Palette = {
  bg: '#F4F7F5', card: '#FFFFFF', cardAlt: '#E9F0EC', text: '#10201A', sub: '#5C6F67', line: '#D5E0DA',
  accent: '#0E9F6E', accentText: '#FFFFFF', warm: '#C26A00', danger: '#D43C3C', ok: '#0E9F6E',
};

export function usePalette(): Palette {
  const system = useColorScheme();
  const theme = useSettings().theme;
  const mode = theme === 'system' ? system ?? 'dark' : theme;
  return mode === 'light' ? light : dark;
}
