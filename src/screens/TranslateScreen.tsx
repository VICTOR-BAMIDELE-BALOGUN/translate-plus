import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Btn, Card, ErrorText, Label, LangButton, styles } from '../components/ui';
import { usePalette } from '../theme';
import { addHistory, updateSettings, useStore } from '../store';
import { translate } from '../services/translate';
import { speak, stopSpeaking } from '../services/tts';
import { useListener } from '../services/listen';
import { langName } from '../languages';

export default function TranslateScreen() {
  const p = usePalette();
  const { settings, history } = useStore();
  const [from, setFrom] = useState('auto');
  const to = settings.targetLang;
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [detected, setDetected] = useState<string | undefined>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);
  const base = useRef('');

  const mic = useListener({
    onPartial: (t) => setText((base.current ? base.current + ' ' : '') + t),
    onFinal: (t) => {
      base.current = (base.current ? base.current + ' ' : '') + t;
      setText(base.current);
    },
  });

  useEffect(() => {
    const clean = text.trim();
    if (!clean) {
      setResult('');
      setDetected(undefined);
      setError(null);
      return;
    }
    const mine = ++seq.current;
    const timer = setTimeout(async () => {
      setBusy(true);
      try {
        const out = await translate(clean, from, to, settings.provider);
        if (mine !== seq.current) return;
        setResult(out.text);
        setDetected(out.detected);
        setError(null);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : 'Translation failed');
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [text, from, to, settings.provider]);

  const save = () => {
    if (text.trim() && result) addHistory({ from: detected ?? from, to, source: text.trim(), result });
  };

  const swap = () => {
    const newTo = from === 'auto' ? detected ?? settings.myLang : from;
    setFrom(to);
    updateSettings({ targetLang: newTo });
    if (result) setText(result);
  };

  const toggleMic = () => {
    if (mic.listening) return mic.stop();
    base.current = text.trim();
    mic.start(from === 'auto' ? settings.myLang : from);
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 12 }}>
        <LangButton caption="From" code={from} onChange={setFrom} allowAuto />
        <Btn small kind="ghost" label="⇄" onPress={swap} />
        <LangButton caption="To" code={to} onChange={(c) => updateSettings({ targetLang: c })} />
      </View>

      <Card>
        <TextInput
          value={text}
          onChangeText={(t) => {
            setText(t);
            base.current = t;
          }}
          placeholder="Type or tap the mic and speak"
          placeholderTextColor={p.sub}
          multiline
          style={{ color: p.text, fontSize: 18, minHeight: 90, textAlignVertical: 'top' }}
        />
        {from === 'auto' && detected && text.trim() ? (
          <Text style={{ color: p.sub, fontSize: 12, marginBottom: 6 }}>Detected: {langName(detected)}</Text>
        ) : null}
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <Btn small kind={mic.listening ? 'warm' : 'primary'} label={mic.listening ? 'Stop mic' : 'Speak'} onPress={toggleMic} />
          <Btn
            small
            kind="ghost"
            label="Clear"
            onPress={() => {
              save();
              setText('');
              base.current = '';
            }}
            disabled={!text}
          />
        </View>
        {from === 'auto' && mic.listening ? (
          <Text style={{ color: p.sub, fontSize: 12, marginTop: 6 }}>Mic listens in {langName(settings.myLang)}. Pick a "From" language to dictate another one.</Text>
        ) : null}
        <ErrorText>{mic.error}</ErrorText>
      </Card>

      <Card style={{ backgroundColor: p.cardAlt }}>
        <Label>{langName(to)}{busy ? ' · translating…' : ''}</Label>
        <Text selectable style={{ color: p.text, fontSize: 20, minHeight: 60, lineHeight: 28 }}>{result}</Text>
        <ErrorText>{error}</ErrorText>
        <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
          <Btn small label="Listen" disabled={!result} onPress={() => { stopSpeaking(); speak(result, to); save(); }} />
          <Btn
            small
            kind="ghost"
            label={copied ? 'Copied' : 'Copy'}
            disabled={!result}
            onPress={async () => {
              await Clipboard.setStringAsync(result);
              setCopied(true);
              save();
              setTimeout(() => setCopied(false), 1500);
            }}
          />
        </View>
      </Card>

      {history.length > 0 ? (
        <>
          <Label>Recent</Label>
          {history.slice(0, 15).map((h) => (
            <Pressable key={h.id} onPress={() => { setText(h.source); base.current = h.source; }}>
              <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line, padding: 12 }]}>
                <Text numberOfLines={2} style={{ color: p.sub, fontSize: 13 }}>{h.source}</Text>
                <Text numberOfLines={2} style={{ color: p.text, fontSize: 15, marginTop: 2 }}>{h.result}</Text>
              </View>
            </Pressable>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
