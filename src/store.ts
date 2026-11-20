import AsyncStorage from '@react-native-async-storage/async-storage';
import { useSyncExternalStore } from 'react';
import { archiveSession, MAX_SESSION_LINES, type CaptionLine, type CaptionSession, type QuickPhrase } from './services/phonecall';
import { addCard, cardSides, grade, isSaved, newCard, type Card } from './learn/review';

export type ClonedVoice = { id: string; title: string };
export type Settings = {
  displayName: string;
  uiLang: string; // the app's own language; 'auto' follows the phone
  myLang: string; // language I speak and read
  targetLang: string; // default language I translate into
  autoTranslateChats: boolean;
  showOriginal: boolean;
  autoSpeak: boolean;
  speechRate: number;
  voiceMode: 'natural' | 'system' | 'clone';
  voicePicked: boolean; // the user chose voiceMode themselves (before 'natural' existed, 'system' was just the default)
  voices: ClonedVoice[]; // max 3 slots
  activeVoiceId: string | null;
  fishModel: string;
  pauseMicWhileSpeaking: boolean;
  onDeviceRecognition: boolean;
  micBoost: boolean; // raise quiet speech before recognition (Android 13+)
  noiseReduction: boolean; // the phone's noise suppression on the mic (Android 13+)
  quickSend: boolean; // calls: send what was said at each short pause, not only at the end of a sentence
  fastCallVoice: boolean; // calls: use the phone's own voice when it has one, which starts at once
  accents: Record<string, string>; // language code -> chosen regional locale
  sentencePause: number; // ms of silence before a sentence counts as finished
  provider: 'google' | 'mymemory';
  register: 'auto' | 'formal' | 'informal';
  translationMode: 'online' | 'offlineFirst' | 'offlineOnly';
  offlineLanguages: string[];
  theme: string; // a theme id from theme.ts
  followSystem: boolean;
  captionSize: number;
  phoneCallMode: boolean; // Captions: type replies that are spoken into a speakerphone call
  customPhrases: QuickPhrase[]; // my own one-tap replies for phone-call mode
  listenLanguages: string[]; // the languages expected in a conversation
  paneLayout: 'stacked' | 'side';
  brokerUrl: string;
  linkBase: string;
};

export const DEFAULT_BROKER = 'wss://broker.emqx.io:8084/mqtt';

export const DEFAULT_SETTINGS: Settings = {
  displayName: 'Me',
  uiLang: 'auto',
  myLang: 'en',
  targetLang: 'it',
  autoTranslateChats: true,
  showOriginal: true,
  autoSpeak: true,
  speechRate: 1.0,
  voiceMode: 'natural',
  voicePicked: false,
  voices: [],
  activeVoiceId: null,
  fishModel: 's2.1-pro-free',
  pauseMicWhileSpeaking: true,
  onDeviceRecognition: false,
  micBoost: true,
  noiseReduction: true,
  quickSend: true,
  fastCallVoice: true,
  accents: {},
  sentencePause: 1500,
  provider: 'google',
  register: 'auto',
  translationMode: 'offlineFirst',
  offlineLanguages: [],
  theme: 'midnight',
  followSystem: false,
  captionSize: 22,
  phoneCallMode: false,
  customPhrases: [],
  listenLanguages: [],
  paneLayout: 'stacked',
  brokerUrl: DEFAULT_BROKER,
  linkBase: '',
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
  captionLive: CaptionSession | null; // the Captions conversation in progress (survives tab switches)
  captionSessions: CaptionSession[]; // finished ones, newest first
  cards: Card[]; // saved phrases for review, newest first
};

const KEY = 'translateplus.state.v1';
const MAX_HISTORY = 50;
const MAX_MESSAGES = 200;

let state: State = { ready: false, deviceId: '', settings: DEFAULT_SETTINGS, history: [], rooms: [], messages: {}, captionLive: null, captionSessions: [], cards: [] };
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
  // 'system' was the only default before the native-speaker voice existed: move those users over
  if (state.settings.voiceMode === 'system' && !state.settings.voicePicked) {
    state = { ...state, settings: { ...state.settings, voiceMode: 'natural' } };
  }
  // settings saved before themes had names: 'system' meant follow the phone
  const saved = state.settings.theme;
  if (saved === 'system' || saved === 'dark' || saved === 'light') {
    state = {
      ...state,
      settings: {
        ...state.settings,
        theme: saved === 'light' ? 'daylight' : 'midnight',
        followSystem: saved === 'system',
      },
    };
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
  set({ settings: DEFAULT_SETTINGS, history: [], rooms: [], messages: {}, captionLive: null, captionSessions: [], cards: [] });
}

// ---------- Captions sessions ----------

/** Changes the live session's lines, starting a session if there is none. */
export function updateCaptionLines(
  fn: (lines: CaptionLine[]) => CaptionLine[],
  meta: { theirLang: string; myLang: string; callMode: boolean }
) {
  const now = Date.now();
  const live: CaptionSession = state.captionLive ?? { id: newId(), startedAt: now, updatedAt: now, lines: [], ...meta };
  const lines = fn(live.lines).slice(-MAX_SESSION_LINES);
  if (!lines.length && !state.captionLive) return;
  // a call that starts part-way through a captions session marks the whole session as a call
  set({ captionLive: { ...live, ...meta, callMode: live.callMode || meta.callMode, lines, updatedAt: now } });
}

/** Ends the live session and keeps it with the saved ones; returns it (null if empty). */
export function finishCaptionSession(): CaptionSession | null {
  const live = state.captionLive;
  if (!live) return null;
  set({ captionLive: null, captionSessions: archiveSession(state.captionSessions, live) });
  return live.lines.length ? live : null;
}

export function deleteCaptionSession(id: string) {
  set({ captionSessions: state.captionSessions.filter((s) => s.id !== id) });
}

// ---------- Saved phrases ----------

/** Saves a translation for review; returns false when there is nothing to learn or it is already saved. */
export function saveCard(original: string, originalLang: string, translated: string, translatedLang: string): boolean {
  const sides = cardSides(original, originalLang, translated, translatedLang, state.settings.myLang);
  if (!sides || isSaved(state.cards, sides.back, sides.lang)) return false;
  set({ cards: addCard(state.cards, newCard(newId(), sides.front, sides.back, sides.lang, Date.now())) });
  return true;
}

/** Saves a phrase whose sides are already known (the phrasebook). Saving it again removes it. */
export function toggleCard(front: string, back: string, lang: string) {
  if (isSaved(state.cards, back, lang)) {
    const key = back.trim().toLowerCase();
    set({ cards: state.cards.filter((c) => !(c.back.toLowerCase() === key && c.lang === lang)) });
  } else set({ cards: addCard(state.cards, newCard(newId(), front, back, lang, Date.now())) });
}

export function gradeCard(id: string, remembered: boolean) {
  set({ cards: state.cards.map((c) => (c.id === id ? grade(c, remembered, Date.now()) : c)) });
}

export function deleteCard(id: string) {
  set({ cards: state.cards.filter((c) => c.id !== id) });
}
