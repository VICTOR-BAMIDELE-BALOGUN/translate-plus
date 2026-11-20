import React, { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import { loadStore, useStore, type Room } from './src/store';
import { usePalette } from './src/theme';
import TranslateScreen from './src/screens/TranslateScreen';
import TalkScreen from './src/screens/TalkScreen';
import CaptionsScreen from './src/screens/CaptionsScreen';
import ImageScreen from './src/screens/ImageScreen';
import LearnScreen from './src/screens/LearnScreen';
import ChatsScreen from './src/screens/ChatsScreen';
import RoomScreen from './src/screens/RoomScreen';
import SettingsScreen from './src/screens/SettingsScreen';
import GuestScreen from './src/screens/GuestScreen';
import { currentInvite, type Invite } from './src/invite';
import { InstallBanner } from './src/components/InstallPrompt';
import { parseShareLink } from './src/share';
import { t, tk } from './src/i18n/t';
import { useUiLanguage } from './src/i18n';

// secure randomness for encryption nonces and invite codes
nacl.setPRNG((x, n) => {
  const bytes = Crypto.getRandomBytes(n);
  for (let i = 0; i < n; i++) x[i] = bytes[i];
});

type Tab = 'translate' | 'talk' | 'captions' | 'image' | 'learn' | 'chats' | 'settings';
const TABS: { id: Tab; label: string; glyph: string }[] = [
  { id: 'translate', label: tk('Translate'), glyph: 'Aあ' },
  { id: 'talk', label: tk('Face'), glyph: '⇅' },
  { id: 'captions', label: tk('Captions'), glyph: '▤' },
  { id: 'image', label: tk('Photo'), glyph: '◳' },
  { id: 'learn', label: tk('Learn'), glyph: '✱' },
  { id: 'chats', label: tk('Chats'), glyph: '✉' },
  { id: 'settings', label: tk('Settings'), glyph: '⚙' },
];

function Shell() {
  const p = usePalette();
  const { ready, settings } = useStore();
  const [tab, setTab] = useState<Tab>('translate');
  const [room, setRoom] = useState<Room | null>(null);
  const [invite] = useState<Invite | null>(() => currentInvite());
  // text selected or shared in another app ("Translate+" in its menu)
  const [shared, setShared] = useState<{ text: string; n: number } | null>(null);
  // the app's own language: everything below re-renders when it changes
  const ui = useUiLanguage();

  useEffect(() => {
    loadStore();
  }, []);

  useEffect(() => {
    if (Platform.OS === 'web') return;
    const take = (url: string | null | undefined) => {
      const text = parseShareLink(url);
      if (!text) return;
      setRoom(null);
      setTab('translate');
      setShared((v) => ({ text, n: (v?.n ?? 0) + 1 }));
    };
    Linking.getInitialURL().then(take).catch(() => {});
    const sub = Linking.addEventListener('url', (e) => take(e.url));
    return () => sub.remove();
  }, []);

  // on the web the page itself sits behind the app: keep it, and the browser's own
  // chrome on an installed app, in the theme's colours
  useEffect(() => {
    if (Platform.OS !== 'web' || typeof document === 'undefined') return;
    document.body.style.backgroundColor = p.bg;
    const meta = document.querySelector('meta[name="theme-color"]');
    if (meta) meta.setAttribute('content', p.bg);
  }, [p.bg]);

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

  const lightBar = p.mode === 'light';

  // shown above every screen while the app's language is being prepared, or if that failed
  const languageBar =
    !ui.ready || ui.error || ui.rtlRestart ? (
      <View style={{ paddingHorizontal: 16, paddingVertical: 8, backgroundColor: p.cardAlt, borderBottomWidth: 1, borderColor: p.line }}>
        {!ui.ready ? (
          <Text style={{ color: p.sub, fontSize: 13 }}>
            {t('Translating the app into your language… {percent}%', { percent: Math.round(ui.progress * 100) })}
          </Text>
        ) : ui.error ? (
          <Text style={{ color: p.danger, fontSize: 13 }} onPress={ui.retry}>
            {t(ui.error)} {t('Tap to try again.')}
          </Text>
        ) : (
          <Text style={{ color: p.sub, fontSize: 13 }}>
            {t('Close and reopen Translate+ to switch the layout to right-to-left.')}
          </Text>
        )}
      </View>
    ) : null;

  if (!ready) {
    return (
      <View style={{ flex: 1, backgroundColor: p.bg, alignItems: 'center', justifyContent: 'center' }}>
        <ActivityIndicator color={p.accent} />
      </View>
    );
  }

  // opened from a shared call link: show only the guest conversation
  if (invite) {
    return (
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
        <StatusBar style={lightBar ? 'dark' : 'light'} />
        {languageBar}
        <GuestScreen key={ui.lang} invite={invite} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
      <StatusBar style={lightBar ? 'dark' : 'light'} />
      {tab === 'chats' && room ? (
        <RoomScreen key={room.code} room={room} onBack={() => setRoom(null)} />
      ) : (
        <>
          {languageBar}
          <InstallBanner />
          <View style={{ paddingHorizontal: 16, paddingTop: 10, paddingBottom: 6, flexDirection: 'row', alignItems: 'baseline' }}>
            <Text style={{ color: p.text, fontSize: 24, fontWeight: '900', letterSpacing: -0.5 }}>{t('Translate')}</Text>
            <Text style={{ color: p.accent, fontSize: 24, fontWeight: '900' }}>+</Text>
            <Text style={{ color: p.sub, fontSize: 13, marginLeft: 10 }}>{t(TABS.find((x) => x.id === tab)?.label ?? '')}</Text>
          </View>
          <View key={ui.lang} style={{ flex: 1 }}>
            {tab === 'translate' ? <TranslateScreen shared={shared} /> : null}
            {tab === 'talk' ? <TalkScreen /> : null}
            {tab === 'captions' ? <CaptionsScreen /> : null}
            {tab === 'image' ? <ImageScreen /> : null}
            {tab === 'learn' ? <LearnScreen /> : null}
            {tab === 'chats' ? <ChatsScreen onOpen={setRoom} /> : null}
            {tab === 'settings' ? <SettingsScreen /> : null}
          </View>
          <View style={{ flexDirection: 'row', borderTopWidth: 1, borderColor: p.line, backgroundColor: p.card }}>
            {TABS.map((tab_) => {
              const on = tab_.id === tab;
              return (
                <Pressable
                  key={tab_.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t(tab_.label)}
                  onPress={() => setTab(tab_.id)}
                  style={{ flex: 1, alignItems: 'center', paddingVertical: 8, paddingHorizontal: 2 }}
                >
                  <Text style={{ color: on ? p.accent : p.sub, fontSize: 18, fontWeight: '800' }}>{tab_.glyph}</Text>
                  <Text numberOfLines={1} style={{ color: on ? p.accent : p.sub, fontSize: 10, fontWeight: '700', marginTop: 2 }}>{t(tab_.label)}</Text>
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
