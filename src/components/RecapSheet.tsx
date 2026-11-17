// The recap of a finished conversation: the details worth keeping, then the transcript.
import React, { useState } from 'react';
import { Modal, Platform, Share, ScrollView, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Btn, Card, Label, styles } from './ui';
import { usePalette } from '../theme';
import { KIND_LABELS, buildRecap, extractDetails, type Entry } from '../services/recap';

export default function RecapSheet(props: { visible: boolean; title: string; entries: Entry[]; onClose: () => void }) {
  const p = usePalette();
  const [done, setDone] = useState<string | null>(null);
  const details = props.visible ? extractDetails(props.entries) : [];
  const text = props.visible ? buildRecap(props.title, props.entries, details) : '';

  return (
    <Modal visible={props.visible} animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
        <ScrollView contentContainerStyle={{ padding: 18 }}>
          <Text style={{ color: p.text, fontSize: 22, fontWeight: '800', marginBottom: 14 }}>{props.title}</Text>

          <Card>
            <Label>Key details</Label>
            {details.length ? (
              <>
                {details.map((d, i) => (
                  <View key={i} style={{ marginBottom: 10 }}>
                    <Text style={{ color: p.text, fontSize: 16, fontWeight: '700' }}>
                      {KIND_LABELS[d.kind]}: {d.value}
                    </Text>
                    <Text numberOfLines={2} style={{ color: p.sub, fontSize: 12, marginTop: 2 }}>{d.line}</Text>
                  </View>
                ))}
                <Text style={{ color: p.sub, fontSize: 11, marginTop: 2, lineHeight: 16 }}>
                  Found automatically. Check each one against the conversation before relying on it.
                </Text>
              </>
            ) : (
              <Text style={{ color: p.sub, fontSize: 14 }}>
                No times, dates, amounts or contacts came up. The conversation is below.
              </Text>
            )}
          </Card>

          <Card style={{ backgroundColor: p.cardAlt }}>
            <Label>Conversation · {props.entries.length} lines</Label>
            {props.entries.map((e, i) => (
              <View key={i} style={{ marginBottom: 10 }}>
                <Text style={{ color: p.sub, fontSize: 11 }}>{e.who}</Text>
                <Text selectable style={{ color: p.text, fontSize: 15, lineHeight: 21 }}>{e.original}</Text>
                {e.translated && e.translated !== e.original ? (
                  <Text selectable style={{ color: p.sub, fontSize: 13, lineHeight: 19 }}>{e.translated}</Text>
                ) : null}
              </View>
            ))}
          </Card>

          {done ? <Text style={{ color: p.ok, fontSize: 13, marginBottom: 8 }}>{done}</Text> : null}
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn
              style={{ flex: 1 }}
              label="Copy"
              onPress={async () => {
                await Clipboard.setStringAsync(text);
                setDone('Copied — paste it into your notes.');
              }}
            />
            <Btn
              kind="ghost"
              label="Share"
              onPress={async () => {
                try {
                  const nav: any = Platform.OS === 'web' && typeof navigator !== 'undefined' ? navigator : null;
                  if (nav?.share) await nav.share({ text });
                  else if (Platform.OS === 'web') {
                    await Clipboard.setStringAsync(text);
                    setDone('Copied — paste it into your notes.');
                  } else await Share.share({ message: text });
                } catch {
                  setDone('Could not share. Use Copy instead.');
                }
              }}
            />
            <Btn kind="ghost" label="Close" onPress={props.onClose} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
