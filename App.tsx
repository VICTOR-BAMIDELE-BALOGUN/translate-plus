import React, { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import { loadStore, useStore, type Room } from './src/store';
import { usePalette } from './src/theme';
import TranslateScreen from './src/screens/TranslateScreen';
import TalkScreen from './src/screens/TalkScreen';
import CaptionsScreen from './src/screens/CaptionsScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import RoomScreen from './src/screens/RoomScreen';
import SettingsScreen from './src/screens/SettingsScreen';

// secure randomness for encryption nonces and invite codes
nacl.setPRNG((x, n) => {
  const bytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = bytes[i];
});

type Tab = 'translate' | 'talk' | 'captions' | 'chats' | 'settings';
const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'translate', label: 'Translate', glyph: 'Aあ' },
  { id: 'talk', label: 'Face to Face', glyph: '⇅' },
  { id: 'captions', label: 'Captions', glyph: '▤' },
  { id: 'chats', label: 'Chats', glyph: '✉' },
  { id: 'settings', label: 'Settings', glyph: '⚙' },
];

function Shell() {
  const p = usePalette();
  const { ready, settings } = useStore();
  const [tab, setTab] = useState<Tab>('translate');
  const [room, setRoom] = useState<Room | null>(null);

  useEffect(() => {
    loadStore();
  }, []);

  useEffect(() => {
    const sub = BackHandler.addEventListener('hardwareBackPress', () => {
      if (room) {
        setRoom(null);
        return true;
      }
      if (tab !== 'translate') {
        setTab('translate');
        return true;
      }
      return false;
    });
    return () => sub.remove();
  }, [room, tab]);

  const lightBar = settings.theme === 'light';

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={p.accent} />
      </View>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
      <StatusBar style={lightBar ? 'dark' : 'light'} />
      {tab === 'chats' && room ? (
        <RoomScreen key={room.code} room={room} onBack={() => setRoom(null)} />
      ) : (
        <>
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ color: p.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 }}>Translate</Text>
            <Text style={{ color: p.accent, fontSize: 24, fontWeight: '900' }}>+</Text>
            <Text style={{ color: p.sub, fontSize: 13, marginLeft: 10 }}>{TABS.find((t) => t.id === tab)?.label}</Text>
          </View>
          <View style={{ flex: 1 }}>
            {tab === 'translate' ? <TranslateScreen /> : null}
            {tab === 'talk' ? <TalkScreen /> : null}
            {tab === 'captions' ? <CaptionsScreen /> : null}
            {tab === 'chats' ? <ChatsScreen onOpen={setRoom} /> : null}
            {tab === 'settings' ? <SettingsScreen /> : null}
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: p.line, backgroundColor: p.card }}>
            {TABS.map((t) => {
              const on = t.id === tab;
              return (
                <Pressable
                  key={t.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t.label}
                  onPress={() => setTab(t.id)}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 8 }}
                >
                  <Text style={{ color: on ? p.accent : p.sub, fontSize: 18, fontWeight: '800' }}>{t.glyph}</Text>
                  <Text numberOfLines={1} style={{ color: on ? p.accent : p.sub, fontSize: 10, fontWeight: '700', marginTop: 2 }}>{t.label}</Text>
                </Pressable>
              );
            })}
          </View>
        </>
      )}
    </SafeAreaView>
  );
}

export default function App() {
  return (
    <SafeAreaProvider>
      <Shell />
    </SafeAreaProvider>
  );
}
