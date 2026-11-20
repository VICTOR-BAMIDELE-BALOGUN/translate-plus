// Installing from the web, with no app store. Android fires a prompt we can trigger;
// iOS has no such event, so it gets the Share-menu instructions instead.
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import { usePalette } from '../theme';
import { t, tk } from '../i18n/t';

type Choice = { prompt: () => void; userChoice: Promise<{ outcome: string }> };

let deferred: Choice | null = null;
let notify: (() => void) | null = null;

if (Platform.OS === 'web' && typeof window !== 'undefined') {
  window.addEventListener('beforeinstallprompt', (e: any) => {
    e.preventDefault();
    deferred = e;
    notify?.();
  });
  window.addEventListener('appinstalled', () => {
    deferred = null;
    notify?.();
  });
}

export function isStandalone(): boolean {
  if (Platform.OS !== 'web' || typeof window === 'undefined') return false;
  const nav = window.navigator as any;
  return (
    nav.standalone === true ||
    (typeof window.matchMedia === 'function' && window.matchMedia('(display-mode: standalone)').matches)
  );
}

export function isApplePhone(): boolean {
  if (Platform.OS !== 'web' || typeof navigator === 'undefined') return false;
  const ua = navigator.userAgent || '';
  return /iPad|iPhone|iPod/.test(ua) || (/Macintosh/.test(ua) && (navigator as any).maxTouchPoints > 1);
}

/** 'prompt' = a one-tap install is ready, 'manual' = show the Share-menu steps, 'none' = nothing to do. */
export function useInstallState(): 'prompt' | 'manual' | 'none' {
  const [, bump] = useState(0);
  useEffect(() => {
    notify = () => bump((n) => n + 1);
    return () => {
      notify = null;
    };
  }, []);
  if (Platform.OS !== 'web' || isStandalone()) return 'none';
  if (deferred) return 'prompt';
  return isApplePhone() ? 'manual' : 'none';
}

export async function runInstall(): Promise<void> {
  if (!deferred) return;
  const choice = deferred;
  choice.prompt();
  try {
    await choice.userChoice;
  } catch {}
  deferred = null;
  notify?.();
}

export const IOS_STEPS = tk('In Safari, tap the Share button, then "Add to Home Screen".');

export function InstallBanner() {
  const p = usePalette();
  const state = useInstallState();
  const [hidden, setHidden] = useState(false);
  if (state === 'none' || hidden) return null;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 10, paddingHorizontal: 14, paddingVertical: 10, backgroundColor: p.cardAlt, borderBottomWidth: 1, borderColor: p.line }}>
      <Text style={{ color: p.text, flex: 1, fontSize: 13, lineHeight: 18 }}>
        {state === 'prompt' ? t('Add Translate+ to your home screen so it opens like an app.') : t(IOS_STEPS)}
      </Text>
      {state === 'prompt' ? (
        <Pressable accessibilityRole="button" onPress={runInstall} style={{ backgroundColor: p.accent, paddingVertical: 8, paddingHorizontal: 12, borderRadius: 10 }}>
          <Text style={{ color: p.accentText, fontWeight: '800', fontSize: 13 }}>{t('Install')}</Text>
        </Pressable>
      ) : null}
      <Pressable accessibilityRole="button" accessibilityLabel={t('Dismiss')} onPress={() => setHidden(true)} style={{ padding: 6 }}>
        <Text style={{ color: p.sub, fontSize: 16 }}>✕</Text>
      </Pressable>
    </View>
  );
}
