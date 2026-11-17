// Where the Fish Audio key lives. The phone has a real keystore; a browser does not,
// so the web build falls back to its own storage, which the UI says plainly.
import { Platform } from 'react-native';
import * as SecureStore from 'expo-secure-store';

const KEY = 'translateplus.fishKey';

export const secretsAreProtected = Platform.OS !== 'web';

function webStore(): Storage | null {
  try {
    return typeof window !== 'undefined' && window.localStorage ? window.localStorage : null;
  } catch {
    return null; // storage can be blocked entirely in private windows
  }
}

export async function readSecret(): Promise<string | null> {
  if (Platform.OS === 'web') {
    try {
      return webStore()?.getItem(KEY) || null;
    } catch {
      return null;
    }
  }
  try {
    return (await SecureStore.getItemAsync(KEY)) || null;
  } catch {
    return null;
  }
}

export async function writeSecret(value: string): Promise<void> {
  if (Platform.OS === 'web') {
    const store = webStore();
    if (!store) throw new Error('This browser is blocking storage, so the key cannot be saved.');
    if (value) store.setItem(KEY, value);
    else store.removeItem(KEY);
    return;
  }
  if (value) await SecureStore.setItemAsync(KEY, value);
  else await SecureStore.deleteItemAsync(KEY);
}
