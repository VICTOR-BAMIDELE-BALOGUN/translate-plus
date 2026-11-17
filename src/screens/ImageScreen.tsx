// Translating text in a photo: a sign, a menu, a letter, a screenshot.
import React, { useRef, useState } from 'react';
import { Image, ScrollView, Text, TextInput, View } from 'react-native';
import * as ImagePicker from 'expo-image-picker';
import * as Clipboard from 'expo-clipboard';
import { Btn, Card, ErrorText, Label, LangButton, styles } from '../components/ui';
import { usePalette } from '../theme';
import { updateSettings, useSettings } from '../store';
import { translate } from '../services/translator';
import { speak, stopSpeaking } from '../services/tts';
import { ocrNote, ocrSupported, readTextFromImage } from '../services/ocr';
import { langName } from '../languages';

export default function ImageScreen() {
  const p = usePalette();
  const s = useSettings();
  const [uri, setUri] = useState<string | null>(null);
  const [source, setSource] = useState(''); // the text found in the photo, editable
  const [result, setResult] = useState('');
  const [stage, setStage] = useState<'idle' | 'reading' | 'translating'>('idle');
  const [progress, setProgress] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const seq = useRef(0);

  // the language printed in the photo; usually the one you are translating from
  const [photoLang, setPhotoLang] = useState(s.targetLang);

  const run = async (pickedUri: string, lang: string) => {
    const id = ++seq.current;
    setUri(pickedUri);
    setSource('');
    setResult('');
    setError(null);
    setProgress(0);
    setStage('reading');
    try {
      const text = await readTextFromImage(pickedUri, lang, (f) => {
        if (id === seq.current) setProgress(f);
      });
      if (id !== seq.current) return;
      if (!text) {
        setStage('idle');
        setError('No text found in that photo. Try a closer or sharper picture.');
        return;
      }
      setSource(text);
      setStage('translating');
      const out = await translate(text, lang, s.myLang);
      if (id !== seq.current) return;
      setResult(out.text);
      setStage('idle');
    } catch (e) {
      if (id !== seq.current) return;
      setStage('idle');
      setError(e instanceof Error ? e.message : 'Could not read that photo.');
    }
  };

  const pick = async (fromCamera: boolean) => {
    setError(null);
    try {
      if (fromCamera) {
        const perm = await ImagePicker.requestCameraPermissionsAsync();
        if (!perm.granted) {
          setError('Camera permission is needed to take a photo.');
          return;
        }
      }
      const picked = fromCamera
        ? await ImagePicker.launchCameraAsync({ quality: 0.8 })
        : await ImagePicker.launchImageLibraryAsync({ quality: 0.8, mediaTypes: ['images'] });
      if (picked.canceled || !picked.assets?.length) return;
      await run(picked.assets[0].uri, photoLang);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not open the photo.');
    }
  };

  // re-translate when the edited text changes, without reading the photo again
  const retranslate = async (text: string) => {
    const id = ++seq.current;
    setSource(text);
    if (!text.trim()) {
      setResult('');
      return;
    }
    setStage('translating');
    try {
      const out = await translate(text, photoLang, s.myLang);
      if (id !== seq.current) return;
      setResult(out.text);
      setStage('idle');
    } catch (e) {
      if (id !== seq.current) return;
      setStage('idle');
      setError(e instanceof Error ? e.message : 'Translation failed');
    }
  };

  const note = ocrNote(photoLang);

  return (
    <ScrollView contentContainerStyle={{ padding: 16 }} keyboardShouldPersistTaps="handled">
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <LangButton
          caption="Language in the photo"
          code={photoLang}
          onChange={(c) => {
            setPhotoLang(c);
            if (uri) run(uri, c);
          }}
        />
        <LangButton caption="Into" code={s.myLang} onChange={(c) => updateSettings({ myLang: c })} />
      </View>

      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 12 }}>
        <Btn style={{ flex: 1 }} label="Take a photo" onPress={() => pick(true)} disabled={stage !== 'idle'} />
        <Btn style={{ flex: 1 }} kind="ghost" label="Choose a photo" onPress={() => pick(false)} disabled={stage !== 'idle'} />
      </View>

      {note ? <Text style={{ color: p.warm, fontSize: 12, marginBottom: 10 }}>{note}</Text> : null}
      <ErrorText>{error}</ErrorText>

      {uri ? (
        <Image
          source={{ uri }}
          resizeMode="contain"
          style={{ width: '100%', height: 200, borderRadius: 14, backgroundColor: p.cardAlt, marginBottom: 12 }}
        />
      ) : (
        <Card>
          <Text style={{ color: p.sub, fontSize: 14, lineHeight: 21 }}>
            Photograph a sign, a menu, a letter or a screenshot and it comes back in {langName(s.myLang)}. The text is editable afterwards, so you can fix anything misread before translating.
          </Text>
        </Card>
      )}

      {stage === 'reading' ? (
        <Text style={{ color: p.sub, fontSize: 13, marginBottom: 10 }}>
          Reading the photo{progress > 0 ? ` · ${Math.round(progress * 100)}%` : '…'}
          {progress === 0 ? ' (the first photo takes longer while the reader downloads)' : ''}
        </Text>
      ) : null}

      {source ? (
        <Card>
          <Label>Text in the photo · {langName(photoLang)}</Label>
          <TextInput
            value={source}
            onChangeText={retranslate}
            multiline
            style={{ color: p.text, fontSize: 15, minHeight: 70, textAlignVertical: 'top' }}
          />
        </Card>
      ) : null}

      {result ? (
        <Card style={{ backgroundColor: p.cardAlt }}>
          <Label>{langName(s.myLang)}{stage === 'translating' ? ' · translating…' : ''}</Label>
          <Text selectable style={{ color: p.text, fontSize: 18, lineHeight: 26 }}>{result}</Text>
          <View style={{ flexDirection: 'row', gap: 8, marginTop: 10 }}>
            <Btn small label="Listen" onPress={() => { stopSpeaking(); speak(result, s.myLang); }} />
            <Btn
              small
              kind="ghost"
              label={copied ? 'Copied' : 'Copy'}
              onPress={async () => {
                await Clipboard.setStringAsync(result);
                setCopied(true);
                setTimeout(() => setCopied(false), 1500);
              }}
            />
          </View>
        </Card>
      ) : null}
    </ScrollView>
  );
}
