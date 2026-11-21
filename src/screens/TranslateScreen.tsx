import React, { useEffect, useRef, useState } from 'react';
import { Pressable, ScrollView, Text, TextInput, View, useWindowDimensions } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Badge, Btn, Card, Choice, ErrorText, Label, LangButton, styles, surface } from '../components/ui';
import { usePalette } from '../theme';
import { addHistory, saveCard, updateSettings, useStore } from '../store';
import { isSaved } from '../learn/review';
import { translate } from '../services/translator';
import { speak, stopSpeaking } from '../services/tts';
import { useListener } from '../services/listen';
import { langName } from '../languages';
import { hasRegister, type Detected } from '../services/register';
import { detect } from '../services/detect';
import { t, tk } from '../i18n/t';

// shown before anything is typed: tapping one translates it straight away
const STARTERS = [
  tk('Could you recommend a quiet place for dinner?'),
  tk('Where is the nearest pharmacy?'),
  tk('How much does this cost?'),
  tk('Could you speak a little more slowly, please?'),
  tk('I have a reservation under this name.'),
  tk('Which bus goes to the city centre?'),
];

const TIPS = [
  tk('Short, complete sentences translate more accurately than long ones.'),
  tk('Choose Formal when you speak to officials, landlords or people you do not know.'),
  tk('Tap ⇄ to swap languages and read the reply in your own language.'),
  tk('Tap Listen, then repeat after the voice to practise the pronunciation.'),
  tk('Save a phrase with ☆ and it comes back in Learn → Review until you know it.'),
  tk('Check numbers, dates and names twice before you rely on a translation.'),
];

/** A different tip each day. */
function tipOfTheDay(): string {
  const day = Math.floor(Date.now() / 86_400_000);
  return TIPS[day % TIPS.length];
}

