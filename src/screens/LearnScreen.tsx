// Preloaded course material. Everything here ships with the app and works offline.
import React, { useMemo, useState } from 'react';
import { Linking, Pressable, ScrollView, Text, TextInput, View } from 'react-native';
import * as Clipboard from 'expo-clipboard';
import { Btn, Card, Choice, Label, styles } from '../components/ui';
import { usePalette } from '../theme';
import { useSettings } from '../store';
import { speak, stopSpeaking } from '../services/tts';
import { availablePacks, packFor, searchPack, type Phrase } from '../learn';
import { langName } from '../languages';

type Section = 'phrases' | 'sounds' | 'notes' | 'resources';

export default function LearnScreen() {
  const p = usePalette();
  const s = useSettings();
  const packs = availablePacks();
  // the language being learnt is normally the one being translated into
  const [lang, setLang] = useState(() => (packFor(s.targetLang) ? s.targetLang : packs[0]?.lang) ?? 'it');
  const pack = packFor(lang) ?? packs[0];
  const [section, setSection] = useState<Section>('phrases');
  const [open, setOpen] = useState<string | null>(null);
  const [query, setQuery] = useState('');
  const [hide, setHide] = useState(false); // practice: cover the Italian
  const [revealed, setRevealed] = useState<Record<string, boolean>>({});
  const [copied, setCopied] = useState('');

  const hits = useMemo(() => (pack ? searchPack(pack, query) : []), [pack, query]);

  if (!pack) {
    return (
      <View style={{ flex: 1, padding: 16 }}>
        <Text style={{ color: p.sub }}>No course material is bundled yet.</Text>
      </View>
    );
  }

  const say = (phrase: Phrase) => {
    stopSpeaking();
    speak(phrase.it, pack.lang);
  };

  const copy = async (phrase: Phrase) => {
    await Clipboard.setStringAsync(phrase.it);
    setCopied(phrase.it);
    setTimeout(() => setCopied(''), 1200);
  };

  const renderPhrase = (phrase: Phrase, key: string) => {
    const covered = hide && !revealed[key];
    return (
      <Pressable
        key={key}
        accessibilityRole="button"
        accessibilityLabel={`${phrase.it}. ${phrase.en}. Tap to hear it.`}
        onPress={() => (covered ? setRevealed((r) => ({ ...r, [key]: true })) : say(phrase))}
        onLongPress={() => copy(phrase)}
        style={{ paddingVertical: 10, borderBottomWidth: 1, borderColor: p.line }}
      >
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <Text style={{ color: covered ? p.sub : p.text, fontSize: 17, fontWeight: '700', flex: 1 }}>
            {covered ? 'Tap to show' : phrase.it}
          </Text>
          {phrase.formal ? (
            <Text style={{ color: p.warm, fontSize: 10, fontWeight: '800' }}>LEI</Text>
          ) : null}
          <Text style={{ color: p.accent, fontSize: 15 }}>▶</Text>
        </View>
        <Text style={{ color: p.sub, fontSize: 14, marginTop: 2 }}>{phrase.en}</Text>
        {!covered ? <Text style={{ color: p.sub, fontSize: 12, marginTop: 1, fontStyle: 'italic' }}>{phrase.say}</Text> : null}
        {copied === phrase.it ? <Text style={{ color: p.ok, fontSize: 11, marginTop: 2 }}>Copied</Text> : null}
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

      <Text style={{ color: p.text, fontSize: 20, fontWeight: '800' }}>Learn {pack.name}</Text>
      <Text style={{ color: p.sub, fontSize: 13, lineHeight: 20, marginTop: 4, marginBottom: 12 }}>{pack.intro}</Text>

      <Choice
        value={section}
        onChange={(v) => setSection(v)}
        options={[
          { value: 'phrases', label: 'Phrases' },
          { value: 'sounds', label: 'Sounds' },
          { value: 'notes', label: 'Notes' },
          { value: 'resources', label: 'Free courses' },
        ]}
      />
      <View style={{ height: 12 }} />

      {section === 'phrases' ? (
        <>
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search the phrasebook"
            placeholderTextColor={p.sub}
            style={[styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.card, marginBottom: 10 }]}
          />
          <View style={{ flexDirection: 'row', alignItems: 'center', marginBottom: 10, gap: 8 }}>
            <Btn
              small
              kind={hide ? 'warm' : 'ghost'}
              label={hide ? 'Practice on' : 'Practice'}
              onPress={() => {
                setHide(!hide);
                setRevealed({});
              }}
            />
            <Text style={{ color: p.sub, fontSize: 12, flex: 1 }}>
              {hide ? 'Read the English, then tap to check yourself.' : 'Tap a phrase to hear it, hold to copy.'}
            </Text>
          </View>

          {query ? (
            <Card>
              <Label>{hits.length} match{hits.length === 1 ? '' : 'es'}</Label>
              {hits.map((h, i) => renderPhrase(h.phrase, `q${i}`))}
              {!hits.length ? <Text style={{ color: p.sub, fontSize: 14 }}>Nothing found.</Text> : null}
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

      {section === 'sounds' ? (
        <Card>
          <Label>How {pack.name} is pronounced</Label>
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
            Checked for cost, not endorsed. Opening one leaves the app.
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
                label="Open"
                onPress={() => Linking.openURL(r.url).catch(() => {})}
              />
            </Card>
          ))}
        </>
      ) : null}
    </ScrollView>
  );
}
