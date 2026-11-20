// Choosing which variety of a language to listen for and speak in.
import React, { useEffect, useState } from 'react';
import { Platform, Pressable, Text, View } from 'react-native';
import * as Speech from 'expo-speech';
import { ExpoSpeechRecognitionModule } from 'expo-speech-recognition';
import { Btn, Card, Label } from './ui';
import { usePalette } from '../theme';
import { updateSettings, useSettings } from '../store';
import { hasVariants, mergeVariants } from '../services/accents';
import { langName } from '../languages';
import { t } from '../i18n/t';

async function deviceLocales(): Promise<string[]> {
  const found = new Set<string>();
  try {
    const voices = await Speech.getAvailableVoicesAsync();
    for (const v of voices) if (v.language) found.add(v.language);
  } catch {
    // the voice list is not available everywhere
  }
  if (Platform.OS !== 'web') {
    try {
      const res: any = await (ExpoSpeechRecognitionModule as any).getSupportedLocales?.({});
      for (const key of ['locales', 'installedLocales']) for (const l of res?.[key] ?? []) found.add(l);
    } catch {
      // Android only, and only with a recognition service that answers
    }
  }
  return [...found];
}

export default function AccentCard() {
  const p = usePalette();
  const s = useSettings();
  const [locales, setLocales] = useState<string[]>([]);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let alive = true;
    deviceLocales().then((l) => alive && setLocales(l));
    return () => {
      alive = false;
    };
  }, []);

  // only the languages actually in play, so the list stays short
  const langs = [...new Set([s.myLang, s.targetLang, ...s.listenLanguages])].filter(hasVariants);
  if (!langs.length) return null;

  return (
    <Card>
      <Label>{t('Accent')}</Label>
      <Text style={{ color: p.sub, fontSize: 12, lineHeight: 18, marginBottom: 10 }}>
        {t('Which variety of a language to listen for and speak in. Picking the one that matches how you actually speak makes a real difference — a Nigerian speaking English is understood better as Nigerian English than as American.')}
      </Text>

      {langs.map((lang) => {
        const options = mergeVariants(lang, locales);
        const current = s.accents[lang] ?? options[0]?.code;
        const shown = expanded ? options : options.slice(0, 4);
        return (
          <View key={lang} style={{ marginBottom: 12 }}>
            <Text style={{ color: p.text, fontSize: 14, fontWeight: '700', marginBottom: 6 }}>{langName(lang)}</Text>
            <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: 6 }}>
              {shown.map((v) => {
                const on = v.code === current;
                const missing = v.installed === false;
                return (
                  <Pressable
                    key={v.code}
                    accessibilityRole="button"
                    accessibilityState={{ selected: on }}
                    accessibilityLabel={`${langName(lang)}, ${t(v.label)}`}
                    onPress={() => updateSettings({ accents: { ...s.accents, [lang]: v.code } })}
                    style={{
                      paddingVertical: 7,
                      paddingHorizontal: 11,
                      borderRadius: 999,
                      borderWidth: 1,
                      backgroundColor: on ? p.accent : p.cardAlt,
                      borderColor: on ? p.accent : p.line,
                      opacity: missing ? 0.55 : 1,
                    }}
                  >
                    <Text style={{ color: on ? p.accentText : p.text, fontWeight: '600', fontSize: 12 }}>
                      {t(v.label)}
                      {missing ? ' ·' : ''}
                    </Text>
                  </Pressable>
                );
              })}
            </View>
            {options.length > 4 ? (
              <Btn
                small
                kind="ghost"
                style={{ alignSelf: 'flex-start', marginTop: 6 }}
                label={expanded ? t('Fewer') : t('All {length}', { length: options.length })}
                onPress={() => setExpanded(!expanded)}
              />
            ) : null}
          </View>
        );
      })}

      {locales.length ? (
        <Text style={{ color: p.sub, fontSize: 11, lineHeight: 16 }}>
          {t('A dot means this phone has no voice or recogniser for that variety yet; Android can download more under language and speech settings.')}
        </Text>
      ) : null}
      <Text style={{ color: p.sub, fontSize: 11, lineHeight: 16, marginTop: 8 }}>
        {t('Speaking a language that is not your own is harder for any recogniser, and no setting fixes it: there is no model for Italian as spoken by a Nigerian, or Chinese as spoken by an Italian. Speak a little slower, keep the phone close, and correct the text before sending when it matters. In Chinese, Yoruba and other tonal languages the tone carries meaning, so a wrong tone is heard as a different word.')}
      </Text>
    </Card>
  );
}
