// Live Captions: rolling bilingual subtitles for whatever the phone hears —
// a meeting, a lecture, or a WhatsApp / other app call played on speaker.
// Phone-call mode: the user types instead of talking, so the other side of a normal
// call hears only the translated voice coming out of the loudspeaker.
// The conversation lives in the store, so it survives switching tabs, and each
// finished one is kept with its recap.
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, Modal, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { Btn, Card, ErrorText, Label, LangButton, styles } from '../components/ui';
import { usePalette } from '../theme';
import {
  deleteCaptionSession,
  finishCaptionSession,
  newId,
  updateCaptionLines,
  updateSettings,
  useStore,
} from '../store';
import { translate } from '../services/translator';
import { isSpeaking, onSpeakingChange, speak, stopSpeaking } from '../services/tts';
import { useListener } from '../services/listen';
import { langName } from '../languages';
import { detect } from '../services/detect';
import RecapSheet from '../components/RecapSheet';
import type { Entry } from '../services/recap';
import {
  BUILTIN_PHRASES,
  MAX_CUSTOM_PHRASES,
  addPhrase,
  chipLabel,
  cleanPhrase,
  sessionEntries,
  sessionTitle,
  warmJobs,
  type CaptionLine,
  type CaptionSession,
  type QuickPhrase,
} from '../services/phonecall';
import { phraseCache } from '../services/phrases';

// Captions were on when the user left the tab: switch them back on when they return.
let resumeListening = false;

type Warm = { done: number; total: number; failed: number } | null;

