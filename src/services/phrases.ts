// The app-wide quick-phrase cache, saved on the phone so prepared phrases still
// work offline and after a restart.
import AsyncStorage from '@react-native-async-storage/async-storage';
import { translate } from './translator';
import { createPhraseCache } from './phonecall';

const KEY = 'translateplus.phrases.v1';
let saveTimer: ReturnType<typeof setTimeout> | null = null;

export const phraseCache = createPhraseCache(
  async (text, from, to) => (await translate(text, from, to)).text,
  {
    load: async () => {
      const raw = await AsyncStorage.getItem(KEY);
      return raw ? JSON.parse(raw) : {};
    },
    save: (data) => {
      if (saveTimer) clearTimeout(saveTimer);
      saveTimer = setTimeout(() => {
        AsyncStorage.setItem(KEY, JSON.stringify(data)).catch(() => {});
      }, 500);
    },
  }
);