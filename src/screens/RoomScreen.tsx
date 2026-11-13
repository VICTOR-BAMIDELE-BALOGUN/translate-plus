// A conversation: translated chat plus an in-app translated call.
// In a call each phone turns speech into text, sends the text (tiny, so it is fast even
// on weak data) and the other phone translates it and speaks it aloud.
import React, { useEffect, useRef, useState } from 'react';
import { FlatList, KeyboardAvoidingView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { activateKeepAwakeAsync, deactivateKeepAwake } from 'expo-keep-awake';
import { Btn, ErrorText, styles } from '../components/ui';
import { usePalette } from '../theme';
import { addMessage, getSettings, patchMessage, useStore, type ChatMessage, type Room } from '../store';
import { RoomConnection, type RoomStatus, type Wire } from '../services/room';
import { translate } from '../services/translate';
import { speak, stopSpeaking } from '../services/tts';
import { useListener } from '../services/listen';
import { shareRoom } from './ChatsScreen';

export default function RoomScreen(props: { room: Room; onBack: () => void }) {
  const { room } = props;
  const p = usePalette();
  const { messages, settings } = useStore();
  const list = messages[room.code] ?? [];
  const [status, setStatus] = useState<RoomStatus>('connecting');
  const [peers, setPeers] = useState<Record<string, { name: string; seen: number; inCall: boolean }>>({});
  const [text, setText] = useState('');
  const [inCall, setInCall] = useState(false);
  const [partial, setPartial] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const conn = useRef<RoomConnection | null>(null);
  const inCallRef = useRef(false);
  const flat = useRef<FlatList<ChatMessage>>(null);

  const receive = async (wire: Wire) => {
    setPeers((prev) => ({
      ...prev,
      [wire.from]: {
        name: wire.name,
        seen: Date.now(),
        inCall: wire.kind === 'call-join' || wire.kind === 'call' ? true : wire.kind === 'call-leave' ? false : prev[wire.from]?.inCall ?? false,
      },
    }));
    if (wire.kind === 'hello') conn.current?.send(inCallRef.current ? 'call-join' : 'here');
    if ((wire.kind !== 'chat' && wire.kind !== 'call') || !wire.text) return;
    const s = getSettings();
    addMessage(room.code, { id: wire.id, from: wire.from, name: wire.name, kind: wire.kind, text: wire.text, lang: wire.lang ?? 'auto', ts: wire.ts, mine: false });
    const needs = s.autoTranslateChats || wire.kind === 'call';
    if (!needs) return;
    try {
      const out = await translate(wire.text, wire.lang && wire.lang !== s.myLang ? wire.lang : 'auto', s.myLang, s.provider);
      patchMessage(room.code, wire.id, { translated: out.text });
      // speak calls only while I am in the call myself, and only if the phrase is fresh
      if (wire.kind === 'call' && inCallRef.current && Date.now() - wire.ts < 20000) speak(out.text, s.myLang);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Translation failed');
      if (wire.kind === 'call' && inCallRef.current) setError('Could not translate what they said. Check your connection.');
    }
  };
  const receiveRef = useRef(receive);
  receiveRef.current = receive;

  useEffect(() => {
    const c = new RoomConnection(room.code, { onStatus: setStatus, onMessage: (m) => receiveRef.current(m) });
    conn.current = c;
    return () => {
      if (inCallRef.current) c.send('call-leave');
      c.close();
      conn.current = null;
      stopSpeaking();
      deactivateKeepAwake('tplus-call').catch(() => {});
    };
  }, [room.code, settings.brokerUrl]);

  const post = (kind: 'chat' | 'call', body: string) => {
    const clean = body.trim();
    if (!clean) return false;
    const wire = conn.current?.send(kind, clean, getSettings().myLang);
    if (!wire) {
      setError('Not connected. Your message was not sent — try again in a moment.');
      return false;
    }
    setError(null);
    addMessage(room.code, { id: wire.id, from: wire.from, name: wire.name, kind, text: clean, lang: wire.lang ?? '', ts: wire.ts, mine: true });
    return true;
  };

  const mic = useListener({
    onPartial: setPartial,
    onFinal: (t) => {
      setPartial('');
      if (inCallRef.current) post('call', t);
      else setText((prev) => (prev ? prev + ' ' : '') + t);
    },
  });

  const toggleCall = async () => {
    if (inCall) {
      inCallRef.current = false;
      setInCall(false);
      mic.stop();
      stopSpeaking();
      conn.current?.send('call-leave');
      deactivateKeepAwake('tplus-call').catch(() => {});
      return;
    }
    const ok = await mic.start(getSettings().myLang);
    if (!ok) return;
    inCallRef.current = true;
    setInCall(true);
    conn.current?.send('call-join');
    activateKeepAwakeAsync('tplus-call').catch(() => {});
  };

  // if the microphone stops on its own (permission refused, recognition failed), end the call
  // instead of leaving it looking active while nothing is being heard
  useEffect(() => {
    if (inCall && !mic.listening) {
      inCallRef.current = false;
      setInCall(false);
      stopSpeaking();
      conn.current?.send('call-leave');
      deactivateKeepAwake('tplus-call').catch(() => {});
    }
  }, [inCall, mic.listening]);

  const now = Date.now();
  const online = Object.values(peers).filter((x) => now - x.seen < 70000);
  const peerInCall = online.some((x) => x.inCall);
  const statusText =
    status === 'online'
      ? online.length
        ? `${online.map((x) => x.name).join(', ')} online${peerInCall ? ' · in call' : ''}`
        : 'Connected · waiting for the other person'
      : status === 'connecting'
      ? 'Connecting…'
      : 'Offline · retrying';

  return (
    <KeyboardAvoidingView style={{ flex: 1 }} behavior="padding">
      <View style={{ flexDirection: 'row', alignItems: 'center', padding: 12, gap: 8, borderBottomWidth: 1, borderColor: p.line }}>
        <Btn small kind="ghost" label="‹ Back" onPress={props.onBack} />
        <View style={{ flex: 1 }}>
          <Text numberOfLines={1} style={{ color: p.text, fontSize: 17, fontWeight: '800' }}>{room.name}</Text>
          <Text numberOfLines={1} style={{ color: status === 'online' ? p.ok : p.warm, fontSize: 12 }}>{statusText}</Text>
        </View>
        <Btn small kind="ghost" label="Invite" onPress={() => shareRoom(room)} />
        <Btn small kind={inCall ? 'danger' : 'primary'} label={inCall ? 'End call' : 'Call'} onPress={toggleCall} />
      </View>

      <Text
        accessibilityRole="button"
        accessibilityLabel="Copy invite code"
        onPress={async () => {
          await Clipboard.setStringAsync(room.code).catch(() => {});
          setCopied(true);
          setTimeout(() => setCopied(false), 1500);
        }}
        style={{ color: p.sub, fontSize: 12, paddingHorizontal: 12, paddingVertical: 6 }}
      >
        Invite code: <Text style={{ color: p.text, fontWeight: '700' }}>{room.code}</Text> · {copied ? 'copied' : 'tap to copy'}
      </Text>

      {inCall ? (
        <View style={{ padding: 12, backgroundColor: p.cardAlt }}>
          <Text style={{ color: p.text, fontWeight: '700' }}>
            Translated call is on{peerInCall ? '' : ' — waiting for the other person to tap Call'}
          </Text>
          <Text style={{ color: p.sub, fontSize: 13, marginTop: 2 }}>
            {partial ? '🎙 ' + partial : 'Speak normally. They hear you in their language. Headphones give the best result.'}
          </Text>
        </View>
      ) : null}
      {error || mic.error ? <View style={{ paddingHorizontal: 12 }}><ErrorText>{error || mic.error}</ErrorText></View> : null}

      <FlatList
        ref={flat}
        data={list}
        keyExtractor={(m) => m.id}
        style={{ flex: 1 }}
        contentContainerStyle={{ padding: 12 }}
        onContentSizeChange={() => flat.current?.scrollToEnd({ animated: false })}
        ListEmptyComponent={
          <Text style={{ color: p.sub, textAlign: 'center', marginTop: 40, lineHeight: 22 }}>
            Send the invite code to the other person.{'\n'}You each write in your own language.
          </Text>
        }
        renderItem={({ item }) => {
          const main = item.mine ? item.text : item.translated ?? item.text;
          const showOrig = !item.mine && settings.showOriginal && item.translated && item.translated !== item.text;
          return (
            <View style={{ alignItems: item.mine ? 'flex-end' : 'flex-start', marginBottom: 10 }}>
              <View style={{ maxWidth: '85%', backgroundColor: item.mine ? p.accent : p.card, borderColor: p.line, borderWidth: item.mine ? 0 : 1, borderRadius: 16, padding: 10 }}>
                {!item.mine ? <Text style={{ color: p.sub, fontSize: 11, marginBottom: 2 }}>{item.name}{item.kind === 'call' ? ' · call' : ''}</Text> : null}
                <Text selectable style={{ color: item.mine ? p.accentText : p.text, fontSize: 16, lineHeight: 22 }}>{main}</Text>
                {showOrig ? <Text selectable style={{ color: p.sub, fontSize: 13, marginTop: 4 }}>{item.text}</Text> : null}
                {!item.mine && item.translated ? (
                  <Text style={{ color: p.sub, fontSize: 10, marginTop: 4 }} onPress={() => speak(item.translated as string, settings.myLang)}>
                    Translated · tap to listen
                  </Text>
                ) : null}
              </View>
            </View>
          );
        }}
      />

      {!inCall ? (
        <View style={{ flexDirection: 'row', gap: 8, alignItems: 'flex-end', padding: 12 }}>
          <Btn small kind={mic.listening ? 'warm' : 'ghost'} label={mic.listening ? 'Stop' : 'Mic'} onPress={() => (mic.listening ? mic.stop() : mic.start(settings.myLang))} />
          <TextInput
            value={mic.listening && partial ? (text ? text + ' ' : '') + partial : text}
            onChangeText={setText}
            placeholder="Message in your language"
            placeholderTextColor={p.sub}
            multiline
            style={[styles.input, { flex: 1, color: p.text, borderColor: p.line, backgroundColor: p.card, maxHeight: 110 }]}
          />
          <Btn label="Send" disabled={!text.trim()} onPress={() => { if (post('chat', text)) setText(''); }} />
        </View>
      ) : null}
    </KeyboardAvoidingView>
  );
}
