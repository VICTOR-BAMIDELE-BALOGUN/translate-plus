// Shows the invitation before it goes out: the note in the other person's language,
// the link under it, and a chance to edit either before sharing.
import React, { useEffect, useState } from 'react';
import { Modal, Platform, ScrollView, Share, Text, TextInput, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import * as Clipboard from 'expo-clipboard';
import { Btn, Card, Choice, ErrorText, Label, styles } from './ui';
import { usePalette } from '../theme';
import { getSettings, useSettings, type Room } from '../store';
import { buildInviteLink, defaultLinkBase } from '../invite';
import { ENGLISH_INVITE, ENGLISH_INVITE_CASUAL, hasWrittenInvite, withLink, writtenInvite } from '../invitemessage';
import { translate } from '../services/translator';
import { langName } from '../languages';
import { t } from '../i18n/t';

export function inviteLinkFor(room: Room): string {
  const s = getSettings();
  const base = s.linkBase || defaultLinkBase();
  return base ? buildInviteLink(base, room.code, s.displayName || 'A friend', s.targetLang) : '';
}

async function send(text: string): Promise<'shared' | 'copied'> {
  if (Platform.OS === 'web') {
    const nav: any = typeof navigator !== 'undefined' ? navigator : null;
    if (nav?.share) {
      try {
        await nav.share({ text });
        return 'shared';
      } catch {
        // cancelled or refused: fall through to copying
      }
    }
    await Clipboard.setStringAsync(text);
    return 'copied';
  }
  await Share.share({ message: text });
  return 'shared';
}

export default function InviteSheet(props: { room: Room | null; onClose: () => void }) {
  const { room } = props;
  const p = usePalette();
  const s = useSettings();
  const lang = s.targetLang;
  // a link usually goes to someone you do not know well, so polite is the default
  const [formal, setFormal] = useState(s.register !== 'informal');
  const [message, setMessage] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [done, setDone] = useState<string | null>(null);

  const link = room ? inviteLinkFor(room) : '';

  useEffect(() => {
    if (!room) return;
    let alive = true;
    const written = writtenInvite(lang, formal);
    if (written) {
      setMessage(written);
      setError(null);
      return;
    }
    // no written version for this language: translate the English one
    setLoading(true);
    translate(formal ? ENGLISH_INVITE : ENGLISH_INVITE_CASUAL, 'en', lang)
      .then((out) => {
        if (alive) {
          setMessage(out.text);
          setError(null);
        }
      })
      .catch(() => {
        if (alive) {
          setMessage(formal ? ENGLISH_INVITE : ENGLISH_INVITE_CASUAL);
          setError(t('Could not translate the note into {lang}, so it is in English.', { lang: langName(lang) }));
        }
      })
      .finally(() => alive && setLoading(false));
    return () => {
      alive = false;
    };
  }, [room, lang, formal]);

  const full = withLink(message, link || room?.code || '');

  return (
    <Modal visible={!!room} animationType="slide" onRequestClose={props.onClose}>
      <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
        <ScrollView contentContainerStyle={{ padding: 18 }} keyboardShouldPersistTaps="handled">
          <Text style={{ color: p.text, fontSize: 22, fontWeight: '800', marginBottom: 4 }}>{t('Invite {n}', { n: room?.name ?? '' })}</Text>
          <Text style={{ color: p.sub, fontSize: 13, marginBottom: 16, lineHeight: 19 }}>{t('Written in {lang}, the language they speak, so the first thing they read makes sense to them.', { lang: langName(lang) })}</Text>

          <Choice
            value={formal ? 'formal' : 'informal'}
            onChange={(v) => setFormal(v === 'formal')}
            options={[
              { value: 'formal', label: t('Polite') },
              { value: 'informal', label: t('Friendly') },
            ]}
          />

          <View style={{ height: 12 }} />
          <Card>
            <Label>{t('Message · {lang}', { lang: langName(lang) })}{loading ? t(' · translating…') : ''}</Label>
            <TextInput
              value={message}
              onChangeText={setMessage}
              multiline
              style={{ color: p.text, fontSize: 15, lineHeight: 22, minHeight: 120, textAlignVertical: 'top' }}
            />
            {!hasWrittenInvite(lang) && !loading ? (
              <Text style={{ color: p.sub, fontSize: 11, marginTop: 6 }}>
                {t('This note was machine-translated. Read it before sending.')}
              </Text>
            ) : null}
          </Card>

          <Card style={{ backgroundColor: p.cardAlt }}>
            <Label>{link ? t('Link') : t('Invite code')}</Label>
            <Text selectable style={{ color: p.text, fontSize: 13 }}>{link || room?.code}</Text>
            {!link ? (
              <Text style={{ color: p.warm, fontSize: 12, marginTop: 6 }}>
                {t('No web address set, so only the code can be shared. Add one in Settings → Call links.')}
              </Text>
            ) : null}
          </Card>

          <ErrorText>{error}</ErrorText>
          {done ? <Text style={{ color: p.ok, fontSize: 13, marginBottom: 8 }}>{done}</Text> : null}

          <View style={{ flexDirection: 'row', gap: 8 }}>
            <Btn
              style={{ flex: 1 }}
              label={t('Share')}
              disabled={!message.trim()}
              onPress={async () => {
                try {
                  const how = await send(full);
                  setDone(how === 'copied' ? 'Copied — paste it into WhatsApp or a message.' : null);
                  if (how === 'shared') props.onClose();
                } catch {
                  setError(t('Could not open the share sheet. Use Copy instead.'));
                }
              }}
            />
            <Btn
              kind="ghost"
              label={t('Copy')}
              onPress={async () => {
                await Clipboard.setStringAsync(full);
                setDone('Copied — paste it into WhatsApp or a message.');
              }}
            />
            <Btn kind="ghost" label={t('Close')} onPress={props.onClose} />
          </View>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}
