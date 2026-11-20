import React, { useEffect, useState } from 'react';
import { Alert, Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { RecordingPresets, requestRecordingPermissionsAsync, setAudioModeAsync, useAudioRecorder } from 'expo-audio';
import { Btn, Card, Choice, ErrorText, Label, LangButton, Stepper, ToggleRow, styles } from '../components/ui';
import { THEMES, usePalette } from '../theme';
import { DEFAULT_BROKER, clearHistory, resetAll, updateSettings, useSettings } from '../store';
import { createVoice, deleteVoice, getFishKey, setFishKey } from '../services/fish';
import { secretsAreProtected } from '../services/keystore';
import { lastVoiceError, speak, stopSpeaking } from '../services/tts';
import { clearTranslateCache } from '../services/translate';
import { downloadOfflineModel, offlineAvailable, offlineLanguageCodes, offlineSupported } from '../services/offline';
import { langName } from '../languages';
import { buildInviteLink, defaultLinkBase } from '../invite';
import { IOS_STEPS, runInstall, useInstallState } from '../components/InstallPrompt';
import AccentCard from '../components/AccentCard';

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
    try {
      await setFishKey(key);
      setHasKey(!!key.trim());
      setKey('');
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save the key.');
    }
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
          updateSettings({ voices, activeVoiceId: active, voiceMode: active ? s.voiceMode : 'natural' });
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
          updateSettings({ voiceMode: v, voicePicked: true });
        }}
        options={[{ value: 'natural', label: 'Native speaker' }, { value: 'system', label: 'Phone voice' }, { value: 'clone', label: 'My cloned voice' }]}
      />
      <Text style={{ color: p.sub, fontSize: 12, marginTop: 8 }}>
        Native speaker uses Google's online voice, so every language sounds like someone from there, whatever voices this phone has. The cloned voice is made online by Fish Audio and keeps your own accent. Both take a moment longer than the phone voice, and without internet the phone voice is used automatically.
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
      {!secretsAreProtected ? (
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
          In the browser the key is kept in this browser's own storage, which is less protected than the phone app's keystore. Clearing site data removes it.
        </Text>
      ) : null}
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


function InstallCard() {
  const p = usePalette();
  const state = useInstallState();
  if (state === 'none') return null;
  return (
    <Card>
      <Label>Install on this device</Label>
      {state === 'prompt' ? (
        <>
          <Text style={{ color: p.sub, fontSize: 13, marginBottom: 10, lineHeight: 19 }}>
            Add Translate+ to your home screen. It opens full screen, like any other app, and keeps working without a connection for everything that does not need one.
          </Text>
          <Btn label="Install Translate+" onPress={runInstall} style={{ alignSelf: 'flex-start' }} />
        </>
      ) : (
        <Text style={{ color: p.sub, fontSize: 13, lineHeight: 19 }}>{IOS_STEPS}</Text>
      )}
    </Card>
  );
}

