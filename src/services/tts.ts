// Speech output. One queue so phrases never overlap. Cloned voice or Google's natural voice,
// with automatic fallback to the phone's built-in voice if they fail or there is no internet.
import { Linking, Platform } from 'react-native';
import * as Speech from 'expo-speech';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { getSettings } from '../store';
import { speechLocaleFor } from '../languages';
import { synthesize } from './fish';
import { t } from '../i18n/t';

let chain: Promise<void> = Promise.resolve();
let pending = 0;
let generation = 0;
let speaking = false;
let currentPlayer: AudioPlayer | null = null;
let tailTimer: ReturnType<typeof setTimeout> | null = null;
let lastError: string | null = null;
const listeners = new Set<(speaking: boolean) => void>();

function setSpeaking(v: boolean) {
  if (speaking === v) return;
  speaking = v;
  listeners.forEach((l) => l(v));
}

export function isSpeaking() {
  return speaking;
}
export function onSpeakingChange(l: (speaking: boolean) => void): () => void {
  listeners.add(l);
  return () => {
    listeners.delete(l);
  };
}
export function lastVoiceError() {
  return lastError;
}

// expo-speech on Android builds the locale with Locale.Builder().setLanguage(tag), which
// rejects a full tag like "it-IT" and silently falls back to the phone's default
// (usually English) voice. So on Android we pick a matching voice ourselves and pass it.
let voicesPromise: Promise<Speech.Voice[]> | null = null;
function deviceVoices(): Promise<Speech.Voice[]> {
  if (!voicesPromise) {
    voicesPromise = Speech.getAvailableVoicesAsync()
      .then((v) => {
        if (!v.length) voicesPromise = null; // engine not ready yet: ask again next time
        return v;
      })
      .catch(() => {
        voicesPromise = null;
        return [];
      });
  }
  return voicesPromise;
}

const norm = (tag: string) => tag.replace('_', '-').toLowerCase();

/** Best installed voice for a locale: exact region first, then any of that language; offline voices preferred. */
async function voiceFor(locale: string): Promise<string | undefined> {
  const voices = await deviceVoices();
  const want = norm(locale);
  const base = want.split('-')[0];
  const rank = (v: Speech.Voice) => {
    const tag = norm(v.language || '');
    const match = tag === want ? 0 : tag.split('-')[0] === base ? 1 : 9;
    const online = /network/i.test(v.identifier) ? 1 : 0; // network voices stall without internet
    const quality = v.quality === Speech.VoiceQuality.Enhanced ? 0 : 1;
    return match * 100 + online * 10 + quality;
  };
  const best = voices.filter((v) => rank(v) < 900).sort((a, b) => rank(a) - rank(b))[0];
  return best?.identifier;
}

