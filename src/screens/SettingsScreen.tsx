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
import LanguageCheck from '../components/LanguageCheck';
import { interfaceCode, isBuiltIn, phoneLocale, forgetMachineTranslation, uiLang } from '../i18n';
import { t, tk } from '../i18n/t';

const SAMPLE_TEXT = tk(
  'Hello, this is my voice. I am recording a short sample so that my translations can sound like me. I speak clearly, at my normal speed, in a quiet room, and I keep going for about fifteen seconds.'
);

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
      setError(e instanceof Error ? e.message : t('Could not save the key.'));
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
          setError(t('Too short. Record at least 10 seconds for a good clone.'));
          setSampleUri(null);
          return;
        }
        setSampleUri(recorder.uri);
        return;
      }
      const perm = await requestRecordingPermissionsAsync();
      if (!perm.granted) {
        setError(t('Microphone permission is needed to record a sample.'));
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
      setError(e instanceof Error ? e.message : t('Recording failed'));
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
      setError(e instanceof Error ? e.message : t('Could not create the voice'));
    } finally {
      setBusy(false);
    }
  };

  const remove = (id: string) => {
    Alert.alert(t('Delete voice'), t('Remove this cloned voice from Translate+ and from your Fish Audio account?'), [
      { text: t('Cancel'), style: 'cancel' },
      {
        text: t('Delete'),
        style: 'destructive',
        onPress: async () => {
          try {
            await deleteVoice(id);
          } catch (e) {
            setError((e instanceof Error ? e.message : t('Delete failed')) + t(' — removed from this phone only.'));
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
    if (s.voiceMode === 'clone' && lastVoiceError()) setError(lastVoiceError() + t(' The phone voice was used instead.'));
  };

  return (
    <Card>
      <Label>{t('Voice')}</Label>
      <Choice
        value={s.voiceMode}
        onChange={(v) => {
          if (v === 'clone' && !s.activeVoiceId) {
            setError(t('Create a cloned voice below first.'));
            return;
          }
          updateSettings({ voiceMode: v, voicePicked: true });
        }}
        options={[{ value: 'natural', label: t('Native speaker') }, { value: 'system', label: t('Phone voice') }, { value: 'clone', label: t('My cloned voice') }]}
      />
      <Text style={{ color: p.sub, fontSize: 12, marginTop: 8 }}>
        {t('Native speaker uses Google\'s online voice, so every language sounds like someone from there, whatever voices this phone has. The cloned voice is made online by Fish Audio and keeps your own accent. Both take a moment longer than the phone voice, and without internet the phone voice is used automatically.')}
      </Text>

      <View style={{ height: 14 }} />
      <Label>{t('Fish Audio API key')}{' '}{hasKey ? t('· saved') : t('· not set')}</Label>
      <View style={{ flexDirection: 'row', gap: 8 }}>
        <TextInput
          value={key}
          onChangeText={setKey}
          placeholder={hasKey ? t('Paste a new key to replace') : t('Paste your API key')}
          placeholderTextColor={p.sub}
          secureTextEntry
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { flex: 1, color: p.text, borderColor: p.line, backgroundColor: p.bg }]}
        />
        <Btn small label={t('Save')} onPress={saveKey} disabled={!key.trim()} />
      </View>
      <Text style={{ color: p.accent, fontSize: 13, marginTop: 6 }} onPress={() => Linking.openURL('https://fish.audio/app/api-keys')}>
        {t('Get a free key at fish.audio →')}
      </Text>
      {!secretsAreProtected ? (
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
          {t('In the browser the key is kept in this browser\'s own storage, which is less protected than the phone app\'s keystore. Clearing site data removes it.')}
        </Text>
      ) : null}
      {hasKey ? <Btn small kind="ghost" label={t('Remove key')} style={{ alignSelf: 'flex-start', marginTop: 8 }} onPress={async () => { await setFishKey(''); setHasKey(false); }} /> : null}

      <View style={{ height: 14 }} />
      <Label>{t('Voice management · {length}/3 slots', { length: s.voices.length })}</Label>
      {s.voices.map((v) => (
        <View key={v.id} style={styles.row}>
          <Text style={{ color: v.id === s.activeVoiceId ? p.accent : p.text, flex: 1, fontWeight: '600' }}>
            {v.title}{v.id === s.activeVoiceId ? t(' · in use') : ''}
          </Text>
          {v.id !== s.activeVoiceId ? <Btn small kind="ghost" label={t('Use')} onPress={() => updateSettings({ activeVoiceId: v.id })} /> : null}
          <Btn small kind="ghost" label={t('Delete')} onPress={() => remove(v.id)} />
        </View>
      ))}
      {s.voices.length < 3 ? (
        <>
          <Text style={{ color: p.sub, fontSize: 13, marginVertical: 8, lineHeight: 19 }}>{t('Tap record and read this aloud:\n"{sample}"', { sample: t(SAMPLE_TEXT) })}</Text>
          <Btn kind={recording ? 'warm' : 'ghost'} label={recording ? t('Stop recording') : sampleUri ? t('Record again') : t('Record sample')} onPress={toggleRecord} disabled={busy} />
          {sampleUri ? (
            <>
              <TextInput
                value={title}
                onChangeText={setTitle}
                placeholder={t('Name this voice')}
                placeholderTextColor={p.sub}
                style={[styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.bg, marginTop: 8 }]}
              />
              <Btn style={{ marginTop: 8 }} label={busy ? t('Creating voice…') : t('Create cloned voice')} onPress={create} disabled={busy || !hasKey} />
              {!hasKey ? <Text style={{ color: p.warm, fontSize: 12, marginTop: 4 }}>{t('Save your Fish Audio key first.')}</Text> : null}
            </>
          ) : null}
        </>
      ) : (
        <Text style={{ color: p.sub, fontSize: 12 }}>{t('All three slots are used. Delete one to record a new voice.')}</Text>
      )}
      <ErrorText>{error}</ErrorText>
      <Btn small kind="ghost" label={t('Test current voice')} style={{ alignSelf: 'flex-start', marginTop: 8 }} onPress={test} />
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
      setError(e instanceof Error ? e.message : t('Download failed. Check your connection.'));
    } finally {
      setBusy(null);
    }
  };

  const forget = (code: string) =>
    updateSettings({ offlineLanguages: s.offlineLanguages.filter((c) => c !== code) });

  return (
    <Card>
      <Label>{t('Offline translation')}</Label>
      <Choice
        value={s.translationMode}
        onChange={(v) => updateSettings({ translationMode: v })}
        options={[
          { value: 'online', label: t('Online only') },
          { value: 'offlineFirst', label: t('Offline first') },
          { value: 'offlineOnly', label: t('Offline only') },
        ]}
      />
      <Text style={{ color: p.sub, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
        {t('Downloaded languages translate on the phone with no internet, which is also faster. "Offline first" uses them when it can and goes online otherwise. Auto-detect always needs the internet.')}
      </Text>
      {!available ? (
        <Text style={{ color: p.warm, fontSize: 12, marginTop: 8 }}>
          {t('Offline models are not part of this preview build. They work in the installed app.')}
        </Text>
      ) : null}

      <View style={{ height: 12 }} />
      <Label>{t('Languages on this phone · {length}', { length: s.offlineLanguages.length })}</Label>
      <Text style={{ color: p.sub, fontSize: 12, marginBottom: 6 }}>
        {t('About 30 MB each. Download over Wi-Fi.')}
      </Text>
      {ordered.slice(0, showAllOffline ? ordered.length : 6).map((code) => {
        const have = s.offlineLanguages.includes(code);
        return (
          <View key={code} style={styles.row}>
            <Text style={{ color: have ? p.accent : p.text, flex: 1, fontWeight: have ? '700' : '400' }}>
              {langName(code)}{have ? t(' · ready') : ''}
            </Text>
            {busy === code ? (
              <Text style={{ color: p.sub, fontSize: 13 }}>{t('downloading…')}</Text>
            ) : have ? (
              <Btn small kind="ghost" label={t('Remove')} onPress={() => forget(code)} />
            ) : (
              <Btn small kind="ghost" label={t('Download')} onPress={() => get(code)} disabled={!available || !!busy} />
            )}
          </View>
        );
      })}
      <Btn
        small
        kind="ghost"
        style={{ alignSelf: 'flex-start', marginTop: 6 }}
        label={showAllOffline ? t('Show fewer') : t('Show all {length} languages', { length: ordered.length })}
        onPress={() => setShowAllOffline(!showAllOffline)}
      />
      <ErrorText>{error}</ErrorText>
      <Text style={{ color: p.sub, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
        {t('Yoruba, Igbo, Hausa, Amharic, Zulu, Somali and some other languages have no on-device model, so they always need the internet.')}
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
      <Label>{t('Install on this device')}</Label>
      {state === 'prompt' ? (
        <>
          <Text style={{ color: p.sub, fontSize: 13, marginBottom: 10, lineHeight: 19 }}>
            {t('Add Translate+ to your home screen. It opens full screen, like any other app, and keeps working without a connection for everything that does not need one.')}
          </Text>
          <Btn label={t('Install Translate+')} onPress={runInstall} style={{ alignSelf: 'flex-start' }} />
        </>
      ) : (
        <Text style={{ color: p.sub, fontSize: 13, lineHeight: 19 }}>{t(IOS_STEPS)}</Text>
      )}
    </Card>
  );
}

function AppLanguageCard() {
  const p = usePalette();
  const s = useSettings();
  const current = uiLang();
  const phone = interfaceCode(phoneLocale());
  return (
    <Card>
      <Label>{t('App language')}</Label>
      <View style={{ flexDirection: 'row' }}>
        <LangButton
          code={s.uiLang}
          allowAuto
          autoLabel={t('Same as phone ({lang})', { lang: langName(phone) })}
          onChange={(c) => updateSettings({ uiLang: c })}
        />
      </View>
      <Text style={{ color: p.sub, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
        {isBuiltIn(current)
          ? t('Buttons, menus and messages are shown in this language. Your translation languages are set separately below.')
          : t('{lang} is machine-translated the first time it is chosen, then kept on this phone, so some wording may be clumsy.', { lang: langName(current) })}
      </Text>
      {!isBuiltIn(current) ? (
        <Btn
          small
          kind="ghost"
          label={t('Translate the app again')}
          style={{ alignSelf: 'flex-start', marginTop: 8 }}
          onPress={async () => {
            await forgetMachineTranslation(current);
            // switching away and back makes it run again
            const was = s.uiLang;
            updateSettings({ uiLang: 'en' });
            setTimeout(() => updateSettings({ uiLang: was }), 50);
          }}
        />
      ) : null}
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
      <LanguageCheck />
      <AppLanguageCard />
      <Card>
        <Label>{t('Profile')}</Label>
        <TextInput
          value={s.displayName}
          onChangeText={(v) => updateSettings({ displayName: v.slice(0, 30) })}
          placeholder={t('Your name in chats')}
          placeholderTextColor={p.sub}
          style={[styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.bg }]}
        />
      </Card>

      <Card>
        <Label>{t('AI translate')}</Label>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <LangButton caption={t('My language')} code={s.myLang} onChange={(c) => updateSettings({ myLang: c })} />
          <LangButton caption={t('Translate to')} code={s.targetLang} onChange={(c) => updateSettings({ targetLang: c })} />
        </View>
        <ToggleRow title={t('Translate all incoming messages')} hint={t('Chats arrive in your language automatically')} value={s.autoTranslateChats} onChange={(v) => updateSettings({ autoTranslateChats: v })} />
        <ToggleRow title={t('Show original text')} hint={t('Keep the untranslated text under each translation')} value={s.showOriginal} onChange={(v) => updateSettings({ showOriginal: v })} />
        <View style={{ height: 8 }} />
        <Label>{t('Translation engine')}</Label>
        <Choice
          value={s.provider}
          onChange={(v) => { clearTranslateCache(); updateSettings({ provider: v }); }}
          options={[{ value: 'google', label: t('Google (default)') }, { value: 'mymemory', label: t('MyMemory') }]}
        />
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6 }}>{t('Both are free with no account. If one fails, the other is tried automatically.')}</Text>

        <View style={{ height: 14 }} />
        <Label>{t('How to address people')}</Label>
        <Choice
          value={s.register}
          onChange={(v) => updateSettings({ register: v })}
          options={[
            { value: 'auto', label: t('Auto') },
            { value: 'formal', label: t('Formal') },
            { value: 'informal', label: t('Informal') },
          ]}
        />
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
          {t('Italian "Lei" or "tu", German "Sie" or "du", and the same choice in French, Spanish and others. Free translation engines pick one at random, which is how you end up addressing an official like a friend. Translate+ steers the wording, then tells you which one actually came out. It is a nudge, not a guarantee — check the label on the translation when it matters.')}
        </Text>
      </Card>

      <OfflineCard />

      <Card>
        <Label>{t('Speech')}</Label>
        <ToggleRow title={t('Speak translations aloud')} hint={t('Face to Face mode')} value={s.autoSpeak} onChange={(v) => updateSettings({ autoSpeak: v })} />
        <ToggleRow title={t('Pause mic while the app speaks')} hint={t('Prevents the app hearing itself. Turn off only with headphones.')} value={s.pauseMicWhileSpeaking} onChange={(v) => updateSettings({ pauseMicWhileSpeaking: v })} />
        <ToggleRow title={t('On-device speech recognition')} hint={t('Faster and works offline on Android 13+, for languages downloaded on the phone. Online recognition is usually more accurate.')} value={s.onDeviceRecognition} onChange={(v) => updateSettings({ onDeviceRecognition: v })} />
        <ToggleRow title={t('Boost quiet voices')} hint={t('Raises soft or distant speech up to 8× before it is recognised (Android 13+)')} value={s.micBoost} onChange={(v) => updateSettings({ micBoost: v })} />
        <ToggleRow title={t('Noise reduction')} hint={t('The phone\'s noise suppression and echo cancelling, for busy or crowded places (Android 13+). Turn off if words get clipped in a quiet room.')} value={s.noiseReduction} onChange={(v) => updateSettings({ noiseReduction: v })} />
        <ToggleRow title={t('Calls: send at every pause')} hint={t('What you say goes as soon as you pause, instead of after the whole sentence. Much quicker replies; long sentences arrive in pieces.')} value={s.quickSend} onChange={(v) => updateSettings({ quickSend: v })} />
        <ToggleRow title={t('Calls: fastest voice')} hint={t('In calls, use the phone\'s own voice when it has one for the language: it starts at once, where the native-speaker voice is fetched first.')} value={s.fastCallVoice} onChange={(v) => updateSettings({ fastCallVoice: v })} />
        <View style={{ height: 8 }} />
        <Label>{t('Pause before translating')}</Label>
        <Choice
          value={s.sentencePause <= 900 ? 'quick' : s.sentencePause >= 2200 ? 'patient' : 'normal'}
          onChange={(v) => updateSettings({ sentencePause: v === 'quick' ? 800 : v === 'patient' ? 2500 : 1500 })}
          options={[
            { value: 'quick', label: t('Quick') },
            { value: 'normal', label: t('Normal') },
            { value: 'patient', label: t('Patient') },
          ]}
        />
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6, lineHeight: 18 }}>
          {t('How long a silence counts as the end of a sentence. Quick translates sooner but can cut you off mid-sentence; Patient waits through your pauses.')}
        </Text>

        <Stepper title={t('Speaking speed')} value={s.speechRate.toFixed(1) + '×'} onMinus={() => rate(-0.1)} onPlus={() => rate(0.1)} />
      </Card>

      <AccentCard />

      <VoiceClone />

      <Card>
        <Label>{t('Appearance')}</Label>
        <ToggleRow
          title={t('Match the phone\'s light and dark setting')}
          hint={t('Switches to the matching theme when your phone changes')}
          value={s.followSystem}
          onChange={(v) => updateSettings({ followSystem: v })}
        />
        <View style={{ gap: 10, marginTop: 6 }}>
          {THEMES.map((th) => {
            const on = th.id === s.theme;
            return (
              <Pressable
                key={th.id}
                accessibilityRole="radio"
                accessibilityState={{ selected: on, checked: on }}
                accessibilityLabel={t('{name} theme', { name: t(th.name) }) + '. ' + t(th.mood)}
                onPress={() => updateSettings({ theme: th.id })}
                style={({ pressed }) => [
                  {
                    borderRadius: th.radius,
                    borderWidth: on ? 3 : th.border,
                    borderColor: on ? p.accent : th.line,
                    overflow: 'hidden',
                    opacity: pressed ? 0.85 : 1,
                    backgroundColor: th.bg,
                  },
                  {
                    backgroundImage: [
                      th.glowA !== 'transparent' ? `radial-gradient(circle at 10% 0%, ${th.glowA} 0%, transparent 60%)` : null,
                      th.glowB !== 'transparent' ? `radial-gradient(circle at 100% 100%, ${th.glowB} 0%, transparent 60%)` : null,
                      `linear-gradient(160deg, ${th.bg2} 0%, ${th.bg} 100%)`,
                    ].filter(Boolean).join(', '),
                  } as object,
                ]}
              >
                <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 12 }}>
                  {/* a miniature card: surface, text lines and the accent button */}
                  <View style={{ width: 64, padding: 7, gap: 4, borderRadius: Math.max(8, th.radius / 2), backgroundColor: th.card, borderWidth: th.border, borderColor: th.line }}>
                    <View style={{ height: 5, width: '80%', borderRadius: 3, backgroundColor: th.text }} />
                    <View style={{ height: 4, width: '55%', borderRadius: 2, backgroundColor: th.sub }} />
                    <View style={{ height: 12, width: 30, borderRadius: 6, backgroundColor: th.accent, marginTop: 2 }} />
                  </View>
                  <View style={{ flex: 1 }}>
                    <Text style={{ color: th.text, fontWeight: '800', fontSize: 16 }}>{t(th.name)}</Text>
                    <Text style={{ color: th.sub, fontSize: 13, marginTop: 2 }}>{t(th.mood)}</Text>
                    <View style={{ flexDirection: 'row', gap: 5, marginTop: 6 }}>
                      {[th.accent, th.accent2, th.text].map((c, i) => (
                        <View key={i} style={{ width: 14, height: 14, borderRadius: 7, backgroundColor: c, borderWidth: 1, borderColor: th.line }} />
                      ))}
                    </View>
                  </View>
                  {on ? (
                    <View style={{ paddingHorizontal: 10, paddingVertical: 5, borderRadius: 999, backgroundColor: th.accent }}>
                      <Text style={{ color: th.accentText, fontSize: 12, fontWeight: '800' }}>✓ {t('In use')}</Text>
                    </View>
                  ) : null}
                </View>
              </Pressable>
            );
          })}
        </View>
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 8, lineHeight: 18 }}>
          {t('Clear Contrast has solid surfaces and the strongest text, which helps in bright sunlight or with low vision.')}
        </Text>

        <View style={{ height: 10 }} />
        <Label>{t('Translate tab layout')}</Label>
        <Choice
          value={s.paneLayout}
          onChange={(v) => updateSettings({ paneLayout: v })}
          options={[
            { value: 'stacked', label: t('Stacked') },
            { value: 'side', label: t('Side by side') },
          ]}
        />
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6 }}>
          {t('Side by side needs a wide screen, so on a narrow phone it stays stacked until you turn it sideways.')}
        </Text>
        <View style={{ height: 10 }} />
        <Stepper title={t('Caption text size')} value={String(s.captionSize)} onMinus={() => size(-2)} onPlus={() => size(2)} />
      </Card>

      <InstallCard />

      <Card>
        <Label>{t('Call links')}</Label>
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
          {t('Where your copy of the web app is published. Invite then shares a link the other person opens in their browser — no app to install. Leave it empty to use the published copy at {address}; the web version uses its own address.', { address: 'victor-bamidele-balogun.github.io/translate-plus' })}
        </Text>
        {s.linkBase || defaultLinkBase() ? (
          <Text selectable style={{ color: p.sub, fontSize: 11, marginBottom: 6 }} numberOfLines={2}>
            {t('Links look like:')}{' '}
            {buildInviteLink(s.linkBase || defaultLinkBase(), 'ABCD-EFGH-IJKL-MNOP', s.displayName || 'A friend', s.targetLang)}
          </Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn
            small
            label={t('Save')}
            disabled={link.trim() === s.linkBase || (!!link.trim() && !/^https?:\/\/.+/.test(link.trim()))}
            onPress={() => updateSettings({ linkBase: link.trim() })}
          />
          <Btn small kind="ghost" label={t('Clear')} onPress={() => { setLink(''); updateSettings({ linkBase: '' }); }} />
        </View>
      </Card>

      <Card>
        <Label>{t('Chat relay (advanced)')}</Label>
        <TextInput
          value={broker}
          onChangeText={setBroker}
          autoCapitalize="none"
          autoCorrect={false}
          style={[styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.bg, fontSize: 13 }]}
        />
        <Text style={{ color: p.sub, fontSize: 12, marginVertical: 6 }}>
          {t('A free public relay passes encrypted messages between phones. Both people must use the same address. Leave the default unless chats stop connecting.')}
        </Text>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn small label={t('Save')} disabled={broker.trim() === s.brokerUrl || !/^wss?:\/\/.+/.test(broker.trim())} onPress={() => updateSettings({ brokerUrl: broker.trim() })} />
          <Btn small kind="ghost" label={t('Use default')} onPress={() => { setBroker(DEFAULT_BROKER); updateSettings({ brokerUrl: DEFAULT_BROKER }); }} />
        </View>
      </Card>

      <Card>
        <Label>{t('Data')}</Label>
        <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
          <Btn small kind="ghost" label={t('Clear translation history')} onPress={clearHistory} />
          <Btn
            small
            kind="danger"
            label={t('Reset app')}
            onPress={() =>
              Alert.alert(t('Reset Translate+'), t('This deletes all chats, history and settings on this phone.'), [
                { text: t('Cancel'), style: 'cancel' },
                { text: t('Reset'), style: 'destructive', onPress: async () => { await setFishKey('').catch(() => {}); resetAll(); } },
              ])
            }
          />
        </View>
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 10 }}>{t('Translate+ 1.0 · chats, history and settings are stored only on this phone.')}</Text>
      </Card>
    </ScrollView>
  );
}
