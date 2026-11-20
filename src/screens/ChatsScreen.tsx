import React, { useState } from 'react';
import { Alert, FlatList, Pressable, Text, TextInput, View } from 'react-native';
import { Btn, Card, ErrorText, Label, styles } from '../components/ui';
import { usePalette } from '../theme';
import { addRoom, removeRoom, useStore, type Room } from '../store';
import { formatCode, generateCode, isValidCode } from '../services/codec';
import InviteSheet from '../components/InviteSheet';
import { t } from '../i18n/t';

export default function ChatsScreen(props: { onOpen: (room: Room) => void }) {
  const p = usePalette();
  const { rooms, messages } = useStore();
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [inviting, setInviting] = useState<Room | null>(null);

  const create = () => {
    const room: Room = { code: generateCode(), name: name.trim() || 'New chat', createdAt: Date.now() };
    addRoom(room);
    setName('');
    setError(null);
    setInviting(room);
  };

  const join = () => {
    if (!isValidCode(code)) {
      setError(t('That code looks too short. Paste the full code you were sent.'));
      return;
    }
    const room: Room = { code: formatCode(code), name: name.trim() || 'Chat', createdAt: Date.now() };
    addRoom(room);
    setCode('');
    setName('');
    setError(null);
    props.onOpen(room);
  };

  return (
    <>
    <InviteSheet
      room={inviting}
      onClose={() => {
        const room = inviting;
        setInviting(null);
        if (room) props.onOpen(room);
      }}
    />
    <FlatList
      contentContainerStyle={{ padding: 16 }}
      keyboardShouldPersistTaps="handled"
      data={rooms}
      keyExtractor={(r) => r.code}
      ListHeaderComponent={
        <Card>
          <Label>{t('New conversation')}</Label>
          <TextInput
            value={name}
            onChangeText={setName}
            placeholder={t('Name (e.g. Landlord, Mum)')}
            placeholderTextColor={p.sub}
            style={[styles.input, { color: p.text, borderColor: p.line, backgroundColor: p.bg, marginBottom: 8 }]}
          />
          <Btn label={t('Create and share invite code')} onPress={create} />
          <View style={{ height: 14 }} />
          <Label>{t('Or join with a code')}</Label>
          <View style={{ flexDirection: 'row', gap: 8 }}>
            <TextInput
              value={code}
              onChangeText={setCode}
              autoCapitalize="characters"
              autoCorrect={false}
              placeholder={t('XXXX-XXXX-XXXX-XXXX')}
              placeholderTextColor={p.sub}
              style={[styles.input, { flex: 1, color: p.text, borderColor: p.line, backgroundColor: p.bg }]}
            />
            <Btn kind="ghost" label={t('Join')} onPress={join} disabled={!code.trim()} />
          </View>
          <ErrorText>{error}</ErrorText>
          <Text style={{ color: p.sub, fontSize: 12, marginTop: 8 }}>
            {t('Messages are end-to-end encrypted with the invite code. Anyone who has the code can read the chat, so share it privately.')}
          </Text>
        </Card>
      }
      ListEmptyComponent={<Text style={{ color: p.sub, textAlign: 'center', marginTop: 24 }}>{t('No conversations yet.')}</Text>}
      renderItem={({ item }) => {
        const last = (messages[item.code] ?? []).slice(-1)[0];
        return (
          <Pressable
            onPress={() => props.onOpen(item)}
            onLongPress={() =>
              Alert.alert(item.name, t('Delete this conversation from this phone?'), [
                { text: t('Cancel'), style: 'cancel' },
                { text: t('Delete'), style: 'destructive', onPress: () => removeRoom(item.code) },
              ])
            }
          >
            <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }]}>
              <Text style={{ color: p.text, fontSize: 17, fontWeight: '700' }}>{item.name}</Text>
              <Text numberOfLines={1} style={{ color: p.sub, fontSize: 13, marginTop: 4 }}>
                {last ? (last.mine ? t('You: ') : '') + (last.translated || last.text) : t('No messages yet · long-press to delete')}
              </Text>
            </View>
          </Pressable>
        );
      }}
    />
    </>
  );
}
