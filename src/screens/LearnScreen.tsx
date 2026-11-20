// Preloaded course material. Everything here ships with the app and works offline.
import React, { useEffect, useMemo, useRef, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Btn, Card, Choice, Label, styles } from '../components/ui';
import { usePalette } from '../theme';
import { deleteCard, gradeCard, toggleCard, useStore } from '../store';
import { speak, stopSpeaking } from '../services/tts';
import { useListener } from '../services/listen';
import { availablePacks, packFor, searchPack, type Phrase } from '../learn';
import { useLocalizedPack } from '../learn/localize';
import { dueCards, isSaved, type Card as SavedCard } from '../learn/review';
import { scorePronunciation, verdict, type Score } from '../learn/score';
import { langName } from '../languages';
import { t } from '../i18n/t';

type Section = 'phrases' | 'review' | 'sounds' | 'notes' | 'resources';

function when(ms: number): string {
  const mins = Math.round((ms - Date.now()) / 60000);
  if (mins < 60) return mins <= 1 ? t('in a minute') : t('in {count} minutes', { count: mins });
  const hours = Math.round(mins / 60);
  if (hours < 24) return hours === 1 ? t('in an hour') : t('in {count} hours', { count: hours });
  const days = Math.round(hours / 24);
  return days === 1 ? t('tomorrow') : t('in {count} days', { count: days });
}

