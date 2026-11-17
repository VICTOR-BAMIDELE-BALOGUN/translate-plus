// Live Captions: rolling bilingual subtitles for whatever the phone hears —
// a meeting, a lecture, or a WhatsApp / other app call played on speaker.
import React, { useRef, useState } from 'react';
import { FlatList, Modal, ScrollView, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useKeepAwake } from 'expo-keep-awake';
import { Btn, Card, ErrorText, LangButton, styles } from '../components/ui';
import { usePalette } from '../theme';
import { newId, updateSettings, useSettings } from '../store';
import { translate } from '../services/translator';
import { speak } from '../services/tts';
import { useListener } from '../services/listen';
import { langName } from '../languages';
import RecapSheet from '../components/RecapSheet';

type Line = { id: string; original: string; translated: string; mine?: boolean };

export default function CaptionsScreen() {
  useKeepAwake();
  const p = usePalette();
  const s = useSettings();
  const [lines, setLines] = useState<Line[]>([]);
  const [partial, setPartial] = useState({ original: '', translated: '' });
  const [reply, setReply] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [help, setHelp] = useState(false);
  const [recapOpen, setRecapOpen] = useState(false);
  const partialSeq = useRef(0);
  const partialTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const list = useRef<FlatList<Line>>(null);

  const theirLang = s.targetLang;

  const push = (line: Line) => setLines((prev) => [...prev, line].slice(-80));

  const mic = useListener({
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

  const sendReply = async () => {
    const text = reply.trim();
    if (!text) return;
    setReply('');
    try {
      const out = await translate(text, s.myLang, theirLang);
      push({ id: newId(), original: text, translated: out.text, mine: true });
      speak(out.text, theirLang); // played out loud so the other person (or the call) hears it
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Translation failed');
      setReply(text);
    }
  };

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
        {lines.length ? <Btn kind="ghost" label="Recap" onPress={() => setRecapOpen(true)} /> : null}
      </View>
      <ErrorText>{error || mic.error}</ErrorText>

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

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', paddingTop: 8 }}>
        <TextInput
          value={reply}
          onChangeText={setReply}
          placeholder={`Reply in ${langName(s.myLang)} — spoken in ${langName(theirLang)}`}
          placeholderTextColor={p.sub}
          multiline
          style={[styles.input, { flex: 1, color: p.text, borderColor: p.line, backgroundColor: p.card, maxHeight: 100 }]}
        />
        <Btn label="Say" onPress={sendReply} disabled={!reply.trim()} />
      </View>

      <RecapSheet
        visible={recapOpen}
        title="Captions session"
        entries={lines.map((l) => ({
          who: l.mine ? 'Me' : 'Them',
          mine: !!l.mine,
          original: l.mine ? l.original : l.original,
          translated: l.translated,
        }))}
        onClose={() => setRecapOpen(false)}
      />

      <Modal visible={help} animationType="slide" onRequestClose={() => setHelp(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
          <ScrollView contentContainerStyle={{ padding: 18 }}>
            <Text style={{ color: p.text, fontSize: 22, fontWeight: '800', marginBottom: 12 }}>Captions on WhatsApp and other app calls</Text>
            <Card>
              <Text style={{ color: p.text, fontSize: 15, lineHeight: 23 }}>
                1. Start captions here, with "They speak" set to the caller's language.{'\n'}
                2. Start or answer the call in WhatsApp (or Telegram, Messenger, a normal phone call…).{'\n'}
                3. Put the call on speaker.{'\n'}
                4. Come back to Translate+, or open it as a floating window / split screen so both apps stay visible.{'\n'}
                5. Read the captions. To answer, type your reply and tap Say — the phone speaks it in their language and the call picks it up.
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
