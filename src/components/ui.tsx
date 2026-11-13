import React, { useMemo, useState } from 'react';
import { FlatList, Modal, Pressable, StyleSheet, Switch, Text, TextInput, View, type ViewStyle } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AUTO, LANGUAGES, langName, type Lang } from '../languages';
import { usePalette } from '../theme';

export function Btn(props: {
  label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'warm';
  disabled?: boolean; style?: ViewStyle; small?: boolean;
}) {
  const p = usePalette();
  const kind = props.kind ?? 'primary';
  const bg = kind === 'primary' ? p.accent : kind === 'danger' ? p.danger : kind === 'warm' ? p.warm : 'transparent';
  const fg = kind === 'ghost' ? p.text : kind === 'primary' ? p.accentText : '#1A1206';
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      disabled={props.disabled}
      onPress={props.onPress}
      style={({ pressed }) => [
        styles.btn,
        props.small && styles.btnSmall,
        { backgroundColor: bg, borderColor: kind === 'ghost' ? p.line : bg, opacity: props.disabled ? 0.4 : pressed ? 0.75 : 1 },
        props.style,
      ]}
    >
      <Text style={{ color: fg, fontWeight: '700', fontSize: props.small ? 13 : 15 }}>{props.label}</Text>
    </Pressable>
  );
}

export function Card(props: { children: React.ReactNode; style?: ViewStyle }) {
  const p = usePalette();
  return <View style={[styles.card, { backgroundColor: p.card, borderColor: p.line }, props.style]}>{props.children}</View>;
}

export function Label(props: { children: React.ReactNode }) {
  const p = usePalette();
  return <Text style={{ color: p.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.8, textTransform: 'uppercase', marginBottom: 6 }}>{props.children}</Text>;
}

export function ToggleRow(props: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>{props.title}</Text>
        {props.hint ? <Text style={{ color: p.sub, fontSize: 12, marginTop: 2 }}>{props.hint}</Text> : null}
      </View>
      <Switch value={props.value} onValueChange={props.onChange} trackColor={{ true: p.accent, false: p.line }} thumbColor="#fff" />
    </View>
  );
}

export function Stepper(props: { title: string; value: string; onMinus: () => void; onPlus: () => void }) {
  const p = usePalette();
  return (
    <View style={styles.row}>
      <Text style={{ color: p.text, fontSize: 15, fontWeight: '600', flex: 1 }}>{props.title}</Text>
      <Btn small kind="ghost" label="−" onPress={props.onMinus} />
      <Text style={{ color: p.text, width: 56, textAlign: 'center', fontVariant: ['tabular-nums'] }}>{props.value}</Text>
      <Btn small kind="ghost" label="+" onPress={props.onPlus} />
    </View>
  );
}

export function Choice<T extends string>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const p = usePalette();
  return (
    <View style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="button"
            accessibilityState={{ selected: on }}
            onPress={() => props.onChange(o.value)}
            style={[styles.chip, { backgroundColor: on ? p.accent : p.cardAlt, borderColor: on ? p.accent : p.line }]}
          >
            <Text style={{ color: on ? p.accentText : p.text, fontWeight: '600', fontSize: 13 }}>{o.label}</Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LangButton(props: { code: string; onChange: (code: string) => void; allowAuto?: boolean; style?: ViewStyle; caption?: string }) {
  const p = usePalette();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const data = useMemo(() => {
    const all: Lang[] = props.allowAuto ? [AUTO, ...LANGUAGES] : LANGUAGES;
    const needle = q.trim().toLowerCase();
    return needle ? all.filter((l) => l.name.toLowerCase().includes(needle)) : all;
  }, [q, props.allowAuto]);
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.caption ?? 'Language'}: ${langName(props.code)}`}
        onPress={() => setOpen(true)}
        style={[styles.lang, { backgroundColor: p.cardAlt, borderColor: p.line }, props.style]}
      >
        {props.caption ? <Text style={{ color: p.sub, fontSize: 11 }}>{props.caption}</Text> : null}
        <Text numberOfLines={1} style={{ color: p.text, fontWeight: '700', fontSize: 15 }}>{langName(props.code)}</Text>
      </Pressable>
      <Modal visible={open} animationType="slide" onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
          <View style={{ flexDirection: 'row', padding: 12, gap: 8, alignItems: 'center' }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder="Search languages"
              placeholderTextColor={p.sub}
              style={[styles.input, { flex: 1, color: p.text, borderColor: p.line, backgroundColor: p.card }]}
            />
            <Btn small kind="ghost" label="Close" onPress={() => setOpen(false)} />
          </View>
          <FlatList
            data={data}
            keyExtractor={(l) => l.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <Pressable
                onPress={() => {
                  props.onChange(item.code);
                  setOpen(false);
                  setQ('');
                }}
                style={{ paddingVertical: 14, paddingHorizontal: 18, borderBottomWidth: StyleSheet.hairlineWidth, borderColor: p.line }}
              >
                <Text style={{ color: item.code === props.code ? p.accent : p.text, fontSize: 16, fontWeight: item.code === props.code ? '700' : '400' }}>
                  {item.name}
                </Text>
              </Pressable>
            )}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

export function ErrorText(props: { children?: string | null }) {
  const p = usePalette();
  if (!props.children) return null;
  return <Text accessibilityRole="alert" style={{ color: p.danger, fontSize: 13, marginVertical: 6 }}>{props.children}</Text>;
}

export const styles = StyleSheet.create({
  btn: { paddingVertical: 12, paddingHorizontal: 16, borderRadius: 12, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minHeight: 46 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 12, minHeight: 36, borderRadius: 10 },
  card: { borderRadius: 16, borderWidth: 1, padding: 14, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8 },
  chip: { paddingVertical: 8, paddingHorizontal: 12, borderRadius: 999, borderWidth: 1 },
  lang: { flex: 1, paddingVertical: 10, paddingHorizontal: 12, borderRadius: 12, borderWidth: 1, minHeight: 46, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