async function systemSpeak(text: string, lang: string): Promise<void> {
  const speech = speechLocaleFor(lang, getSettings().accents);
  let voice: string | undefined;
  if (Platform.OS === 'android') {
    voice = await voiceFor(speech);
    if (!voice) lastError = `No ${speech} voice is installed on this phone, so it may sound wrong. Add it in Android Settings → Text-to-speech.`;
  }
  return new Promise((resolve) => {
    Speech.speak(text.slice(0, Speech.maxSpeechInputLength), {
      // Android only accepts a bare language code here; the voice carries the region
      language: Platform.OS === 'android' ? speech.split('-')[0] : speech,
      voice,
      rate: getSettings().speechRate,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

function playFile(uri: string, rate = 1): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const player = createAudioPlayer({ uri });
    if (rate !== 1) {
      try {
        player.setPlaybackRate(rate, 'high');
      } catch {}
    }
    currentPlayer = player;
    const finish = () => {
      if (done) return;
      done = true;
      clearTimeout(guard);
      try {
        sub.remove();
        player.remove();
      } catch {}
      if (currentPlayer === player) currentPlayer = null;
      resolve();
    };
    const guard = setTimeout(finish, 60000);
    const sub = player.addListener('playbackStatusUpdate', (status) => {
      if (status.didJustFinish) finish();
    });
    try {
      player.play();
    } catch {
      finish();
    }
  });
}

/** Plays MP3 bytes; on the phone they go through a cache file, kept when `keep` names it. */
async function playAudio(audio: ArrayBuffer, keep?: File): Promise<void> {
  if (Platform.OS === 'web') {
    const url = URL.createObjectURL(new Blob([audio], { type: 'audio/mpeg' }));
    try {
      await playFile(url);
    } finally {
      URL.revokeObjectURL(url);
    }
    return;
  }
  const file = keep ?? new File(Paths.cache, `tplus-tts-${Date.now()}.mp3`);
  file.create({ overwrite: true });
  file.write(new Uint8Array(audio));
  await playFile(file.uri);
  if (!keep) {
    try {
      file.delete();
    } catch {}
  }
}

async function cloneSpeak(text: string, voiceId: string): Promise<boolean> {
  try {
    const s = getSettings();
    await playAudio(await synthesize(text, voiceId, s.fishModel, s.speechRate));
    lastError = null;
    return true;
  } catch (e) {
    lastError = e instanceof Error ? e.message : 'Cloned voice failed';
    return false;
  }
}

// Google's online voice: a native speaker for every language, whatever voices the phone
// has installed. Clips are cached, so a phrase heard once plays again with no internet.
const GOOGLE_TTS_MAX = 180;

/** Splits text into pieces Google's voice accepts, breaking at sentences, then commas, then spaces. */
export function ttsChunks(text: string, max = GOOGLE_TTS_MAX): string[] {
  const out: string[] = [];
  let rest = text.replace(/\s+/g, ' ').trim();
  while (rest.length > max) {
    const head = rest.slice(0, max + 1);
    let cut = -1;
    for (const re of [/[.!?;:…。？！]\s/g, /[,，、]\s/g, /\s/g]) {
      for (const m of head.matchAll(re)) cut = (m.index ?? 0) + m[0].length;
      if (cut > 0) break;
    }
    if (cut <= 0) cut = max;
    out.push(rest.slice(0, cut).trim());
    rest = rest.slice(cut).trim();
  }
  if (rest) out.push(rest);
  return out;
}

function hash(str: string): string {
  let h = 5381;
  for (let i = 0; i < str.length; i++) h = ((h << 5) + h + str.charCodeAt(i)) | 0;
  return (h >>> 0).toString(36);
}

async function googleClip(piece: string, lang: string): Promise<{ audio?: ArrayBuffer; file: File }> {
  const file = new File(Paths.cache, `tplus-g-${lang}-${hash(piece)}-${piece.length}.mp3`);
  if (file.exists) return { file };
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 8000);
  try {
    const url =
      'https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob' +
      `&tl=${encodeURIComponent(lang)}&q=${encodeURIComponent(piece)}`;
    const res = await fetch(url, { signal: ctrl.signal });
    if (!res.ok) throw new Error(t('Google voice error {status}', { status: res.status }));
    const audio = await res.arrayBuffer();
    if (audio.byteLength < 200) throw new Error(t('Google voice returned no audio'));
    return { audio, file };
  } finally {
    clearTimeout(timer);
  }
}

async function googleSpeak(text: string, lang: string, gen: number): Promise<boolean> {
  if (Platform.OS === 'web') return false; // the browser blocks this request; its own voices are used
  try {
    const pieces = ttsChunks(text);
    // fetch the next clip while the current one plays
    let next = googleClip(pieces[0], lang);
    for (let i = 0; i < pieces.length; i++) {
      const clip = await next;
      if (i + 1 < pieces.length) next = googleClip(pieces[i + 1], lang);
      if (gen !== generation) return true;
      if (clip.audio) {
        clip.file.create({ overwrite: true });
        clip.file.write(new Uint8Array(clip.audio));
      }
      await playFile(clip.file.uri, getSettings().speechRate);
    }
    return true;
  } catch {
    return false; // no internet or blocked: the phone voice takes over
  }
}

/** A phone voice for the language, from the list already fetched (no fresh lookup, so no delay). */
async function quickPhoneVoice(lang: string): Promise<boolean> {
  if (Platform.OS !== 'android') return false;
  return !!(await voiceFor(speechLocaleFor(lang, getSettings().accents)));
}

/**
 * Speaks text in a language. `native: true` always uses a native speaker's voice, never the
 * cloned one (pronunciation practice). `fast: true` is for calls: when the native-speaker voice
 * is chosen and the phone has its own voice for the language, that one is used, because it
 * starts at once instead of being fetched first.
 */
export function speak(text: string, lang: string, opts: { native?: boolean; fast?: boolean } = {}): Promise<void> {
  const clean = text.trim();
  if (!clean) return Promise.resolve();
  const gen = generation;
  pending++;
  if (tailTimer) clearTimeout(tailTimer);
  setSpeaking(true);
  chain = chain
    .then(async () => {
      if (gen !== generation) return;
      const s = getSettings();
      const useClone = !opts.native && s.voiceMode === 'clone' && !!s.activeVoiceId;
      let ok = useClone ? await cloneSpeak(clean, s.activeVoiceId as string) : false;
      const quick = !useClone && opts.fast && s.fastCallVoice && !opts.native && (await quickPhoneVoice(lang));
      if (!ok && !quick && gen === generation && (opts.native || s.voiceMode === 'natural')) ok = await googleSpeak(clean, lang, gen);
      if (!ok && gen === generation) await systemSpeak(clean, lang);
    })
    .catch(() => {})
    .then(() => {
      pending--;
      if (pending <= 0) {
        pending = 0;
        // short tail so the microphone doesn't catch the end of our own voice
        tailTimer = setTimeout(() => setSpeaking(false), 120);
      }
    });
  return chain;
}

export function stopSpeaking() {
  generation++;
  try {
    Speech.stop();
  } catch {}
  try {
    currentPlayer?.pause();
  } catch {}
}

/**
 * Whether the phone has its own voice for a language (used offline, and by "Phone voice").
 * null where it cannot be told (web, iOS). Asks the engine afresh, so a voice installed a
 * moment ago is seen.
 */
export async function hasPhoneVoice(lang: string): Promise<boolean | null> {
  if (Platform.OS !== 'android') return null;
  voicesPromise = null;
  const voices = await deviceVoices();
  if (!voices.length) return null;
  return !!(await voiceFor(speechLocaleFor(lang, getSettings().accents)));
}

/** Opens Android's text-to-speech settings, where voices are downloaded. */
export function openVoiceSettings(): Promise<void> {
  return Linking.sendIntent('com.android.settings.TTS_SETTINGS').catch(() => Linking.openSettings());
}