export default function SettingsScreen() {
  const p = usePalette();
  const s = useSettings();
  const [broker, setBroker] = useState(s.brokerUrl);
  const [link, setLink] = useState(s.linkBase);
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

        <View style={{ height: 14 }} />
        <Label>How to address people</Label>
        <Choice
          value={s.register}
          onChange={(v) => updateSettings({ register: v })}
          options={[
            { value: 'auto', label: 'Auto' },
            { value: 'formal', label: 'Formal' },
            { value: 'informal', label: 'Informal' },
          ]}
        />
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
          Italian "Lei" or "tu", German "Sie" or "du", and the same choice in French, Spanish and others. Free translation engines pick one at random, which is how you end up addressing an official like a friend. Translate+ steers the wording, then tells you which one actually came out. It is a nudge, not a guarantee — check the label on the translation when it matters.
        </Text>
      </Card>

      <OfflineCard />

      <Card>
        <Label>Speech</Label>
        <ToggleRow title="Speak translations aloud" hint="Face to Face mode" value={s.autoSpeak} onChange={(v) => updateSettings({ autoSpeak: v })} />
        <ToggleRow title="Pause mic while the app speaks" hint="Prevents the app hearing itself. Turn off only with headphones." value={s.pauseMicWhileSpeaking} onChange={(v) => updateSettings({ pauseMicWhileSpeaking: v })} />
        <ToggleRow title="On-device speech recognition" hint="Faster and works offline on Android 13+, for languages downloaded on the phone" value={s.onDeviceRecognition} onChange={(v) => updateSettings({ onDeviceRecognition: v })} />
        <View style={{ height: 8 }} />
        <Label>Pause before translating</Label>
        <Choice
          value={s.sentencePause <= 900 ? 'quick' : s.sentencePause >= 2200 ? 'patient' : 'normal'}
          onChange={(v) => updateSettings({ sentencePause: v === 'quick' ? 800 : v === 'patient' ? 2500 : 1500 })}
          options={[
            { value: 'quick', label: 'Quick' },
            { value: 'normal', label: 'Normal' },
            { value: 'patient', label: 'Patient' },
          ]}
        />
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
          How long a silence counts as the end of a sentence. Quick translates sooner but can cut you off mid-sentence; Patient waits through your pauses.
        </Text>

        <Stepper title="Speaking speed" value={s.speechRate.toFixed(1) + '×'} onMinus={() => rate(-0.1)} onPlus={() => rate(0.1)} />
      </Card>

      <AccentCard />

      <VoiceClone />

      <Card>
        <Label>Appearance</Label>
        <ToggleRow
          title="Match the phone's light and dark setting"
          hint="Switches to the matching theme when your phone changes"
          value={s.followSystem}
          onChange={(v) => updateSettings({ followSystem: v })}
        />
        <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 6 }}>
          {THEMES.map((t) => {
            const on = t.id === s.theme;
            return (
              <Pressable
                key={t.id}
                accessibilityRole="button"
                accessibilityState={{ selected: on }}
                accessibilityLabel={`${t.name} theme`}
                onPress={() => updateSettings({ theme: t.id })}
                style={{
                  width: '48%',
                  backgroundColor: t.bg,
                  borderColor: on ? p.accent : t.line,
                  borderWidth: on ? 2 : 1,
                  borderRadius: 12,
                  paddingVertical: 12,
                  paddingHorizontal: 12,
                  flexDirection: 'row',
                  alignItems: 'center',
                  gap: 8,
                }}
              >
                <View style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: t.accent }} />
                <Text style={{ color: t.text, fontWeight: on ? '800' : '500', fontSize: 14, flex: 1 }}>{t.name}</Text>
                {on ? <Text style={{ color: p.accent, fontSize: 13, fontWeight: '800' }}>✓</Text> : null}
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
          Ink and Paper are the highest-contrast pair, which helps in bright sunlight.
        </Text>

        <View style={{ height: 10 }} />
        <Label>Translate tab layout</Label>
        <Choice
          value={s.paneLayout}
          onChange={(v) => updateSettings({ paneLayout: v })}
          options={[
            { value: 'stacked', label: 'Stacked' },
            { value: 'side', label: 'Side by side' },
          ]}
        />
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6 }}>
          Side by side needs a wide screen, so on a narrow phone it stays stacked until you turn it sideways.
        </Text>
        <View style={{ height: 10 }} />
        <Stepper title="Caption text size" value={String(s.captionSize)} onMinus={() => size(-2)} onPlus={() => size(2)} />
      </Card>

      <InstallCard />

      <Card>
        <Label>Call links</Label>
        <TextInput
          value={link}
          onChangeText={setLink}
          autoCapitalize="none"
          autoCorrect={false}
          placeholder="https://yourname.github.io/translate-plus"
          placeholderTextColor={p.sub}
          style={[styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.bg, fontSize: 13 }]}
        />
        <Text style={{ color: p.sub, fontSize: 12, marginVertical: 6, lineHeight: 18 }}>
          Where your copy of the web app is published. Invite then shares a link the other person opens in their browser — no app to install. The web version fills this in by itself; the installed Android app needs it typed once.
        </Text>
        {s.linkBase || defaultLinkBase() ? (
          <Text selectable style={{ color: p.sub, fontSize: 11, marginBottom: 6 }} numberOfLines={2}>
            Links look like:{' '}
            {buildInviteLink(s.linkBase || defaultLinkBase(), 'ABCD-EFGH-IJKL-MNOP', s.displayName || 'A friend', s.targetLang)}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn
            small
            label="Save"
            disabled={link.trim() === s.linkBase || (!!link.trim() && !/^https?:\/\/.+/.test(link.trim()))}
            onPress={() => updateSettings({ linkBase: link.trim() })}
          />
          <Btn small kind="ghost" label="Clear" onPress={() => { setLink(''); updateSettings({ linkBase: '' }); }} />
        </View>
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