export default function CaptionsScreen() {
  useKeepAwake();
  const p = usePalette();
  const store = useStore();
  const s = store.settings;
  const lines = store.captionLive?.lines ?? [];
  const [partial, setPartial] = useState({ original: '', translated: '' });
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [recap, setRecap] = useState<{ title: string; entries: Entry[] } | null>(null);
  const [savedOpen, setSavedOpen] = useState(false);
  const [phrasesOpen, setPhrasesOpen] = useState(false);
  const [newPhrase, setNewPhrase] = useState('');
  const partialSeq = useRef(0);
  const partialTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const list = useRef<FlatList<CaptionLine>>(null);
  const callMode = s.phoneCallMode;
  const [speakingNow, setSpeakingNow] = useState(isSpeaking());
  const [busy, setBusy] = useState(false);
  const [warm, setWarm] = useState<Warm>(null);
  const lastSaid = useRef<{ text: string; lang: string } | null>(null);
  const input = useRef<React.ComponentRef<typeof TextInput>>(null);

  useEffect(() => onSpeakingChange(setSpeakingNow), []);

  const theirLang = s.targetLang;
  const meta = useRef({ theirLang, myLang: s.myLang, callMode });
  meta.current = { theirLang, myLang: s.myLang, callMode };
  // languages expected in this conversation; the one being listened for is theirLang
  const expected = s.listenLanguages.length ? s.listenLanguages : [s.targetLang];
  const [switched, setSwitched] = useState<string | null>(null);

  const setLines = (fn: (l: CaptionLine[]) => CaptionLine[]) => updateCaptionLines(fn, meta.current);
  const push = (line: Omit<CaptionLine, 'ts'>) => setLines((prev) => [...prev, { ...line, ts: Date.now() }]);

  const listenIn = (code: string) => {
    updateSettings({ targetLang: code });
    if (mic.listening) mic.start(code);
  };

  const mic = useListener({
    halfDuplex: callMode,
    onPartial: (text) => {
      setPartial((v) => ({ ...v, original: text }));
      // translate the in-progress sentence too, lightly throttled, so captions feel instant
      if (partialTimer.current) return;
      partialTimer.current = setTimeout(async () => {
        partialTimer.current = null;
        const id = ++partialSeq.current;
        try {
          const out = await translate(text, theirLang, s.myLang);
          if (id === partialSeq.current) setPartial((v) => (v.original ? { ...v, translated: out.text } : v));
        } catch {}
      }, 350);
    },
    onFinal: async (text) => {
      partialSeq.current++;
      // if what was heard reads clearly as another expected language, follow it
      if (expected.length > 1) {
        const guess = detect(text, expected);
        if (guess && guess !== theirLang) {
          setSwitched(guess);
          setTimeout(() => setSwitched(null), 4000);
          listenIn(guess);
        }
      }
      setPartial({ original: '', translated: '' });
      const id = newId();
      push({ id, original: text, translated: '…' });
      try {
        const out = await translate(text, theirLang, s.myLang);
        setLines((prev) => prev.map((l) => (l.id === id ? { ...l, translated: out.text } : l)));
        setError(null);
      } catch (e) {
        setLines((prev) => prev.map((l) => (l.id === id ? { ...l, translated: '(not translated)' } : l)));
        setError(e instanceof Error ? e.message : 'Translation failed');
      }
    },
  });

  // leaving the tab stops the microphone; coming back switches it on again
  const listeningNow = useRef(false);
  listeningNow.current = mic.listening;
  useEffect(() => {
    if (resumeListening) {
      resumeListening = false;
      mic.start(meta.current.theirLang);
    }
    return () => {
      resumeListening = listeningNow.current;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- quick phrases ----------

  const phrases: QuickPhrase[] = [...s.customPhrases, ...BUILTIN_PHRASES];
  const phraseKey = phrases.map((x) => x.id).join(',');

  // prepare every phrase as soon as call mode is on, so a tap speaks at once (and offline)
  useEffect(() => {
    if (!callMode) {
      setWarm(null);
      return;
    }
    let live = true;
    const jobs = warmJobs(phrases, theirLang, s.myLang);
    setWarm({ done: 0, total: jobs.length, failed: 0 });
    phraseCache
      .warm(jobs, (done, total, failed) => {
        if (live) setWarm({ done, total, failed });
      })
      .catch(() => {});
    return () => {
      live = false;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [callMode, theirLang, s.myLang, phraseKey]);

  const labelFor = (ph: QuickPhrase) => {
    if (!ph.builtin || !ph.label) return chipLabel(ph.text);
    return phraseCache.peek(ph.label, ph.lang, s.myLang) ?? ph.label;
  };

  const addCustomPhrase = () => {
    const text = cleanPhrase(newPhrase);
    if (!text) return;
    updateSettings({ customPhrases: addPhrase(s.customPhrases, { id: newId(), text, lang: s.myLang }) });
    setNewPhrase('');
  };

  // ---------- speaking ----------

  // played out loud so the other person (or the call, on speaker) hears it
  const sayOut = (text: string, lang: string) => {
    lastSaid.current = { text, lang };
    speak(text, lang);
  };

  const sendReply = async () => {
    const text = reply.trim();
    if (!text || busy) return;
    setReply('');
    setBusy(true);
    try {
      const out = await translate(text, s.myLang, theirLang);
      push({ id: newId(), original: text, translated: out.text, mine: true });
      sayOut(out.text, theirLang);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Translation failed');
      setReply(text);
    } finally {
      setBusy(false);
      if (callMode) input.current?.focus();
    }
  };

  const sayPhrase = async (ph: QuickPhrase) => {
    if (busy) return;
    setBusy(true);
    try {
      const [spoken, shown] = await Promise.all([
        phraseCache.get(ph.text, ph.lang, theirLang),
        phraseCache.get(ph.text, ph.lang, s.myLang),
      ]);
      push({ id: newId(), original: shown, translated: spoken, mine: true });
      sayOut(spoken, theirLang);
      setError(null);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Translation failed');
    } finally {
      setBusy(false);
    }
  };

  // ---------- sessions ----------

  const titleOf = (session: CaptionSession) => sessionTitle(session, langName, session.theirLang);
  const openRecap = (session: CaptionSession) => setRecap({ title: titleOf(session), entries: sessionEntries(session) });

  const toggleCallMode = () => {
    const on = !callMode;
    if (on) {
      // a call gets a clean session of its own, so its recap holds only the call
      const live = store.captionLive;
      if (live?.lines.length && !live.callMode) finishCaptionSession();
      updateSettings({ phoneCallMode: true });
      // the whole point is hearing the caller, so start listening straight away
      if (!mic.listening) mic.start(theirLang);
      return;
    }
    updateSettings({ phoneCallMode: false });
    stopSpeaking();
    mic.stop();
    setPartial({ original: '', translated: '' });
    // the call is over: keep it and show what was agreed
    const done = finishCaptionSession();
    if (done) openRecap(done);
  };

  const newSession = () => {
    finishCaptionSession();
    setPartial({ original: '', translated: '' });
    lastSaid.current = null;
  };

  const liveSession = store.captionLive;

  return (
    <View style={{ flex: 1, padding: 16 }}>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <LangButton caption="They speak" code={theirLang} onChange={(c) => { updateSettings({ targetLang: c }); if (mic.listening) mic.start(c); }} />
        <LangButton caption="I read" code={s.myLang} onChange={(c) => updateSettings({ myLang: c })} />
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 10 }}>
        <Btn
          style={{ flex: 1 }}
          kind={mic.listening ? 'warm' : 'primary'}
          label={mic.listening ? 'Stop captions' : 'Start captions'}
          onPress={() => (mic.listening ? mic.stop() : mic.start(theirLang))}
        />
        <Btn kind="ghost" label="Use on calls" onPress={() => setHelp(true)} />
        {liveSession && lines.length ? <Btn kind="ghost" label="Recap" onPress={() => openRecap(liveSession)} /> : null}
      </View>
      <Pressable
        accessibilityRole="switch"
        accessibilityState={{ checked: callMode }}
        accessibilityLabel="Phone call mode"
        onPress={toggleCallMode}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingVertical: 10,
          paddingHorizontal: 14,
          borderRadius: 12,
          borderWidth: 1,
          marginBottom: 10,
          backgroundColor: callMode ? p.accent : p.cardAlt,
          borderColor: callMode ? p.accent : p.line,
        }}
      >
        <View style={{ flex: 1 }}>
          <Text style={{ color: callMode ? p.accentText : p.text, fontWeight: '800', fontSize: 15 }}>
            Phone call mode {callMode ? 'on' : 'off'}
          </Text>
          <Text style={{ color: callMode ? p.accentText : p.sub, fontSize: 12, marginTop: 2, lineHeight: 17 }}>
            {callMode
              ? `Call on speaker. Don't talk — type. They hear only the ${langName(theirLang)} voice. Tap here when the call ends for its summary.`
              : 'For normal and WhatsApp calls: you type, they hear only the translation.'}
          </Text>
        </View>
        <Text style={{ color: callMode ? p.accentText : p.sub, fontWeight: '800', fontSize: 13, marginLeft: 10 }}>
          {callMode ? 'ON' : 'OFF'}
        </Text>
      </Pressable>
      <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginBottom: 8, alignItems: 'center' }}>
        <Text style={{ color: p.sub, fontSize: 12 }}>Listening for:</Text>
        {expected.map((code) => (
          <Pressable
            key={code}
            accessibilityRole="button"
            accessibilityLabel={`Listen in ${langName(code)}`}
            onPress={() => listenIn(code)}
            onLongPress={() => updateSettings({ listenLanguages: expected.filter((c) => c !== code) })}
            style={{
              paddingVertical: 7,
              paddingHorizontal: 12,
              borderRadius: 999,
              borderWidth: 1,
              backgroundColor: code === theirLang ? p.accent : p.cardAlt,
              borderColor: code === theirLang ? p.accent : p.line,
            }}
          >
            <Text style={{ color: code === theirLang ? p.accentText : p.text, fontWeight: '700', fontSize: 13 }}>
              {langName(code)}
            </Text>
          </Pressable>
        ))}
        <LangButton
          code="auto"
          allowAuto
          style={{ flex: 0, minWidth: 70, paddingVertical: 7 }}
          onChange={(code) => {
            if (code === 'auto' || expected.includes(code)) return;
            updateSettings({ listenLanguages: [...expected, code] });
          }}
        />
      </View>
      {expected.length > 1 ? (
        <Text style={{ color: p.sub, fontSize: 11, marginBottom: 6, lineHeight: 16 }}>
          A phone hears one language at a time. Tap a name to switch, hold to remove. It also switches by itself when what it heard is clearly one of the others.
        </Text>
      ) : null}
      {switched ? (
        <Text style={{ color: p.ok, fontSize: 12, marginBottom: 6 }}>Switched to {langName(switched)}</Text>
      ) : null}
      <ErrorText>{error || mic.error}</ErrorText>

      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 6 }}>
        <Text style={{ flex: 1, color: p.sub, fontSize: 12 }}>
          {lines.length ? `This conversation · ${lines.length} line${lines.length === 1 ? '' : 's'}` : ''}
        </Text>
        {lines.length && !callMode ? <Btn small kind="ghost" label="New" onPress={newSession} /> : null}
        {store.captionSessions.length ? (
          <Btn small kind="ghost" label={`Saved (${store.captionSessions.length})`} onPress={() => setSavedOpen(true)} />
        ) : null}
      </View>

      <FlatList
        ref={list}
        data={lines}
        keyExtractor={(l) => l.id}
        style={{ flex: 1 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={{ color: p.sub, textAlign: 'center', marginTop: 40, fontSize: 15 }}>
            Captions appear here in {langName(s.myLang)} as people speak {langName(theirLang)}.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={{ marginBottom: 14, alignItems: item.mine ? 'flex-end' : 'flex-start' }}>
            <Text style={{ color: item.mine ? p.accent : p.text, fontSize: s.captionSize, lineHeight: s.captionSize * 1.3, fontWeight: '600' }}>
              {item.mine ? item.original : item.translated}
            </Text>
            {s.showOriginal ? <Text style={{ color: p.sub, fontSize: 14, marginTop: 2 }}>{item.mine ? item.translated : item.original}</Text> : null}
          </View>
        )}
        ListFooterComponent={
          partial.original ? (
            <View style={{ marginBottom: 14, opacity: 0.7 }}>
              <Text style={{ color: p.text, fontSize: s.captionSize, lineHeight: s.captionSize * 1.3 }}>{partial.translated || '…'}</Text>
              {s.showOriginal ? <Text style={{ color: p.sub, fontSize: 14 }}>{partial.original}</Text> : null}
            </View>
          ) : undefined
        }
      />

      {callMode ? (
        <>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingTop: 6 }}>
            <Text style={{ flex: 1, color: speakingNow ? p.ok : p.sub, fontSize: 12 }}>
              {speakingNow
                ? `Speaking to them in ${langName(theirLang)}… captions paused`
                : busy
                ? 'Translating…'
                : mic.listening
                ? 'Listening to the call'
                : 'Captions are off — tap Start captions to hear them'}
            </Text>
            {speakingNow ? (
              <Btn small kind="danger" label="Stop" onPress={stopSpeaking} />
            ) : lastSaid.current ? (
              <Btn small kind="ghost" label="Repeat" onPress={() => lastSaid.current && sayOut(lastSaid.current.text, lastSaid.current.lang)} />
            ) : null}
          </View>
          <ScrollView horizontal showsHorizontalScrollIndicator={false} keyboardShouldPersistTaps="handled" style={{ flexGrow: 0, marginTop: 6 }} contentContainerStyle={{ gap: 6 }}>
            {phrases.map((ph) => (
              <Pressable
                key={ph.id}
                accessibilityRole="button"
                accessibilityLabel={`Say: ${ph.text}`}
                disabled={busy}
                onPress={() => sayPhrase(ph)}
                style={{
                  paddingVertical: 7,
                  paddingHorizontal: 12,
                  borderRadius: 999,
                  borderWidth: 1,
                  borderColor: ph.builtin ? p.line : p.accent,
                  backgroundColor: p.cardAlt,
                  opacity: busy ? 0.5 : 1,
                }}
              >
                <Text style={{ color: p.text, fontWeight: '700', fontSize: 13 }}>{labelFor(ph)}</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              accessibilityLabel="My phrases"
              onPress={() => setPhrasesOpen(true)}
              style={{ paddingVertical: 7, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1, borderStyle: 'dashed', borderColor: p.accent }}
            >
              <Text style={{ color: p.accent, fontWeight: '800', fontSize: 13 }}>+ My phrases</Text>
            </Pressable>
          </ScrollView>
          {warm && warm.total ? (
            <Text style={{ color: warm.done < warm.total ? p.sub : warm.failed ? p.sub : p.ok, fontSize: 11, marginTop: 4 }}>
              {warm.done < warm.total
                ? `Preparing quick replies ${warm.done}/${warm.total}…`
                : warm.failed
                ? `Quick replies ready — ${warm.failed} couldn't be prepared and will translate when tapped`
                : 'Quick replies ready — they work instantly, even offline'}
            </Text>
          ) : null}
        </>
      ) : null}

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingTop: 8 }}>
        <TextInput
          ref={input}
          value={reply}
          onChangeText={setReply}
          placeholder={`Reply in ${langName(s.myLang)} — spoken in ${langName(theirLang)}`}
          placeholderTextColor={p.sub}
          // in a call, Enter sends straight away and the keyboard stays up for the next reply
          multiline={!callMode}
          returnKeyType={callMode ? 'send' : 'default'}
          submitBehavior={callMode ? 'submit' : undefined}
          onSubmitEditing={callMode ? sendReply : undefined}
          style={[styles.input, { flex: 1, color: p.text, borderColor: p.line, backgroundColor: p.card, maxHeight: 100 }]}
        />
        <Btn label={busy ? '…' : 'Say'} onPress={sendReply} disabled={!reply.trim() || busy} />
      </View>

      <RecapSheet visible={!!recap} title={recap?.title ?? ''} entries={recap?.entries ?? []} onClose={() => setRecap(null)} />

      {/* saved conversations */}
      <Modal visible={savedOpen} animationType="slide" onRequestClose={() => setSavedOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
          <ScrollView contentContainerStyle={{ padding: 18 }}>
            <Text style={{ color: p.text, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>Saved conversations</Text>
            <Text style={{ color: p.sub, fontSize: 13, marginBottom: 14 }}>The last {store.captionSessions.length} are kept on this phone only.</Text>
            {store.captionSessions.map((session) => (
              <Card key={session.id}>
                <Text style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>{titleOf(session)}</Text>
                <Text numberOfLines={2} style={{ color: p.sub, fontSize: 13, marginTop: 4 }}>
                  {session.lines.length} lines · {session.lines[0]?.mine ? session.lines[0].original : session.lines[0]?.translated}
                </Text>
                <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
                  <Btn
                    small
                    label="Open summary"
                    onPress={() => {
                      setSavedOpen(false);
                      openRecap(session);
                    }}
                  />
                  <Btn small kind="ghost" label="Delete" onPress={() => deleteCaptionSession(session.id)} />
                </View>
              </Card>
            ))}
            <Btn kind="ghost" label="Close" onPress={() => setSavedOpen(false)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      {/* my own quick phrases */}
      <Modal visible={phrasesOpen} animationType="slide" onRequestClose={() => setPhrasesOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
          <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
            <Text style={{ color: p.text, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>My phrases</Text>
            <Text style={{ color: p.sub, fontSize: 13, marginBottom: 14, lineHeight: 19 }}>
              Things you say on most calls — your name, address, a booking number. Write them in {langName(s.myLang)}; one tap speaks them in the caller's language.
            </Text>
            <Card>
              <Label>New phrase</Label>
              <TextInput
                value={newPhrase}
                onChangeText={setNewPhrase}
                placeholder="e.g. My name is Alex. My booking number is 4521."
                placeholderTextColor={p.sub}
                multiline
                style={[styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.card, marginBottom: 10 }]}
              />
              <Btn
                label={s.customPhrases.length >= MAX_CUSTOM_PHRASES ? `Add (replaces the oldest of ${MAX_CUSTOM_PHRASES})` : 'Add'}
                onPress={addCustomPhrase}
                disabled={!cleanPhrase(newPhrase)}
              />
            </Card>
            {s.customPhrases.map((ph) => (
              <Card key={ph.id} style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
                <Text style={{ flex: 1, color: p.text, fontSize: 15, lineHeight: 21 }}>{ph.text}</Text>
                <Btn small kind="ghost" label="Delete" onPress={() => updateSettings({ customPhrases: s.customPhrases.filter((x) => x.id !== ph.id) })} />
              </Card>
            ))}
            <Btn kind="ghost" label="Done" onPress={() => setPhrasesOpen(false)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>

      <Modal visible={help} animationType="slide" onRequestClose={() => setHelp(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
          <ScrollView contentContainerStyle={{ padding: 18 }}>
            <Text style={{ color: p.text, fontSize: 22, fontWeight: '800', marginBottom: 12 }}>Captions on WhatsApp and other app calls</Text>
            <Card>
              <Text style={{ color: p.text, fontSize: 15, lineHeight: 23 }}>
                1. Set "They speak" to the caller's language and turn on Phone call mode.{'\n'}
                2. Start or answer the call in WhatsApp (or Telegram, Messenger, a normal phone call…).{'\n'}
                3. Put the call on speaker.{'\n'}
                4. Come back to Translate+, or open it as a floating window / split screen so both apps stay visible.{'\n'}
                5. Tap "Introduce me" so they know to speak slowly.{'\n'}
                6. Read the captions. To answer, type your reply and press Enter — the phone speaks it in their language and the call picks it up.{'\n'}
                7. When the call ends, turn Phone call mode off: you get a summary of the dates, times, amounts and addresses that came up, and the call is saved.{'\n\n'}
                Don't talk yourself: the call hears everything near the phone, so typing is what keeps your own voice out. The other person needs nothing — no app, no link.
              </Text>
            </Card>
            <Card>
              <Text style={{ color: p.text, fontSize: 15, lineHeight: 23 }}>
                Why speaker? Android does not let one app listen inside another app's call. Translate+ hears the call the same way a person next to you would: through the loudspeaker and microphone.{'\n\n'}
                Some phones give the microphone only to the calling app while a call is active. If no captions appear during a call, that is the cause — use an in-app Translate+ call from the Chats tab instead, which does not have this limit.
              </Text>
            </Card>
            <Btn label="Got it" onPress={() => setHelp(false)} />
          </ScrollView>
        </SafeAreaView>
      </Modal>
    </View>
  );
}