export default function LearnScreen() {
  const p = usePalette();
  const { settings: s, cards } = useStore();
  const packs = availablePacks();
  // the language being learnt is normally the one being translated into
  const [lang, setLang] = useState(() => (packFor(s.targetLang) ? s.targetLang : packs[0]?.lang) ?? 'it');
  // explanations in the app's language; the phrases themselves stay as they are
  const { pack, translating } = useLocalizedPack(packFor(lang) ?? packs[0]);
  const [section, setSection] = useState<Section>('phrases');
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hide, setHide] = useState(false); // practice: cover the Italian
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState('');
  const [practiceOpen, setPracticeOpen] = useState<string | null>(null);

  const hits = useMemo(() => (pack ? searchPack(pack, query) : []), [pack, query]);

  // ---- pronunciation check: one listener for the whole screen ----
  const [practising, setPractising] = useState<{ key: string; text: string } | null>(null);
  const [heard, setHeard] = useState('');
  const [scores, setScores] = useState<Record<string, Score>>({});
  const target = useRef<{ key: string; text: string } | null>(null);
  const giveUp = useRef<ReturnType<typeof setTimeout> | null>(null);
  const mic = useListener({
    onPartial: (t) => setHeard(t),
    onFinal: (t) => {
      const want = target.current;
      if (!want) return;
      setScores((all) => ({ ...all, [want.key]: scorePronunciation(want.text, t) }));
      finishPractice();
    },
  });
  const finishPractice = () => {
    if (giveUp.current) clearTimeout(giveUp.current);
    target.current = null;
    setPractising(null);
    setHeard('');
    mic.stop();
  };
  const practise = async (key: string, text: string, lang: string) => {
    if (practising?.key === key) return finishPractice();
    stopSpeaking();
    target.current = { key, text };
    setPractising({ key, text });
    setHeard('');
    setScores((all) => {
      const rest = { ...all };
      delete rest[key];
      return rest;
    });
    const ok = await mic.start(lang);
    if (!ok) return finishPractice();
    if (giveUp.current) clearTimeout(giveUp.current);
    giveUp.current = setTimeout(finishPractice, 12000);
  };
  useEffect(
    () => () => {
      if (giveUp.current) clearTimeout(giveUp.current);
    },
    []
  );

  // ---- review ----
  const [now, setNow] = useState(() => Date.now());
  const [showAnswer, setShowAnswer] = useState(false);
  useEffect(() => {
    if (section !== 'review') return;
    setNow(Date.now());
    const t = setInterval(() => setNow(Date.now()), 30000);
    return () => clearInterval(t);
  }, [section]);
  const mine = cards.filter((c) => !pack || c.lang.split('-')[0] === pack.lang);
  const due = dueCards(mine, now);
  const current: SavedCard | undefined = due[0];
  const nextDue = mine.length ? Math.min(...mine.map((c) => c.due)) : 0;

  if (!pack) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: p.sub }}>{t('No course material is bundled yet.')}</Text>
      </View>
    );
  }

  const say = (phrase: Phrase) => {
    stopSpeaking();
    speak(phrase.it, pack.lang, { native: true }); // a cloned voice keeps its owner's accent
  };

  const copy = async (phrase: Phrase) => {
    await Clipboard.setStringAsync(phrase.it);
    setCopied(phrase.it);
    setTimeout(() => setCopied(''), 1200);
  };

  const sayIt = (key: string, text: string, lang: string) => {
    const on = practising?.key === key;
    const score = scores[key];
    return (
      <View style={{ marginTop: 6 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Btn small kind={on ? 'warm' : 'ghost'} label={on ? t('Listening… tap to stop') : t('🎤 Say it')} onPress={() => practise(key, text, lang)} />
          {score ? (
            <Text style={{ color: score.percent >= 70 ? p.ok : score.percent >= 40 ? p.warm : p.danger, fontSize: 13, fontWeight: '800' }}>
              {score.percent}% · {verdict(score.percent)}
            </Text>
          ) : null}
        </View>
        {on && heard ? <Text style={{ color: p.sub, fontSize: 13, marginTop: 4 }}>{heard}</Text> : null}
        {mic.error ? <Text style={{ color: p.danger, fontSize: 12, marginTop: 4 }}>{mic.error}</Text> : null}
        {score && !on ? (
          <View style={{ marginTop: 4 }}>
            <Text style={{ fontSize: 16, lineHeight: 23 }}>
              {score.words.map((w, i) => (
                <Text
                  key={i}
                  style={{
                    color: w.mark === 'ok' ? p.ok : w.mark === 'close' ? p.warm : p.danger,
                    fontWeight: '700',
                    textDecorationLine: w.mark === 'missed' ? 'underline' : 'none',
                  }}
                >
                  {w.word}{' '}
                </Text>
              ))}
            </Text>
            <Text style={{ color: p.sub, fontSize: 12, marginTop: 2 }}>
              {score.heard ? t('Heard: "{heard}". ', { heard: score.heard }) : t('Nothing was heard. ')}{t('Green is right, orange nearly, red missed.')}
            </Text>
          </View>
        ) : null}
      </View>
    );
  };

  const renderPhrase = (phrase: Phrase, key: string) => {
    const covered = hide && !revealed[key];
    const saved = isSaved(cards, phrase.it, pack.lang);
    const expanded = practiceOpen === key || practising?.key === key || !!scores[key];
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityLabel={`${phrase.it}. ${phrase.en}. ${t('Tap to hear it.')}`}
        onPress={() => (covered ? setRevealed((r) => ({ ...r, [key]: true })) : say(phrase))}
        onLongPress={() => copy(phrase)}
        style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: p.line }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: covered ? p.sub : p.text, fontSize: 17, fontWeight: '700', flex: 1 }}>
            {covered ? t('Tap to show') : phrase.it}
          </Text>
          {phrase.formal ? (
            <Text style={{ color: p.warm, fontSize: 10, fontWeight: '800' }}>{t('LEI')}</Text>
          ) : null}
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={saved ? t('Remove from my phrases') : t('Save to my phrases')}
            hitSlop={10}
            onPress={() => toggleCard(phrase.en, phrase.it, pack.lang)}
          >
            <Text style={{ color: saved ? p.warm : p.sub, fontSize: 18 }}>{saved ? '★' : '☆'}</Text>
          </Pressable>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('Practise saying it')}
            hitSlop={10}
            onPress={() => setPracticeOpen(practiceOpen === key ? null : key)}
          >
            <Text style={{ fontSize: 15 }}>🎤</Text>
          </Pressable>
          <Text style={{ color: p.accent, fontSize: 15 }}>▶</Text>
        </View>
        <Text style={{ color: p.sub, fontSize: 14, marginTop: 2 }}>{phrase.en}</Text>
        {!covered ? <Text style={{ color: p.sub, fontSize: 12, marginTop: 1, fontStyle: 'italic' }}>{phrase.say}</Text> : null}
        {copied === phrase.it ? <Text style={{ color: p.ok, fontSize: 11, marginTop: 2 }}>{t('Copied')}</Text> : null}
        {!covered && expanded ? sayIt(key, phrase.it, pack.lang) : null}
      </Pressable>
    );
  };

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      {packs.length > 1 ? (
        <View style={{ marginBottom: 10 }}>
          <Choice value={lang} onChange={setLang} options={packs.map((x) => ({ value: x.lang, label: x.name }))} />
        </View>
      ) : null}

      <Text style={{ color: p.text, fontSize: 20, fontWeight: '800' }}>{t('Learn {name}', { name: langName(pack.lang) })}</Text>
      <Text style={{ color: p.sub, fontSize: 13, lineHeight: 20, marginTop: 4, marginBottom: 12 }}>{pack.intro}</Text>
      {translating ? <Text style={{ color: p.sub, fontSize: 12, marginBottom: 10 }}>{t('Translating the explanations into your language…')}</Text> : null}

      <Choice
        value={section}
        onChange={(v) => setSection(v)}
        options={[
          { value: 'phrases', label: t('Phrases') },
          { value: 'review', label: due.length ? t('Review · {length}', { length: due.length }) : t('Review') },
          { value: 'sounds', label: t('Sounds') },
          { value: 'notes', label: t('Notes') },
          { value: 'resources', label: t('Free courses') },
        ]}
      />
      <View style={{ height: 12 }} />

      {section === 'phrases' ? (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('Search the phrasebook')}
            placeholderTextColor={p.sub}
            style={[styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.card, marginBottom: 10 }]}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <Btn
              small
              kind={hide ? 'warm' : 'ghost'}
              label={hide ? t('Practice on') : t('Practice')}
              onPress={() => {
                setHide(!hide);
                setRevealed({});
              }}
            />
            <Text style={{ color: p.sub, fontSize: 12, flex: 1 }}>
              {hide ? t('Read the English, then tap to check yourself.') : t('Tap to hear it, 🎤 to practise saying it, ☆ to save it for review, hold to copy.')}
            </Text>
          </View>

          {query ? (
            <Card>
              <Label>{hits.length} match{hits.length === 1 ? '' : 'es'}</Label>
              {hits.map((h, i) => renderPhrase(h.phrase, `q${i}`))}
              {!hits.length ? <Text style={{ color: p.sub, fontSize: 14 }}>{t('Nothing found.')}</Text> : null}
            </Card>
          ) : (
            pack.topics.map((topic) => {
              const isOpen = open === topic.id;
              return (
                <Card key={topic.id}>
                  <Pressable accessibilityRole="button" onPress={() => setOpen(isOpen ? null : topic.id)}>
                    <View style={{ flexDirection: 'row', alignItems: 'center' }}>
                      <Text style={{ color: p.text, fontSize: 16, fontWeight: '700', flex: 1 }}>{topic.title}</Text>
                      <Text style={{ color: p.sub, fontSize: 12 }}>{topic.phrases.length} {isOpen ? '▾' : '▸'}</Text>
                    </View>
                  </Pressable>
                  {isOpen ? (
                    <>
                      {topic.note ? (
                        <Text style={{ color: p.sub, fontSize: 12, marginTop: 6, lineHeight: 18 }}>{topic.note}</Text>
                      ) : null}
                      <View style={{ marginTop: 6 }}>
                        {topic.phrases.map((phrase, i) => renderPhrase(phrase, `${topic.id}-${i}`))}
                      </View>
                    </>
                  ) : null}
                </Card>
              );
            })
          )}
        </>
      ) : null}

      {section === 'review' ? (
        <>
          {current ? (
            <Card>
              <Label>{t('{length} to review', { length: due.length })}</Label>
              <Text style={{ color: p.text, fontSize: 19, fontWeight: '700', marginTop: 4 }}>{current.front}</Text>
              <Text style={{ color: p.sub, fontSize: 13, marginTop: 4 }}>{t('Say it in {lang}, then check.', { lang: langName(current.lang) })}</Text>
              {showAnswer ? (
                <>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      stopSpeaking();
                      speak(current.back, current.lang, { native: true });
                    }}
                    style={{ marginTop: 12, flexDirection: 'row', alignItems: 'center', gap: 8 }}
                  >
                    <Text style={{ color: p.accent, fontSize: 20, fontWeight: '800', flex: 1 }}>{current.back}</Text>
                    <Text style={{ color: p.accent, fontSize: 15 }}>▶</Text>
                  </Pressable>
                  {sayIt(`card-${current.id}`, current.back, current.lang)}
                  <View style={{ flexDirection: 'row', gap: 8, marginTop: 14 }}>
                    <Btn
                      kind="ghost"
                      label={t('Forgot')}
                      style={{ flex: 1 }}
                      onPress={() => {
                        finishPractice();
                        gradeCard(current.id, false);
                        setShowAnswer(false);
                      }}
                    />
                    <Btn
                      label={t('Remembered')}
                      style={{ flex: 1 }}
                      onPress={() => {
                        finishPractice();
                        gradeCard(current.id, true);
                        setShowAnswer(false);
                      }}
                    />
                  </View>
                </>
              ) : (
                <Btn
                  label={t('Show answer')}
                  style={{ marginTop: 14 }}
                  onPress={() => {
                    setShowAnswer(true);
                    stopSpeaking();
                    speak(current.back, current.lang, { native: true });
                  }}
                />
              )}
            </Card>
          ) : (
            <Card>
              <Label>{t('Review')}</Label>
              <Text style={{ color: p.text, fontSize: 15, lineHeight: 22 }}>
                {mine.length ? t('All done for now. The next phrase comes back {when}.', { when: when(nextDue) }) : t('Nothing saved yet.')}
              </Text>
              <Text style={{ color: p.sub, fontSize: 13, lineHeight: 20, marginTop: 6 }}>
                {t('Save phrases with ☆ in the phrasebook, with Save in the Translate tab, or by holding a line in Captions. Each one comes back a day later, then after 3, 7, 14, 30 and 90 days while you keep remembering it, and sooner when you forget it.')}
              </Text>
            </Card>
          )}

          {mine.length ? (
            <Card>
              <Label>{t('My phrases · {length}', { length: mine.length })}</Label>
              {mine.map((c) => (
                <View
                  key={c.id}
                  style={{ flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8, borderBottomWidth: 1, borderColor: p.line }}
                >
                  <Pressable
                    style={{ flex: 1 }}
                    accessibilityRole="button"
                    onPress={() => {
                      stopSpeaking();
                      speak(c.back, c.lang, { native: true });
                    }}
                  >
                    <Text style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>{c.back}</Text>
                    <Text style={{ color: p.sub, fontSize: 13 }}>{c.front}</Text>
                    <Text style={{ color: p.sub, fontSize: 11, marginTop: 2 }}>
                      {c.due <= now ? t('Due now') : t('Next {when}', { when: when(c.due) })} · {t('step {step} of 6', { step: c.box })}
                    </Text>
                  </Pressable>
                  <Btn small kind="ghost" label={t('Remove')} onPress={() => deleteCard(c.id)} />
                </View>
              ))}
            </Card>
          ) : null}
        </>
      ) : null}

      {section === 'sounds' ? (
        <Card>
          <Label>{t('How {name} is pronounced', { name: langName(pack.lang) })}</Label>
          {pack.sounds.map((sound, i) => (
            <View key={i} style={{ paddingVertical: 8, borderBottomWidth: 1, borderColor: p.line }}>
              <Text style={{ color: p.text, fontSize: 15, fontWeight: '700' }}>
                {sound.it} → {sound.say}
              </Text>
              <Text style={{ color: p.sub, fontSize: 13, marginTop: 2 }}>{sound.example}</Text>
            </View>
          ))}
        </Card>
      ) : null}

      {section === 'notes' ? (
        <>
          {pack.notes.map((note, i) => (
            <Card key={i}>
              <Text style={{ color: p.text, fontSize: 16, fontWeight: '700', marginBottom: 6 }}>{note.title}</Text>
              <Text style={{ color: p.sub, fontSize: 14, lineHeight: 21 }}>{note.body}</Text>
            </Card>
          ))}
        </>
      ) : null}

      {section === 'resources' ? (
        <>
          <Text style={{ color: p.sub, fontSize: 12, marginBottom: 10, lineHeight: 18 }}>
            {t('Checked for cost, not endorsed. Opening one leaves the app.')}
          </Text>
          {pack.resources.map((r, i) => (
            <Card key={i}>
              <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
                <Text style={{ color: p.text, fontSize: 16, fontWeight: '700', flex: 1 }}>{r.name}</Text>
                <Text style={{ color: p.ok, fontSize: 11, fontWeight: '800' }}>{r.cost.toUpperCase()}</Text>
              </View>
              <Text style={{ color: p.sub, fontSize: 13, lineHeight: 20, marginTop: 6 }}>{r.what}</Text>
              <Btn
                small
                kind="ghost"
                style={{ alignSelf: 'flex-start', marginTop: 8 }}
                label={t('Open')}
                onPress={() => Linking.openURL(r.url).catch(() => {})}
              />
            </Card>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
