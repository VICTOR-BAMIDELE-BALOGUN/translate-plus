import React, { useEffect, useState } from 'react';
import { ActivityIndicator, BackHandler, Linking, Platform, Pressable, Text, View } from 'react-native';
import { StatusBar } from 'expo-status-bar';
import { SafeAreaProvider, SafeAreaView } from 'react-native-safe-area-context';
import * as Crypto from 'expo-crypto';
import nacl from 'tweetnacl';
import { loadStore, useStore, type Room } from './src/store';
import { cssVariables, usePalette } from './src/theme';
import { Ambient, raised } from './src/components/ui';
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
    // the theme's tokens as CSS custom properties, plus keyboard focus and reduced motion
    const root = document.documentElement;
    for (const [k, v] of Object.entries(cssVariables(p))) root.style.setProperty(k, String(v));
    let tag = document.getElementById('tp-theme');
    if (!tag) {
      tag = document.createElement('style');
      tag.id = 'tp-theme';
      tag.textContent =
        '[role=button]:focus-visible,[role=tab]:focus-visible,[role=radio]:focus-visible,[role=switch]:focus-visible,input:focus-visible,textarea:focus-visible' +
        '{outline:3px solid var(--tp-focus);outline-offset:2px}' +
        '@media (prefers-reduced-motion: reduce){*{transition:none!important;animation:none!important;scroll-behavior:auto!important}}';
      document.head.appendChild(tag);
    }
  }, [p]);

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
        <Ambient />
        <StatusBar style={lightBar ? 'dark' : 'light'} />
        {languageBar}
        <GuestScreen key={ui.lang} invite={invite} />
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
      <Ambient />
      <StatusBar style={lightBar ? 'dark' : 'light'} />
      {tab === 'chats' && room ? (
        <RoomScreen key={room.code} room={room} onBack={() => setRoom(null)} />
      ) : (
        <>
          {languageBar}
          <InstallBanner />
          <View style={{ paddingHorizontal: 16, paddingTop: 12, paddingBottom: 8, flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <View
              style={[
                {
                  width: 34, height: 34, borderRadius: Math.min(12, p.radius / 2), alignItems: 'center', justifyContent: 'center',
                  backgroundColor: p.accent, borderWidth: p.border, borderColor: p.accent,
                },
                { backgroundImage: `linear-gradient(135deg, ${p.accent} 0%, ${p.accent2} 100%)` } as object,
              ]}
            >
              <Text style={{ color: p.accentText, fontSize: 20, fontWeight: '900', marginTop: -2 }}>+</Text>
            </View>
            <View style={{ flex: 1 }}>
              <Text accessibilityRole="header" style={{ color: p.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.4 }}>
                {t('Translate')}<Text style={{ color: p.accent }}>+</Text>
              </Text>
              <Text style={{ color: p.sub, fontSize: 12, fontWeight: '600' }}>{t(TABS.find((x) => x.id === tab)?.label ?? '')}</Text>
            </View>
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
          <View
            accessibilityRole="tablist"
            style={[
              { flexDirection: 'row', marginHorizontal: 10, marginBottom: 8, marginTop: 4, padding: 4, gap: 2 },
              { backgroundColor: p.nav, borderColor: p.line, borderWidth: p.border, borderRadius: p.radius + 2 },
              raised(p),
            ]}
          >
            {TABS.map((tab_) => {
              const on = tab_.id === tab;
              return (
                <Pressable
                  key={tab_.id}
                  accessibilityRole="tab"
                  accessibilityState={{ selected: on }}
                  accessibilityLabel={t(tab_.label)}
                  onPress={() => setTab(tab_.id)}
                  style={({ pressed }) => ({
                    flex: 1, alignItems: 'center', justifyContent: 'center', minHeight: 54, paddingVertical: 6, paddingHorizontal: 1,
                    borderRadius: Math.max(10, p.radius - 4),
                    backgroundColor: on ? p.cardAlt : 'transparent',
                    borderWidth: on ? p.border : 0,
                    borderColor: on ? p.accent : 'transparent',
                    opacity: pressed ? 0.75 : 1,
                  })}
                >
                  <Text style={{ color: on ? p.accent : p.sub, fontSize: 18, fontWeight: '800' }}>{tab_.glyph}</Text>
                  <Text numberOfLines={1} style={{ color: on ? p.text : p.sub, fontSize: 10, fontWeight: on ? '800' : '600', marginTop: 2 }}>{t(tab_.label)}</Text>
                  {/* a bar under the active tab, so selection is not shown by colour alone */}
                  <View style={{ height: 3, width: on ? 18 : 0, borderRadius: 2, backgroundColor: p.accent, marginTop: 3 }} />
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
