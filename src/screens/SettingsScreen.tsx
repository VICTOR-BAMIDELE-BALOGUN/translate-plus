import React, { useEffect, useState } from 'react';
import { Alert, Linking, ScrollView, Text, TextInput, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { Btn, Card, Choice, ErrorText, Label, LangButton, Stepper, ToggleRow, styles } from '../components/ui';
import { usePalette } from '../theme';
import { DEFAULT_BROKER, clearHistory, resetAll, updateSettings, useSettings } from '../store';
import { createVoice, deleteVoice, getFishKey, setFishKey } from '../services/fish';
import { lastVoiceError, speak, stopSpeaking } from '../services/tts';
import { clearTranslateCache } from '../services/translate';
import { downloadOfflineModel, offlineAvailable, offlineLanguageCodes, offlineSupported } from '../services/offline';
import { langName } from '../languages';

const SAMPLE_TEXT =
  'Hello, this is my voice. I am recording a short sample so that my translations can sound like me. ' +
  'I speak clearly, at my normal speed, in a quiet room, and I keep going for about fifteen seconds.';

function VoiceClone() {
  const p = usePalette();
  const s = useSettings();
  const recorder = useAudioRecorder(RecordingPresets.HIGH_QUALITY);
  const [key, setKey] = useState('');
  const [hasKey, setHasKey] = useState(false);
  const [recording, setRecording] = useState(false);
  const [sampleUri, setSampleUri] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [started, setStarted] = useState(0);

  useEffect(() => {
    getFishKey().then((k) => setHasKey(!!k));
  }, []);

  const saveKey = async () => {
    await setFishKey(key);
    setHasKey(!!key.trim());
    setKey('');
  };

  const toggleRecord = async () => {
    setError(null);
    try {
      if (recording) {
        await recorder.stop();
        await setAudioModeAsync({ allowsRecording: false });
        setRecording(false);
        if (Date.now() - started < 8000) {
          setError('Too short. Record at least 10 seconds for a good clone.');
          setSampleUri(null);
          return;
        }
        setSampleUri(recorder.uri);
        return;
      }
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError('Microphone permission is needed to record a sample.');
        return;
      }
      stopSpeaking();
      await setAudioModeAsync({ allowsRecording: true, playsInSilentMode: true });
      await recorder.prepareToRecordAsync();
      recorder.record();
      setStarted(Date.now());
      setSampleUri(null);
      setRecording(true);
    } catch (e) {
      setRecording(false);
      setError(e instanceof Error ? e.message : 'Recording failed');
    }
  };

  const create = async () => {
    if (!sampleUri) return;
    setBusy(true);
    setError(null);
    try {
      const voice = await createVoice(title.trim() || `My voice ${s.voices.length + 1}`, sampleUri);
      updateSettings({ voices: [...s.voices, voice], activeVoiceId: voice.id, voiceMode: 'clone' });
      setSampleUri(null);
      setTitle('');
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not create the voice');
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    Alert.alert('Delete voice', 'Remove this cloned voice from Translate+ and from your Fish Audio account?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVoice(id);
          } catch (e) {
            setError((e instanceof Error ? e.message : 'Delete failed') + ' — removed from this phone only.');
          }
          const voices = s.voices.filter((v) => v.id !== id);
          const active = s.activeVoiceId === id ? voices[0]?.id ?? null : s.activeVoiceId;
          updateSettings({ voices, activeVoiceId: active, voiceMode: active ? s.voiceMode : 'system' });
        },
      },
    ]);
  };

  const test = async () => {
    setError(null);
    await speak(`This is how I sound in ${langName(s.targetLang)}.`, 'en');
    if (s.voiceMode === 'clone' && lastVoiceError()) setError(lastVoiceError() + ' The phone voice was used instead.');
  };

  return (
    <Card>
      <Label>Voice</Label>
      <Choice
        value={s.voiceMode}
        onChange={(v) => {
          if (v === 'clone' && !s.activeVoiceId) {
            setError('Create a cloned voice below first.');
            return;
          }
          updateSettings({ voiceMode: v });
        }}
        options={[{ value: 'system', label: 'Phone voice (fastest)' }, { value: 'clone', label: 'My cloned voice' }]}
      />
      <Text style={{ color: p.sub, fontSize: 12, marginTop: 8 }}>
        The cloned voice is made online by Fish Audio, so each phrase takes a moment longer than the phone voice. If it fails, the phone voice is used automatically.
      </Text>

      <View style={{ height: 14 }} />
      <Label>Fish Audio API key {hasKey ? '· saved' : '· not set'}</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder={hasKey ? 'Paste a new key to replace' : 'Paste your API key'}
          placeholderTextColor={p.sub}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { flex: 1, color: p.text, borderColor: p.line, backgroundColor: p.bg }]}
        />
        <Btn small label="Save" onPress={saveKey} disabled={!key.trim()} />
      </View>
      <Text style={{ color: p.accent, fontSize: 13, marginTop: 6 }} onPress={() => Linking.openURL('https://fish.audio/app/api-keys')}>
        Get a free key at fish.audio →
      </Text>
      {hasKey ? <Btn small kind="ghost" label="Remove key" style={{ alignSelf: 'flex-start', marginTop: 8 }} onPress={async () => { await setFishKey(''); setHasKey(false); }} /> : null}

      <View style={{ height: 14 }} />
      <Label>Voice management · {s.voices.length}/3 slots</Label>
      {s.voices.map((v) => (
        <View key={v.id} style={styles.row}>
          <Text style={{ color: v.id === s.activeVoiceId ? p.accent : p.text, flex: 1, fontWeight: '600' }}>
            {v.title}{v.id === s.activeVoiceId ? ' · in use' : ''}
          </Text>
          {v.id !== s.activeVoiceId ? <Btn small kind="ghost" label="Use" onPress={() => updateSettings({ activeVoiceId: v.id })} /> : null}
          <Btn small kind="ghost" label="Delete" onPress={() => remove(v.id)} />
        </View>
      ))}
      {s.voices.length < 3 ? (
        <>
          <Text style={{ color: p.sub, fontSize: 13, marginVertical: 8, lineHeight: 19 }}>Tap record and read this aloud:{'\n'}"{SAMPLE_TEXT}"</Text>
          <Btn kind={recording ? 'warm' : 'ghost'} label={recording ? 'Stop recording' : sampleUri ? 'Record again' : 'Record sample'} onPress={toggleRecord} disabled={busy} />
          {sampleUri ? (
            <>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder="Name this voice"
                placeholderTextColor={p.sub}
                style={[styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.bg, marginTop: 8 }]}
              />
              <Btn style={{ marginTop: 8 }} label={busy ? 'Creating voice…' : 'Create cloned voice'} onPress={create} disabled={busy || !hasKey} />
              {!hasKey ? <Text style={{ color: p.warm, fontSize: 12, marginTop: 4 }}>Save your Fish Audio key first.</Text> : null}
            </>
          ) : null}
        </>
      ) : (
        <Text style={{ color: p.sub, fontSize: 12 }}>All three slots are used. Delete one to record a new voice.</Text>
      )}
      <ErrorText>{error}</ErrorText>
      <Btn small kind="ghost" label="Test current voice" style={{ alignSelf: 'flex-start', marginTop: 8 }} onPress={test} />
    </Card>
  );
}


