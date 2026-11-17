// Fish Audio client: voice cloning (create a private voice model from a recording)
// and text-to-speech in that voice. Uses the user's own free API key.
import { Platform } from 'react-native';
import { readSecret, writeSecret } from './keystore';

const BASE = 'https://api.fish.audio';

let cachedKey: string | null | undefined;

export async function getFishKey(): Promise<string | null> {
  if (cachedKey !== undefined) return cachedKey;
  cachedKey = await readSecret();
  return cachedKey;
}

export async function setFishKey(key: string): Promise<void> {
  const k = key.trim();
  await writeSecret(k); // throws if storage is blocked, so the UI can say so
  cachedKey = k || null;
}

async function failure(res: Response): Promise<Error> {
  let detail = '';
  try {
    const body = await res.json();
    detail = body?.message || body?.detail || '';
  } catch {}
  if (res.status === 401) return new Error('Fish Audio rejected the API key. Check it in Settings.');
  if (res.status === 402) return new Error('Fish Audio: no credit left on this account.');
  if (res.status === 429) return new Error('Fish Audio: too many requests, try again shortly.');
  return new Error(`Fish Audio error ${res.status}${detail ? ': ' + detail : ''}`);
}

export async function createVoice(title: string, fileUri: string): Promise<{ id: string; title: string }> {
  const key = await getFishKey();
  if (!key) throw new Error('Add your Fish Audio API key first.');
  const form = new FormData();
  form.append('type', 'tts');
  form.append('title', title);
  form.append('train_mode', 'fast');
  form.append('visibility', 'private');
  if (Platform.OS === 'web') {
    // a browser recording is a blob: URL; FormData needs the actual Blob
    const blob = await (await fetch(fileUri)).blob();
    const ext = (blob.type.split('/')[1] || 'webm').split(';')[0];
    form.append('voices', blob, `sample.${ext}`);
  } else {
    form.append('voices', { uri: fileUri, name: 'sample.m4a', type: 'audio/mp4' } as any);
  }
  const res = await fetch(`${BASE}/model`, { method: 'POST', headers: { Authorization: `Bearer ${key}` }, body: form });
  if (!res.ok) throw await failure(res);
  const body = await res.json();
  if (!body?._id) throw new Error('Fish Audio did not return a voice id.');
  return { id: String(body._id), title: String(body.title ?? title) };
}

export async function deleteVoice(id: string): Promise<void> {
  const key = await getFishKey();
  if (!key) return;
  const res = await fetch(`${BASE}/model/${encodeURIComponent(id)}`, { method: 'DELETE', headers: { Authorization: `Bearer ${key}` } });
  if (!res.ok && res.status !== 404) throw await failure(res);
}

export async function synthesize(text: string, voiceId: string, model: string, speed: number): Promise<ArrayBuffer> {
  const key = await getFishKey();
  if (!key) throw new Error('Add your Fish Audio API key first.');
  const ctrl = new AbortController();
  const timer = setTimeout(() => ctrl.abort(), 15000);
  try {
    const res = await fetch(`${BASE}/v1/tts`, {
      method: 'POST',
      signal: ctrl.signal,
      headers: { Authorization: `Bearer ${key}`, 'Content-Type': 'application/json', model },
      body: JSON.stringify({
        text,
        reference_id: voiceId,
        format: 'mp3',
        mp3_bitrate: 64,
        latency: 'balanced',
        prosody: { speed },
      }),
    });
    if (!res.ok) throw await failure(res);
    return await res.arrayBuffer();
  } finally {
    clearTimeout(timer);
  }
}
