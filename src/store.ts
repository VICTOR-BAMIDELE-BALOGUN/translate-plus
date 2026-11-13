import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';

export type ClonedVoice = { id: string; title: string };
export type Settings = {
  displayName: string;
  myLang: string; // language I speak and read
  targetLang: string; // default language I translate into
  autoTranslateChats: boolean;
  showOriginal: boolean;
  autoSpeak: boolean;
  speechRate: number;
  voiceMode: 'system' | 'clone';
  voices: ClonedVoice[]; // max 3 slots
  activeVoiceId: string | null;
  fishModel: string;
  pauseMicWhileSpeaking: boolean;
  onDeviceRecognition: boolean;
  provider: 'google' | 'mymemory';
  theme: 'dark' | 'light' | 'system';
  captionSize: number;
  brokerUrl: string;
};

export const DEFAULT_BROKER = 'wss://broker.emqx.io:8084/mqtt';

export const DEFAULT_SETTINGS: Settings = {
  displayName: 'Me',
  myLang: 'en',
  targetLang: 'it',
  autoTranslateChats: true,
  showOriginal: true,
  autoSpeak: true,
  speechRate: 1.0,
  voiceMode: 'system',
  voices: [],
  activeVoiceId: null,
  fishModel: 's2.1-pro-free',
  pauseMicWhileSpeaking: true,
  onDeviceRecognition: false,
  provider: 'google',
  theme: 'dark',
  captionSize: 22,
  brokerUrl: DEFAULT_BROKER,
};

export type HistoryItem = { id: string; from: string; to: string; source: string; result: string; ts: number };
export type Room = { code: string; name: string; createdAt: number };
export type ChatMessage = {
  id: string; from: string; name: string; kind: 'chat' | 'call';
  text: string; lang: string; translated?: string; ts: number; mine: boolean;
};

type State = {
  ready: boolean;
  deviceId: string;
  settings: Settings;
  history: HistoryItem[];
  rooms: Room[];
  messages: Record<string, ChatMessage[]>;
};

const KEY = 'translateplus.state.v1';
const MAX_HISTORY = 50;
const MAX_MESSAGES = 200;

let state: State = { ready: false, deviceId: '', settings: DEFAULT_SETTINGS, history: [], rooms: [], messages: {} };
const listeners = new Set<() => void>();
let saveTimer: ReturnType<typeof setTimeout> | null = null;

function emit() {
  listeners.forEach((l) => l());
}

function persist() {
  if (saveTimer) clearTimeout(saveTimer);
  saveTimer = setTimeout(() => {
    const { ready, ...rest } = state;
    AsyncStorage.setItem(KEY, JSON.stringify(rest)).catch(() => {});
  }, 300);
}

function set(patch: Partial<State>) {
  state = { ...state, ...patch };
  emit();
  persist();
}

export function newId(): string {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 10);
}

export async function loadStore(): Promise<void> {
  try {
    const raw = await AsyncStorage.getItem(KEY);
    if (raw) {
      const saved = JSON.parse(raw);
      state = {
        ...state,
        ...saved,
        settings: { ...DEFAULT_SETTINGS, ...(saved.settings ?? {}) },
      };
    }
  } catch {
    // corrupted storage: start clean rather than crash
  }
  if (!state.deviceId) state = { ...state, deviceId: newId() };
  state = { ...state, ready: true };
  emit();
  persist();
}

export const getState = () => state;
export const getSettings = () => state.settings;
const subscribe = (l: () => void) => {
  listeners.add(l);
  return () => listeners.delete(l);
};

export function useStore(): State {
  return useSyncExternalStore(subscribe, getState, getState);
}
export function useSettings(): Settings {
  return useStore().settings;
}

export function updateSettings(patch: Partial<Settings>) {
  set({ settings: { ...state.settings, ...patch } });
}

export function addHistory(item: Omit<HistoryItem, 'id' | 'ts'>) {
  const next = [{ ...item, id: newId(), ts: Date.now() }, ...state.history].slice(0, MAX_HISTORY);
  set({ history: next });
}
export function clearHistory() {
  set({ history: [] });
}

export function addRoom(room: Room) {
  if (state.rooms.some((r) => r.code === room.code)) return;
  set({ rooms: [room, ...state.rooms] });
}
export function removeRoom(code: string) {
  const messages = { ...state.messages };
  delete messages[code];
  set({ rooms: state.rooms.filter((r) => r.code !== code), messages });
}

export function addMessage(code: string, msg: ChatMessage) {
  const list = state.messages[code] ?? [];
  if (list.some((m) => m.id === msg.id)) return;
  set({ messages: { ...state.messages, [code]: [...list, msg].slice(-MAX_MESSAGES) } });
}
export function patchMessage(code: string, id: string, patch: Partial<ChatMessage>) {
  const list = state.messages[code] ?? [];
  set({ messages: { ...state.messages, [code]: list.map((m) => (m.id === id ? { ...m, ...patch } : m)) } });
}

export function resetAll() {
  set({ settings: DEFAULT_SETTINGS, history: [], rooms: [], messages: {} });
}