function OfflineCard() {
  const p = usePalette();
  const s = useSettings();
  const [showAllOffline, setShowAllOffline] = useState(false);
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const available = offlineAvailable();

  const supported = offlineLanguageCodes();
  // the two languages in use come first, then the rest alphabetically
  const ordered = [
    ...[s.myLang, s.targetLang].filter((c, i, a) => offlineSupported(c) && a.indexOf(c) === i),
    ...supported.filter((c) => c !== s.myLang && c !== s.targetLang).sort((a, b) => langName(a).localeCompare(langName(b))),
  ];

  const get = async (code: string) => {
    setBusy(code);
    setError(null);
    try {
      await downloadOfflineModel(code);
      if (!s.offlineLanguages.includes(code)) {
        // English is the pivot, so it is always present once any model is fetched
        const next = [...s.offlineLanguages, code];
        if (!next.includes('en')) next.push('en');
        updateSettings({ offlineLanguages: next });
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Download failed. Check your connection.');
    } finally {
      setBusy(null);
    }
  };

  const forget = (code: string) =>
    updateSettings({ offlineLanguages: s.offlineLanguages.filter((c) => c !== code) });

  return (
    <Card>
      <Label>Offline translation</Label>
      <Choice
        value={s.translationMode}
        onChange={(v) => updateSettings({ translationMode: v })}
        options={[
          { value: 'online', label: 'Online only' },
          { value: 'offlineFirst', label: 'Offline first' },
          { value: 'offlineOnly', label: 'Offline only' },
        ]}
      />
      <Text style={{ color: p.sub, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
        Downloaded languages translate on the phone with no internet, which is also faster. "Offline first" uses them when it can and goes online otherwise. Auto-detect always needs the internet.
      </Text>
      {!available ? (
        <Text style={{ color: p.warm, fontSize: 12, marginTop: 8 }}>
          Offline models are not part of this preview build. They work in the installed app.
        </Text>
      ) : null}

      <View style={{ height: 12 }} />
      <Label>Languages on this phone · {s.offlineLanguages.length}</Label>
      <Text style={{ color: p.sub, fontSize: 12, marginBottom: 6 }}>
        About 30 MB each. Download over Wi-Fi.
      </Text>
      {ordered.slice(0, showAllOffline ? ordered.length : 6).map((code) => {
        const have = s.offlineLanguages.includes(code);
        return (
          <View key={code} style={styles.row}>
            <Text style={{ color: have ? p.accent : p.text, flex: 1, fontWeight: have ? '700' : '400' }}>
              {langName(code)}{have ? ' · ready' : ''}
            </Text>
            {busy === code ? (
              <Text style={{ color: p.sub, fontSize: 13 }}>downloading…</Text>
            ) : have ? (
              <Btn small kind="ghost" label="Remove" onPress={() => forget(code)} />
            ) : (
              <Btn small kind="ghost" label="Download" onPress={() => get(code)} disabled={!available || !!busy} />
            )}
          </View>
        );
      })}
      <Btn
        small
        kind="ghost"
        style={{ alignSelf: 'flex-start', marginTop: 6 }}
        label={showAllOffline ? 'Show fewer' : `Show all ${ordered.length} languages`}
        onPress={() => setShowAllOffline(!showAllOffline)}
      />
      <ErrorText>{error}</ErrorText>
      <Text style={{ color: p.sub, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
        Yoruba, Igbo, Hausa, Amharic, Zulu, Somali and some other languages have no on-device model, so they always need the internet.
      </Text>
    </Card>
  );
}

export default function SettingsScreen() {
  const p = usePalette();
  const s = useSettings();
  const [broker, setBroker] = useState(s.brokerUrl);
  const rate = (d: number) => updateSettings({ speechRate: Math.min(1.5, Math.max(0.6, Math.round((s.speechRate + d) * 10) / 10)) });
  const size = (d: number) => updateSettings({ captionSize: Math.min(40, Math.max(16, s.captionSize + d)) });

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <Card>
        <Label>Profile</Label>
        <TextInput
          value={s.displayName}
          onChangeText={(t) => updateSettings({ displayName: t.slice(0, 30) })}
          placeholder="Your name in chats"
          placeholderTextColor={p.sub}
          style={[styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.bg }]}
        />
      </Card>

      <Card>
        <Label>AI translate</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <LangButton caption="My language" code={s.myLang} onChange={(c) => updateSettings({ myLang: c })} />
          <LangButton caption="Translate to" code={s.targetLang} onChange={(c) => updateSettings({ targetLang: c })} />
        </View>
        <ToggleRow title="Translate all incoming messages" hint="Chats arrive in your language automatically" value={s.autoTranslateChats} onChange={(v) => updateSettings({ autoTranslateChats: v })} />
        <ToggleRow title="Show original text" hint="Keep the untranslated text under each translation" value={s.showOriginal} onChange={(v) => updateSettings({ showOriginal: v })} />
        <View style={{ height: 8 }} />
        <Label>Translation engine</Label>
        <Choice
          value={s.provider}
          onChange={(v) => { clearTranslateCache(); updateSettings({ provider: v }); }}
          options={[{ value: 'google', label: 'Google (default)' }, { value: 'mymemory', label: 'MyMemory' }]}
        />
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6 }}>Both are free with no account. If one fails, the other is tried automatically.</Text>
      </Card>

      <OfflineCard />

      <Card>
        <Label>Speech</Label>
        <ToggleRow title="Speak translations aloud" hint="Face to Face mode" value={s.autoSpeak} onChange={(v) => updateSettings({ autoSpeak: v })} />
        <ToggleRow title="Pause mic while the app speaks" hint="Prevents the app hearing itself. Turn off only with headphones." value={s.pauseMicWhileSpeaking} onChange={(v) => updateSettings({ pauseMicWhileSpeaking: v })} />
        <ToggleRow title="On-device speech recognition" hint="Faster and works offline on Android 13+, for languages downloaded on the phone" value={s.onDeviceRecognition} onChange={(v) => updateSettings({ onDeviceRecognition: v })} />
        <Stepper title="Speaking speed" value={s.speechRate.toFixed(1) + '×'} onMinus={() => rate(-0.1)} onPlus={() => rate(0.1)} />
      </Card>

      <VoiceClone />

      <Card>
        <Label>Display</Label>
        <Choice value={s.theme} onChange={(v) => updateSettings({ theme: v })} options={[{ value: 'dark', label: 'Dark' }, { value: 'light', label: 'Light' }, { value: 'system', label: 'Match phone' }]} />
        <Stepper title="Caption text size" value={String(s.captionSize)} onMinus={() => size(-2)} onPlus={() => size(2)} />
      </Card>

      <Card>
        <Label>Chat relay (advanced)</Label>
        <TextInput
          value={broker}
          onChangeText={setBroker}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.bg, fontSize: 13 }]}
        />
        <Text style={{ color: p.sub, fontSize: 12, marginVertical: 6 }}>
          A free public relay passes encrypted messages between phones. Both people must use the same address. Leave the default unless chats stop connecting.
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn small label="Save" disabled={broker.trim() === s.brokerUrl || !/^wss?:\/\/.+/.test(broker.trim())} onPress={() => updateSettings({ brokerUrl: broker.trim() })} />
          <Btn small kind="ghost" label="Use default" onPress={() => { setBroker(DEFAULT_BROKER); updateSettings({ brokerUrl: DEFAULT_BROKER }); }} />
        </View>
      </Card>

      <Card>
        <Label>Data</Label>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Btn small kind="ghost" label="Clear translation history" onPress={clearHistory} />
          <Btn
            small
            kind="danger"
            label="Reset app"
            onPress={() =>
              Alert.alert('Reset Translate+', 'This deletes all chats, history and settings on this phone.', [
                { text: 'Cancel', style: 'cancel' },
                { text: 'Reset', style: 'destructive', onPress: async () => { await setFishKey('').catch(() => {}); resetAll(); } },
              ])
            }
          />
        </View>
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 10 }}>Translate+ 1.0 · chats, history and settings are stored only on this phone.</Text>
      </Card>
    </ScrollView>
  );
}