export default function TranslateScreen({ shared }: { shared?: { text: string; n: number } | null }) {
  const p = usePalette();
  const { settings, history, cards } = useStore();
  const { width } = useWindowDimensions();
  const [from, setFrom] = useState('auto');
  // text shared from another app that is already in the target language is translated
  // into my own language instead, without changing the target for everything else
  const [sharedTo, setSharedTo] = useState<string | null>(null);
  const to = sharedTo ?? settings.targetLang;
  const [text, setText] = useState('');
  const [result, setResult] = useState('');
  const [detected, setDetected] = useState<string | undefined>();
  const [offline, setOffline] = useState(false);
  const [mixed, setMixed] = useState<string[]>([]);
  const [gotRegister, setGotRegister] = useState<Detected | undefined>();
  const [fixedRegister, setFixedRegister] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const [saveNote, setSaveNote] = useState<string | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const seq = useRef(0);
  const base = useRef('');

  // text sent from another app: translate it straight away (n changes for each new share)
  const sharedN = useRef(0);
  useEffect(() => {
    if (!shared || shared.n === sharedN.current) return;
    sharedN.current = shared.n;
    const lang = (c: string) => c.split('-')[0];
    const guess = detect(shared.text, [settings.targetLang, settings.myLang]);
    if (guess && lang(guess) === lang(settings.targetLang) && lang(settings.myLang) !== lang(settings.targetLang)) {
      setFrom(settings.targetLang);
      setSharedTo(settings.myLang);
    } else {
      setFrom('auto');
      setSharedTo(null);
    }
    base.current = shared.text;
    setText(shared.text);
  }, [shared]);

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
        setMixed(out.languages ?? []);
        setGotRegister(out.register);
        setFixedRegister(!!out.registerCorrected);
        setError(null);
      } catch (e) {
        if (mine === seq.current) setError(e instanceof Error ? e.message : t('Translation failed'));
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
    setSharedTo(null);
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
    setSharedTo(null);
    save();
    setText('');
    base.current = '';
  };

  const sourcePane = (
    // before anything is typed the input is smaller, leaving room for the phrase ideas
    <Card style={{ flex: !sideBySide && !text.trim() && !result ? 0.62 : 1, marginBottom: sideBySide ? 0 : 10, marginRight: sideBySide ? 5 : 0 }}>
      <Label>
        {from === 'auto'
          ? mixed.length > 1
            ? t('Detected: {lang}', { lang: mixed.map(langName).join(' + ') })
            : detected && text.trim()
            ? t('Detected: {lang}', { lang: langName(detected) })
            : t('Detect language')
          : langName(from)}
      </Label>
      <TextInput
        value={text}
        onChangeText={(t) => {
          setText(t);
          base.current = t;
        }}
        placeholder={t('Type or tap the mic and speak')}
        placeholderTextColor={p.sub}
        multiline
        scrollEnabled
        style={{ color: p.text, fontSize: 17, flex: 1, textAlignVertical: 'top', minHeight: 60 }}
      />
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Btn small kind={mic.listening ? 'warm' : 'primary'} label={mic.listening ? t('Stop') : t('Speak')} onPress={toggleMic} />
        <Btn small kind="ghost" label={t('Clear')} onPress={clearAll} disabled={!text} />
      </View>
      <ErrorText>{mic.error}</ErrorText>
    </Card>
  );

  const resultPane = (
    <Card reading style={{ flex: 1, marginBottom: 0, marginLeft: sideBySide ? 5 : 0 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', flexWrap: 'wrap', gap: 6, marginBottom: 8 }}>
        <Text style={{ color: p.accent, fontSize: 12, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase', marginRight: 2 }}>
          {langName(to)}
        </Text>
        {busy ? <Badge tone="muted" label={t('translating…')} /> : null}
        {!busy && offline && result ? <Badge tone="muted" label={t('on device')} /> : null}
        {!busy && result && gotRegister && gotRegister !== 'unknown' ? (
          <Badge
            tone="ok"
            label={(gotRegister === 'formal' ? t('Polite, formal phrasing') : t('Friendly, informal phrasing')) + (fixedRegister ? ' ' + t('(adjusted)') : '')}
          />
        ) : null}
      </View>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 4 }}>
        <Text selectable style={{ color: p.text, fontSize: 19, lineHeight: 27 }}>{result}</Text>
        <ErrorText>{error}</ErrorText>
      </ScrollView>
      <View style={{ flexDirection: 'row', gap: 8, marginTop: 8 }}>
        <Btn small label={t('Listen')} disabled={!result} onPress={() => { stopSpeaking(); speak(result, to); save(); }} />
        <Btn
          small
          kind="ghost"
          label={copied ? t('Copied') : t('Copy')}
          disabled={!result}
          onPress={async () => {
            await Clipboard.setStringAsync(result);
            setCopied(true);
            save();
            setTimeout(() => setCopied(false), 1500);
          }}
        />
        <Btn
          small
          kind="ghost"
          label={result && (isSaved(cards, result, to) || isSaved(cards, text, detected || from)) ? t('★ Saved') : t('☆ Save')}
          disabled={!result || busy}
          onPress={() => {
            const ok = saveCard(text, from === 'auto' ? detected || 'auto' : from, result, to);
            save();
            setSaveNote(ok ? t('Saved to Learn → Review.') : t('Already saved, or both sides are in your own language.'));
            setTimeout(() => setSaveNote(null), 2500);
          }}
        />
      </View>
      {saveNote ? <Text style={{ color: p.sub, fontSize: 12, marginTop: 6 }}>{saveNote}</Text> : null}
    </Card>
  );

  const starters = (
    <View style={[{ flex: 1, marginLeft: sideBySide ? 5 : 0, overflow: 'hidden' }, surface(p)]}>
      <ScrollView contentContainerStyle={{ padding: 16 }}>
        <Text accessibilityRole="header" style={{ color: p.text, fontSize: 22, fontWeight: '900', letterSpacing: -0.3 }}>
          {t('Say it with confidence.')}
        </Text>
        <Text style={{ color: p.sub, fontSize: 14, marginTop: 4, lineHeight: 20 }}>
          {t('Type, speak, or tap a phrase to hear it in {lang}.', { lang: langName(to) })}
        </Text>

        <Text style={{ color: p.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', marginTop: 16, marginBottom: 8 }}>
          {t('Useful travel phrases')}
        </Text>
        {STARTERS.map((phrase) => (
          <Pressable
            key={phrase}
            accessibilityRole="button"
            accessibilityHint={t('Translates this phrase')}
            onPress={() => {
              setText(t(phrase));
              base.current = t(phrase);
            }}
            style={({ pressed }) => ({
              flexDirection: 'row', alignItems: 'center', gap: 10, minHeight: 48, paddingVertical: 10, paddingHorizontal: 12, marginBottom: 6,
              borderRadius: Math.max(10, p.radius - 8), borderWidth: p.border, borderColor: p.line,
              backgroundColor: pressed ? p.card : p.cardAlt,
            })}
          >
            <Text style={{ color: p.accent, fontSize: 16, fontWeight: '800' }}>›</Text>
            <Text style={{ color: p.text, fontSize: 15, flex: 1 }}>{t(phrase)}</Text>
          </Pressable>
        ))}

        <View
          style={{
            marginTop: 12, padding: 14, borderRadius: Math.max(10, p.radius - 6),
            borderWidth: p.border, borderColor: p.accent2, backgroundColor: p.cardAlt,
            borderLeftWidth: 4, borderLeftColor: p.accent2,
          }}
        >
          <Text style={{ color: p.text, fontSize: 12, fontWeight: '800', letterSpacing: 0.9, textTransform: 'uppercase' }}>💡 {t('Language tip')}</Text>
          <Text style={{ color: p.text, fontSize: 14, marginTop: 4, lineHeight: 20 }}>{t(tipOfTheDay())}</Text>
        </View>
      </ScrollView>
    </View>
  );

  return (
    <View style={{ flex: 1, padding: 16, paddingTop: 8 }}>
      <View style={{ flexDirection: 'row', gap: 8, alignItems: 'center', marginBottom: 8 }}>
        <LangButton caption={t('From')} code={from} onChange={setFrom} allowAuto />
        <Btn small kind="ghost" label="⇄" onPress={swap} />
        <LangButton caption={t('To')} code={to} onChange={(c) => {
            setSharedTo(null);
            updateSettings({ targetLang: c });
          }}
        />
      </View>

      <View style={{ flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', flexWrap: 'wrap', gap: 8, marginBottom: 8 }}>
        {hasRegister(to) ? (
          <Choice
            value={settings.register}
            onChange={(v) => updateSettings({ register: v })}
            options={[
              { value: 'auto', label: t('Auto') },
              { value: 'formal', label: t('Formal') },
              { value: 'informal', label: t('Informal') },
            ]}
          />
        ) : (
          <View />
        )}
        <Choice
          value={settings.paneLayout}
          onChange={(v) => updateSettings({ paneLayout: v })}
          options={[
            { value: 'stacked', label: t('Stacked') },
            { value: 'side', label: t('Side by side') },
          ]}
        />
      </View>
      {settings.paneLayout === 'side' && !sideBySide ? (
        <Text style={{ color: p.sub, fontSize: 12, marginBottom: 8 }}>
          {t('Not enough width for two columns — turn the phone sideways, or use a bigger screen.')}
        </Text>
      ) : null}

      <View style={{ flex: 1, flexDirection: sideBySide ? 'row' : 'column' }}>
        {sourcePane}
        {text.trim() || result || error ? resultPane : starters}
      </View>

      {from === 'auto' && mic.listening ? (
        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6 }}>{t('Mic listens in {lang}. Pick a "From" language to dictate another one.', { lang: langName(settings.myLang) })}</Text>
      ) : null}

      {history.length > 0 ? (
        <View style={{ marginTop: 10 }}>
          <Pressable accessibilityRole="button" onPress={() => setShowHistory(!showHistory)}>
            <Text style={{ color: p.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase' }}>{t('Recent ({length}) {n}', { length: history.length, n: showHistory ? '▾' : '▸' })}</Text>
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
