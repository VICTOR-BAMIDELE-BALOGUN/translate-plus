// Checks that the phone is ready for the languages in use: its own voice (what speaks when
// there is no internet) and the offline translation model. Shown only when something is missing.
import React, { useCallback, useEffect, useState } from 'react';
import { AppState, Platform, Text, View } from 'react-native';
import { Btn, Card, Label } from './ui';
import { usePalette } from '../theme';
import { updateSettings, useSettings } from '../store';
import { hasPhoneVoice, openVoiceSettings } from '../services/tts';
import { downloadOfflineModel, offlineAvailable, offlineSupported } from '../services/offline';
import { langName } from '../languages';

export default function LanguageCheck() {
  const p = usePalette();
  const s = useSettings();
  const langs = [s.myLang, s.targetLang].filter((c, i, a) => c && c !== 'auto' && a.indexOf(c) === i);
  const key = langs.join(',');
  const [voices, setVoices] = useState<Record<string, boolean | null>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const check = useCallback(async () => {
    const out: Record<string, boolean | null> = {};
    for (const code of key.split(',')) out[code] = await hasPhoneVoice(code).catch(() => null);
    setVoices(out);
  }, [key]);

  useEffect(() => {
    check();
    // coming back from Android's voice settings: look again
    const sub = AppState.addEventListener('change', (state) => state === 'active' && check());
    return () => sub.remove();
  }, [check]);

  if (Platform.OS !== 'android') return null;

  const missingVoice = langs.filter((c) => voices[c] === false);
  const missingModel = offlineAvailable()
    ? langs.filter((c) => offlineSupported(c) && !s.offlineLanguages.includes(c))
    : [];
  if (!missingVoice.length && !missingModel.length) return null;

  const download = async (code: string) => {
    setBusy(code);
    setError(null);
    try {
      await downloadOfflineModel(code);
      const next = [...s.offlineLanguages, code];
      if (!next.includes('en')) next.push('en'); // English is the pivot, fetched with any model
      updateSettings({ offlineLanguages: next });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed. Check your connection.');
    } finally {
      setBusy(null);
    }
  };

  return (
    <Card style={{ borderColor: p.warm }}>
      <Label>Not ready offline</Label>
      {missingVoice.map((code) => (
        <View key={`v-${code}`} style={{ paddingVertical: 6 }}>
          <Text style={{ color: p.text, fontSize: 14, lineHeight: 20 }}>
            This phone has no {langName(code)} voice. Online the native-speaker voice is used, but without
            internet {langName(code)} would be read in another accent.
          </Text>
          <Btn small kind="warm" label={`Get the ${langName(code)} voice`} style={{ alignSelf: 'flex-start', marginTop: 6 }} onPress={() => openVoiceSettings()} />
        </View>
      ))}
      {missingVoice.length ? (
        <Text style={{ color: p.sub, fontSize: 12, lineHeight: 18 }}>
          In the settings that open: Preferred engine → Speech Services by Google → ⚙ → Install voice data.
        </Text>
      ) : null}
      {missingModel.map((code) => (
        <View key={`m-${code}`} style={{ paddingVertical: 6 }}>
          <Text style={{ color: p.text, fontSize: 14, lineHeight: 20 }}>
            {langName(code)} can't be translated without internet yet (about 30 MB to download).
          </Text>
          <Btn
            small
            kind="warm"
            label={busy === code ? 'Downloading…' : `Download ${langName(code)}`}
            disabled={!!busy}
            style={{ alignSelf: 'flex-start', marginTop: 6 }}
            onPress={() => download(code)}
          />
        </View>
      ))}
      {error ? <Text style={{ color: p.danger, fontSize: 12, marginTop: 4 }}>{error}</Text> : null}
    </Card>
  );
}
