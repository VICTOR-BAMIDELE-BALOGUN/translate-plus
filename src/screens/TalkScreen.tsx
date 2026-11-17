// Face to Face: one phone between two people. The top half is rotated so the other
// person can read it from across the table.
import React, { useRef, useState } from 'react';
import { Pressable, ScrollView, Text, View } from 'react-native';
import type { ScrollViewInstance } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { Btn, ErrorText, LangButton } from '../components/ui';
import { usePalette } from '../theme';
import { updateSettings, useSettings } from '../store';
import { translate } from '../services/translator';
import { speak, stopSpeaking } from '../services/tts';
import { useListener } from '../services/listen';
import { langName } from '../languages';
import RecapSheet from '../components/RecapSheet';
import type { Entry } from '../services/recap';

type Side = 'me' | 'them';
type Half = { lines: string[]; pending: string; heard: string };

const EMPTY: Half = { lines: [], pending: '', heard: '' };
const KEEP = 6; // finished sentences stay on screen instead of being overwritten

export default function TalkScreen() {
  useKeepAwake();
  const p = usePalette();
  const s = useSettings();
  const [active, setActive] = useState<Side | null>(null);
  const activeRef = useRef<Side | null>(null);
  const [mine, setMine] = useState<Half>(EMPTY); // what I read
  const [theirs, setTheirs] = useState<Half>(EMPTY); // what they read
  const [error, setError] = useState<string | null>(null);
  const [transcript, setTranscript] = useState<Entry[]>([]);
  const [recapOpen, setRecapOpen] = useState(false);
  // one counter for partials and finals together, so an older request can never
  // overwrite a newer one when the network returns them out of order
  const seq = useRef(0);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scrolls = useRef<Record<Side, ScrollViewInstance | null>>({ me: null, them: null });

  const setHalf = (side: Side, fn: (v: Half) => Half) => (side === 'me' ? setMine(fn) : setTheirs(fn));

  const clearTimer = () => {
    if (timer.current) {
      clearTimeout(timer.current);
      timer.current = null;
    }
  };

  const handle = async (text: string, final: boolean) => {
    const side = activeRef.current;
    if (!side) return;
    const from = side === 'me' ? s.myLang : s.targetLang;
    const to = side === 'me' ? s.targetLang : s.myLang;
    const reader: Side = side === 'me' ? 'them' : 'me';
    setHalf(side, (v) => ({ ...v, heard: text }));

    if (!final) {
      // show the translation forming while they are still talking, lightly throttled
      if (timer.current) return;
      timer.current = setTimeout(async () => {
        timer.current = null;
        const id = ++seq.current;
        try {
          const out = await translate(text, from, to);
          if (id === seq.current) setHalf(reader, (v) => ({ ...v, pending: out.text }));
        } catch {
          // a failed partial is not worth reporting; the final result will say so
        }
      }, 400);
      return;
    }

    clearTimer(); // a pending partial must not land on top of the finished sentence
    const id = ++seq.current;
    try {
      const out = await translate(text, from, to);
      if (id !== seq.current) return;
      setHalf(reader, (v) => ({ ...v, lines: [...v.lines, out.text].slice(-KEEP), pending: '' }));
      setTranscript((t) => [
        ...t,
        { who: side === 'me' ? 'Me' : 'Them', mine: side === 'me', original: text, translated: out.text, ts: Date.now() },
      ]);
      setHalf(side, (v) => ({ ...v, heard: '' }));
      setError(null);
      if (s.autoSpeak) speak(out.text, to);
    } catch (e) {
      setHalf(reader, (v) => ({ ...v, pending: '' }));
      setError(e instanceof Error ? e.message : 'Translation failed');
    }
  };

  const mic = useListener({ onPartial: (t) => handle(t, false), onFinal: (t) => handle(t, true) });

  const toggle = (side: Side) => {
    if (active === side) {
      activeRef.current = null;
      setActive(null);
      mic.stop();
      return;
    }
    stopSpeaking();
    clearTimer();
    activeRef.current = side;
    setActive(side);
    mic.start(side === 'me' ? s.myLang : s.targetLang);
  };

  const clearAll = () => {
    seq.current++;
    clearTimer();
    setMine(EMPTY);
    setTheirs(EMPTY);
    setTranscript([]);
  };

  const renderHalf = (side: Side) => {
    const lang = side === 'me' ? s.myLang : s.targetLang;
    const data = side === 'me' ? mine : theirs;
    const on = active === side;
    const last = data.lines.length - 1;
    return (
      <View style={{ flex: 1, padding: 16, transform: side === 'them' ? [{ rotate: '180deg' }] : [] }}>
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <LangButton
            caption={side === 'me' ? 'I speak' : 'They speak'}
            code={lang}
            onChange={(c) => updateSettings(side === 'me' ? { myLang: c } : { targetLang: c })}
          />
          {data.lines.length ? <Btn small kind="ghost" label="Clear" onPress={clearAll} /> : null}
          {side === 'me' && transcript.length ? <Btn small kind="ghost" label="Recap" onPress={() => setRecapOpen(true)} /> : null}
        </View>

        <ScrollView
          ref={(r) => {
            scrolls.current[side] = r;
          }}
          style={{ flex: 1 }}
          contentContainerStyle={{ flexGrow: 1, justifyContent: 'flex-end', paddingVertical: 10 }}
          onContentSizeChange={() => scrolls.current[side]?.scrollToEnd({ animated: true })}
        >
          {data.lines.map((line, i) => (
            <Text
              key={i}
              selectable
              style={{
                color: i === last ? p.text : p.sub,
                fontSize: i === last ? 26 : 16,
                lineHeight: i === last ? 34 : 22,
                fontWeight: i === last ? '600' : '400',
                marginBottom: 8,
              }}
            >
              {line}
            </Text>
          ))}
          {data.pending ? (
            <Text style={{ color: p.text, opacity: 0.55, fontSize: 26, lineHeight: 34, fontWeight: '600' }}>{data.pending}</Text>
          ) : null}
        </ScrollView>

        {data.heard ? (
          <Text numberOfLines={2} style={{ color: p.sub, fontSize: 14, marginBottom: 8 }}>🎙 {data.heard}</Text>
        ) : null}

        <Pressable
          accessibilityRole="button"
          accessibilityLabel={on ? 'Stop listening' : `Speak ${langName(lang)}`}
          onPress={() => toggle(side)}
          style={{ alignSelf: 'center', paddingVertical: 16, paddingHorizontal: 28, borderRadius: 999, backgroundColor: on ? p.warm : p.accent }}
        >
          <Text style={{ color: on ? '#1A1206' : p.accentText, fontWeight: '800', fontSize: 16 }}>
            {on ? 'Listening… tap to stop' : `Tap to speak ${langName(lang)}`}
          </Text>
        </Pressable>
      </View>
    );
  };

  return (
    <View style={{ flex: 1 }}>
      <RecapSheet visible={recapOpen} title="Face to Face conversation" entries={transcript} onClose={() => setRecapOpen(false)} />
      {renderHalf('them')}
      <View style={{ height: 2, backgroundColor: p.line }} />
      {error || mic.error ? <View style={{ paddingHorizontal: 16 }}><ErrorText>{error || mic.error}</ErrorText></View> : null}
      {renderHalf('me')}
    </View>
  );
}
