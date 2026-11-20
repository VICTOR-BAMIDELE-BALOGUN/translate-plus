// What the other person sees when they open a shared call link in their browser.
// No install, no account: the link carries the room code, which is also the key.
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Platform, ScrollView, Text, TextInput, View } from 'react-native';
import { Btn, Card, ErrorText, Label, LangButton, styles } from '../components/ui';
import { usePalette } from '../theme';
import { newId, updateSettings, useSettings } from '../store';
import { RoomConnection, type RoomStatus, type Wire } from '../services/room';
import { translate } from '../services/translator';
import { warmUp } from '../services/translate';
import { speak, stopSpeaking } from '../services/tts';
import { useListener } from '../services/listen';
import { langName } from '../languages';
import type { Invite } from '../invite';

type Line = { id: string; mine: boolean; original: string; shown: string };

export default function GuestScreen(props: { invite: Invite }) {
  const { invite } = props;
  const p = usePalette();
  const s = useSettings();
  const [joined, setJoined] = useState(false);
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [lines, setLines] = useState<Line[]>([]);
  const [partial, setPartial] = useState('');
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [hostHere, setHostHere] = useState(false);
  const conn = useRef<RoomConnection | null>(null);
  const list = useRef<FlatList<Line>>(null);

  // the link carries the language the inviter expects; offer it as the starting choice
  useEffect(() => {
    if (invite.lang && invite.lang !== 'auto') updateSettings({ myLang: invite.lang });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const push = (line: Line) => setLines((prev) => [...prev, line].slice(-120));

  const receive = async (wire: Wire) => {
    setHostHere(true);
    if (wire.kind === 'hello') conn.current?.send('here');
    if ((wire.kind !== 'chat' && wire.kind !== 'call') || !wire.text) return;
    const id = wire.id;
    push({ id, mine: false, original: wire.text, shown: '…' });
    try {
      const out = await translate(wire.text, wire.lang && wire.lang !== 'auto' ? wire.lang : 'auto', s.myLang);
      setLines((prev) => prev.map((l) => (l.id === id ? { ...l, shown: out.text } : l)));
      speak(out.text, s.myLang, { fast: true });
      setError(null);
    } catch (e) {
      setLines((prev) => prev.map((l) => (l.id === id ? { ...l, shown: wire.text as string } : l)));
      setError(e instanceof Error ? e.message : 'Could not translate that.');
    }
  };
  const receiveRef = useRef(receive);
  receiveRef.current = receive;

  useEffect(() => {
    if (!joined) return;
    const c = new RoomConnection(invite.code, { onStatus: setStatus, onMessage: (m) => receiveRef.current(m) });
    conn.current = c;
    return () => {
      c.send('call-leave');
      c.close();
      conn.current = null;
      stopSpeaking();
    };
  }, [joined, invite.code]);

  const send = (body: string) => {
    const clean = body.trim();
    if (!clean) return;
    const wire = conn.current?.send('call', clean, s.myLang);
    if (!wire) {
      setError('Not connected yet — that was not sent. Try again in a moment.');
      return;
    }
    setError(null);
    push({ id: wire.id, mine: true, original: clean, shown: clean });
  };

  const mic = useListener({
    commitAfter: s.quickSend ? 700 : undefined,
    onPartial: setPartial,
    onFinal: (t) => {
      setPartial('');
      send(t);
    },
  });

  if (!joined) {
    return (
      <ScrollView contentContainerStyle={{ padding: 20, flexGrow: 1, justifyContent: 'center' }}>
        <Text style={{ color: p.text, fontSize: 26, fontWeight: '900', marginBottom: 6 }}>
          {invite.name} wants to talk with you
        </Text>
        <Text style={{ color: p.sub, fontSize: 15, marginBottom: 20, lineHeight: 22 }}>
          You each speak your own language. Nothing to install — this page does the translating.
        </Text>
        <Card>
          <Label>Your language</Label>
          <View style={{ flexDirection: 'row' }}>
            <LangButton code={s.myLang} onChange={(c) => updateSettings({ myLang: c })} />
          </View>
          <Text style={{ color: p.sub, fontSize: 12, marginTop: 10 }}>
            Use headphones if you can, and allow the microphone when your browser asks.
          </Text>
        </Card>
        <Btn
          label={`Join in ${langName(s.myLang)}`}
          onPress={() => {
            stopSpeaking();
            warmUp(s.myLang);
            setJoined(true);
          }}
        />
        <Text style={{ color: p.sub, fontSize: 11, marginTop: 16, textAlign: 'center' }}>
          Messages are encrypted with the code in this link.
        </Text>
      </ScrollView>
    );
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ padding: 12, borderBottomWidth: 1, borderColor: p.line, flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <View style={{ flex: 1 }}>
          <Text style={{ color: p.text, fontSize: 17, fontWeight: '800' }}>{invite.name}</Text>
          <Text style={{ color: status === 'online' ? p.ok : p.warm, fontSize: 12 }}>
            {status === 'online' ? (hostHere ? 'Connected' : 'Connected · waiting for them') : status === 'connecting' ? 'Connecting…' : 'Offline · retrying'}
          </Text>
        </View>
        <Btn small kind={mic.listening ? 'warm' : 'primary'} label={mic.listening ? 'Stop mic' : 'Speak'} onPress={() => (mic.listening ? mic.stop() : mic.start(s.myLang))} />
      </View>

      {error || mic.error ? <View style={{ paddingHorizontal: 12 }}><ErrorText>{error || mic.error}</ErrorText></View> : null}

      <FlatList
        ref={list}
        data={lines}
        keyExtractor={(l) => l.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 16 }}
        onContentSizeChange={() => list.current?.scrollToEnd({ animated: true })}
        ListEmptyComponent={
          <Text style={{ color: p.sub, textAlign: 'center', marginTop: 40, lineHeight: 22 }}>
            Tap Speak and talk normally.{'\n'}What they say appears here in {langName(s.myLang)}.
          </Text>
        }
        renderItem={({ item }) => (
          <View style={{ marginBottom: 16, alignItems: item.mine ? 'flex-end' : 'flex-start' }}>
            <Text style={{ color: item.mine ? p.accent : p.text, fontSize: 22, lineHeight: 30, fontWeight: '600' }}>{item.shown}</Text>
            {!item.mine && s.showOriginal && item.shown !== item.original ? (
              <Text style={{ color: p.sub, fontSize: 13, marginTop: 2 }}>{item.original}</Text>
            ) : null}
          </View>
        )}
        ListFooterComponent={partial ? <Text style={{ color: p.sub, fontSize: 16, textAlign: 'right' }}>🎙 {partial}</Text> : undefined}
      />

      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', padding: 12 }}>
        <TextInput
          value={text}
          onChangeText={setText}
          placeholder={`Type in ${langName(s.myLang)}`}
          placeholderTextColor={p.sub}
          multiline
          style={[styles.input, { flex: 1, color: p.text, borderColor: p.line, backgroundColor: p.card, maxHeight: 100 }]}
        />
        <Btn label="Send" disabled={!text.trim()} onPress={() => { send(text); setText(''); }} />
      </View>
    </KeyboardAvoidingView>
  );
}
