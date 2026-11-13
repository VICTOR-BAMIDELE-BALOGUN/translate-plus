// Face to Face: one phone between two people. The top half is rotated so the other
// person can read it from across the table.
import React, { useRef, useState } from 'react';
import { Pressable, Text, View } from 'react-native';
import { useKeepAwake } from 'expo-keep-awake';
import { ErrorText, LangButton } from '../components/ui';
import { usePalette } from '../theme';
import { updateSettings, useSettings } from '../store';
import { translate } from '../services/translate';
import { speak, stopSpeaking } from '../services/tts';
import { useListener } from '../services/listen';
import { langName } from '../languages';

type Side = 'me' | 'them';

export default function TalkScreen() {
  useKeepAwake();
  const p = usePalette();
  const s = useSettings();
  const [active, setActive] = useState<Side | null>(null);
  const activeRef = useRef<Side | null>(null);
  const [mine, setMine] = useState({ heard: '', shown: '' }); // what I said / what I read
  const [theirs, setTheirs] = useState({ heard: '', shown: '' });
  const [error, setError] = useState<string | null>(null);
  const seq = useRef(0);

  const handle = async (text: string, final: boolean) => {
    const side = activeRef.current;
    if (!side) return;
    const from = side === 'me' ? s.myLang : s.targetLang;
    const to = side === 'me' ? s.targetLang : s.myLang;
    (side === 'me' ? setMine : setTheirs)((v) => ({ ...v, heard: text }));
    if (!final) return;
    const id = ++seq.current;
    try {
      const out = await translate(text, from, to, s.provider);
      if (id !== seq.current) return;
      (side === 'me' ? setTheirs : setMine)((v) => ({ ...v, shown: out.text }));
      setError(null);
      if (s.autoSpeak) speak(out.text, to);
    } catch (e) {
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
    activeRef.current = side;
    setActive(side);
    mic.start(side === 'me' ? s.myLang : s.targetLang);
  };

  const renderHalf = (side: Side) => {
    const lang = side === 'me' ? s.myLang : s.targetLang;
    const data = side === 'me' ? mine : theirs;
    const on = active === side;
    return (
      <View style={{ flex: 1, padding: 16, transform: side === 'them' ? [{ rotate: '180deg' }] : [] }}>
        <View style={{ flexDirection: 'row' }}>
          <LangButton
            caption={side === 'me' ? 'I speak' : 'They speak'}
            code={lang}
            onChange={(c) => updateSettings(side === 'me' ? { myLang: c } : { targetLang: c })}
          />
        </View>
        <View style={{ flex: 1, justifyContent: 'center' }}>
          <Text style={{ color: p.text, fontSize: 26, lineHeight: 34, fontWeight: '600' }}>{data.shown || ' '}</Text>
          {data.heard ? <Text style={{ color: p.sub, fontSize: 15, marginTop: 8 }}>{on ? '🎙 ' : ''}{data.heard}</Text> : null}
        </View>
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
      {renderHalf('them')}
      <View style={{ height: 2, backgroundColor: p.line }} />
      {error || mic.error ? <View style={{ paddingHorizontal: 16 }}><ErrorText>{error || mic.error}</ErrorText></View> : null}
      {renderHalf('me')}
    </View>
  );
}
