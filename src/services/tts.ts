// Speech output. One queue so phrases never overlap; cloned voice with automatic
// fallback to the phone's built-in voice if Fish Audio fails or is slow.
import * as Speech from 'expo-speech';
import { createAudioPlayer, type AudioPlayer } from 'expo-audio';
import { File, Paths } from 'expo-file-system';
import { getSettings } from '../store';
import { langByCode } from '../languages';
import { synthesize } from './fish';

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

function systemSpeak(text: string, lang: string): Promise<void> {
  return new Promise((resolve) => {
    const speech = langByCode(lang).speech || undefined;
    Speech.speak(text.slice(0, Speech.maxSpeechInputLength), {
      language: speech,
      rate: getSettings().speechRate,
      onDone: () => resolve(),
      onStopped: () => resolve(),
      onError: () => resolve(),
    });
  });
}

function playFile(uri: string): Promise<void> {
  return new Promise((resolve) => {
    let done = false;
    const player = createAudioPlayer({ uri });
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

async function cloneSpeak(text: string, voiceId: string): Promise<boolean> {
  try {
    const s = getSettings();
    const audio = await synthesize(text, voiceId, s.fishModel, s.speechRate);
    const file = new File(Paths.cache, `tplus-tts-${Date.now()}.mp3`);
    file.create({ overwrite: true });
    file.write(new Uint8Array(audio));
    await playFile(file.uri);
    try {
      file.delete();
    } catch {}
    lastError = null;
    return true;
  } catch (e) {
    lastError = e instanceof Error ? e.message : 'Cloned voice failed';
    return false;
  }
}

export function speak(text: string, lang: string): Promise<void> {
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
      const useClone = s.voiceMode === 'clone' && !!s.activeVoiceId;
      const ok = useClone ? await cloneSpeak(clean, s.activeVoiceId as string) : false;
      if (!ok && gen === generation) await systemSpeak(clean, lang);
    })
    .catch(() => {})
    .then(() => {
      pending--;
      if (pending <= 0) {
        pending = 0;
        // short tail so the microphone doesn't catch the end of our own voice
        tailTimer = setTimeout(() => setSpeaking(false), 250);
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
