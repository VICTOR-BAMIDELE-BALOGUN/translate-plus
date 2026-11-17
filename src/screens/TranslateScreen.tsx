import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Btn, Card, Choice, ErrorText, Label, LangButton, styles } from '../components/ui';
import { usePalette } from '../theme';
import { addHistory, updateSettings, useStore } from '../store';
import { translate } from '../services/translator';
import { speak, stopSpeaking } from '../services/tts';
import { useListener } from '../services/listen';
import { langName } from '../languages';
import { hasRegister, type Detected } from '../services/register';

export default function TranslateScreen() {
  const p = usePalette();
  const { settings, history } = useStore();
  const { width } = useWindowDimensions();
  const [from, setFrom] = useState('auto');
  const to = settings.targetLang;
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [detected, setDetected] = useState<string | undefined>();
  const [offline, setOffline] = useState(false);
  const [gotRegister, setGotRegister] = useState<Detected | undefined>();
  const [fixedRegister, setFixedRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const seq = useRef(0);
  const base = useRef('');

  // side by side needs room; on a narrow phone it falls back to stacked
  const sideBySide = settings.paneLayout === 'side' && width >= 520;

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
        const out = await translate(clean, from, to);
        if (mine !== seq.current) return;
        setResult(out.text);
        setDetected(out.detected);
        setOffline(!!out.offline);
        setGotRegister(out.register);
        setFixedRegister(!!out.registerCorrected);
        setError(null);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : 'Translation failed');
      } finally {
        if (mine === seq.current) setBusy(false);
      }
    }, 450);
    return () => clearTimeout(timer);
  }, [text, from, to, settings.provider, settings.translationMode, settings.register]);

  const save = () => {
    if (text.trim() && result) addHistory({ from: detected ?? from, to, source: text.trim(), result });
  };

  const swap = () => {
    const newTo = from === 'auto' ? detected ?? settings.myLang : from;
    setFrom(to);
    updateSettings({ targetLang: newTo });
    if (result) {
      setText(result);
      base.current = result;
    }
  };

  const toggleMic = () => {
    if (mic.listening) return mic.stop();
    base.current = text.trim();
    mic.start(from === 'auto' ? settings.myLang : from);
  };

  const clearAll = () => {
    save();
    setText('');
    base.current = '';
  };

  const sourcePane = (
    <Card style={{ flex: 1, marginBottom: sideBySide ? 0 : 10, marginRight: sideBySide ? 5 : 0 }}>
      <Label>
        {from === 'auto' ? (detected && text.trim() ? `Detected: ${langName(detected)}` : 'Detect language') : langName(from)}
      </Label>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          base.current = t;
        }}
        placeholder="Type or tap the mic and speak"
        placeholderTextColor={p.sub}
        multiline
        scrollEnabled
        style={{ color: p.text, fontSize: 17, flex: 1, textAlignVertical: 'top', minHeight: 60 }}
      />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Btn small kind={mic.listening ? 'warm' : 'primary'} label={mic.listening ? 'Stop' : 'Speak'} onPress={toggleMic} />
        <Btn small kind="ghost" label="Clear" onPress={clearAll} disabled={!text} />
      </View>
      <ErrorText>{mic.error}</ErrorText>
    </Card>
  );

  const resultPane = (
    <Card style={{ flex: 1, backgroundColor: p.cardAlt, marginBottom: 0, marginLeft: sideBySide ? 5 : 0 }}>
      <Label>
        {langName(to)}
        {busy ? ' · translating…' : offline && result ? ' · on device' : ''}
        {!busy && result && gotRegister && gotRegister !== 'unknown'
          ? ` · ${gotRegister === 'formal' ? 'formal' : 'informal'}${fixedRegister ? ' (adjusted)' : ''}`
          : ''}
      </Label>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
        <Text selectable style={{ color: p.text, fontSize: 19, lineHeight: 27 }}>{result}</Text>
        <ErrorText>{error}</ErrorText>
      </ScrollView>
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
  );

  return (
    <View style={{ flex: 1, padding: 16, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <LangButton caption="From" code={from} onChange={setFrom} allowAuto />
        <Btn small kind="ghost" label="⇄" onPress={swap} />
        <LangButton caption="To" code={to} onChange={(c) => updateSettings({ targetLang: c })} />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {hasRegister(to) ? (
          <Choice
            value={settings.register}
            onChange={(v) => updateSettings({ register: v })}
            options={[
              { value: 'auto', label: 'Auto' },
              { value: 'formal', label: 'Formal' },
              { value: 'informal', label: 'Informal' },
            ]}
          />
        ) : (
          <View />
        )}
        <Choice
          value={settings.paneLayout}
          onChange={(v) => updateSettings({ paneLayout: v })}
          options={[
            { value: 'stacked', label: 'Stacked' },
            { value: 'side', label: 'Side by side' },
          ]}
        />
      </View>
      {settings.paneLayout === 'side' && !sideBySide ? (
        <Text style={{ color: p.sub, fontSize: 12, marginBottom: 8 }}>
          Not enough width for two columns — turn the phone sideways, or use a bigger screen.
        </Text>
      ) : null}

      <View style={{ flex: 1, flexDirection: sideBySide ? 'row' : 'column' }}>
        {sourcePane}
        {resultPane}
      </View>

      {from === 'auto' && mic.listening ? (
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6 }}>
          Mic listens in {langName(settings.myLang)}. Pick a "From" language to dictate another one.
        </Text>
      ) : null}

      {history.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <Pressable accessibilityRole="button" onPress={() => setShowHistory(!showHistory)}>
            <Text style={{ color: p.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>
              Recent ({history.length}) {showHistory ? '▾' : '▸'}
            </Text>
          </Pressable>
          {showHistory ? (
            <ScrollView style={{ maxHeight: 150, marginTop: 8 }}>
              {history.map((h) => (
                <Pressable
                  key={h.id}
                  onPress={() => {
                    setText(h.source);
                    base.current = h.source;
                  }}
                >
                  <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line, padding: 10, marginBottom: 8 }]}>
                    <Text numberOfLines={1} style={{ color: p.sub, fontSize: 12 }}>{h.source}</Text>
                    <Text numberOfLines={2} style={{ color: p.text, fontSize: 14, marginTop: 2 }}>{h.result}</Text>
                  </View>
                </Pressable>
              ))}
            </ScrollView>
          ) : null}
        </View>
      ) : null}
    </View>
  );
}
