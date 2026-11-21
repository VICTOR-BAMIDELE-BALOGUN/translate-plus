import React, { useEffect, useMemo, useState } from 'react';
import {
  AccessibilityInfo, FlatList, Modal, Platform, Pressable, StyleSheet, Switch, Text, TextInput, View,
  type PressableStateCallbackType, type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { AUTO, LANGUAGES, langName, type Lang } from '../languages';
import { usePalette, type Palette } from '../theme';
import { t } from '../i18n/t';

// react-native-web also reports hover and keyboard focus to Pressable styles
type PressState = PressableStateCallbackType & { hovered?: boolean; focused?: boolean };

/** Shadow and glass blur for a raised surface, from the theme's tokens. */
export function raised(p: Palette): ViewStyle {
  const s: Record<string, unknown> = {};
  if (p.shadow !== 'none') s.boxShadow = p.shadow;
  if (Platform.OS === 'web' && p.blur > 0) {
    s.backdropFilter = `blur(${p.blur}px)`;
    s.WebkitBackdropFilter = `blur(${p.blur}px)`;
  }
  return s as ViewStyle;
}

/** A themed surface: glass card, outlined panel or solid block, depending on the theme. */
export function surface(p: Palette, reading = false): ViewStyle {
  return {
    backgroundColor: reading ? p.cardAlt : p.card,
    borderColor: p.line,
    borderWidth: p.border,
    borderRadius: p.radius,
    ...raised(p),
  };
}

/** The page canvas: a gradient with two soft lights, drawn behind everything else. */
export function Ambient() {
  const p = usePalette();
  const layers = [
    p.glowA !== 'transparent' ? `radial-gradient(circle at 12% 0%, ${p.glowA} 0%, transparent 55%)` : null,
    p.glowB !== 'transparent' ? `radial-gradient(circle at 100% 38%, ${p.glowB} 0%, transparent 52%)` : null,
    `linear-gradient(165deg, ${p.bg2} 0%, ${p.bg} 60%, ${p.bg} 100%)`,
  ].filter(Boolean);
  return (
    <View
      pointerEvents="none"
      style={[StyleSheet.absoluteFill, { backgroundColor: p.bg, backgroundImage: layers.join(', ') } as ViewStyle]}
    />
  );
}

/** True when the person has asked their phone or browser for less motion. */
export function useReducedMotion(): boolean {
  const [reduced, setReduced] = useState(false);
  useEffect(() => {
    AccessibilityInfo.isReduceMotionEnabled().then(setReduced).catch(() => {});
    const sub = AccessibilityInfo.addEventListener('reduceMotionChanged', setReduced);
    return () => sub.remove();
  }, []);
  return reduced;
}

export function Btn(props: {
  label: string; onPress: () => void; kind?: 'primary' | 'ghost' | 'danger' | 'warm';
  disabled?: boolean; style?: ViewStyle; small?: boolean;
}) {
  const p = usePalette();
  const kind = props.kind ?? 'primary';
  const solid = kind !== 'ghost';
  const bg = kind === 'primary' ? p.accent : kind === 'danger' ? p.danger : kind === 'warm' ? p.warm : 'transparent';
  const fg = kind === 'ghost' ? p.text : kind === 'primary' ? p.accentText : '#1A1206';
  const radius = props.small ? Math.max(10, p.radius - 8) : Math.max(12, p.radius - 6);
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={props.label}
      accessibilityState={{ disabled: !!props.disabled }}
      disabled={props.disabled}
      onPress={props.onPress}
      style={(state) => {
        const { pressed, hovered } = state as PressState;
        return [
          styles.btn,
          props.small && styles.btnSmall,
          {
            borderRadius: radius,
            borderWidth: p.border,
            backgroundColor: solid ? bg : pressed || hovered ? p.card : 'transparent',
            borderColor: solid ? bg : p.line,
            opacity: props.disabled ? 0.42 : pressed ? 0.82 : 1,
          },
          solid && !props.disabled && p.shadow !== 'none' ? ({ boxShadow: `0px 4px 14px ${hexAlpha(bg, 0.28)}` } as ViewStyle) : null,
          hovered && solid && !props.disabled ? { opacity: 0.92 } : null,
          props.style,
        ];
      }}
    >
      <Text style={{ color: fg, fontWeight: '700', fontSize: props.small ? 14 : 15, letterSpacing: 0.1 }}>{props.label}</Text>
    </Pressable>
  );
}

/** '#RRGGBB' + alpha → rgba(); anything else is returned unchanged. */
function hexAlpha(color: string, alpha: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(color);
  return m ? `rgba(${parseInt(m[1], 16)}, ${parseInt(m[2], 16)}, ${parseInt(m[3], 16)}, ${alpha})` : color;
}

export function Card(props: { children: React.ReactNode; style?: ViewStyle; reading?: boolean }) {
  const p = usePalette();
  return <View style={[styles.card, surface(p, props.reading), props.style]}>{props.children}</View>;
}

export function Label(props: { children: React.ReactNode }) {
  const p = usePalette();
  return <Text style={{ color: p.sub, fontSize: 12, fontWeight: '700', letterSpacing: 0.9, textTransform: 'uppercase', marginBottom: 8 }}>{props.children}</Text>;
}

export function ToggleRow(props: { title: string; hint?: string; value: boolean; onChange: (v: boolean) => void }) {
  const p = usePalette();
  return (
    <View style={styles.row}>
      <View style={{ flex: 1, paddingRight: 12 }}>
        <Text style={{ color: p.text, fontSize: 15, fontWeight: '600' }}>{props.title}</Text>
        {props.hint ? <Text style={{ color: p.sub, fontSize: 13, marginTop: 2, lineHeight: 18 }}>{props.hint}</Text> : null}
      </View>
      <Switch
        accessibilityLabel={props.title}
        value={props.value}
        onValueChange={props.onChange}
        trackColor={{ true: p.accent, false: p.line }}
        thumbColor="#FFFFFF"
      />
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

/** Pill choices. The selected one is filled, thicker-edged and ticked, so it never relies on colour alone. */
export function Choice<T extends string>(props: { options: { value: T; label: string }[]; value: T; onChange: (v: T) => void }) {
  const p = usePalette();
  return (
    <View accessibilityRole="radiogroup" style={{ flexDirection: 'row', gap: 8, flexWrap: 'wrap' }}>
      {props.options.map((o) => {
        const on = o.value === props.value;
        return (
          <Pressable
            key={o.value}
            accessibilityRole="radio"
            accessibilityState={{ selected: on, checked: on }}
            accessibilityLabel={o.label}
            onPress={() => props.onChange(o.value)}
            style={(state) => {
              const { pressed, hovered } = state as PressState;
              return [
                styles.chip,
                {
                  backgroundColor: on ? p.accent : hovered || pressed ? p.card : p.cardAlt,
                  borderColor: on ? p.accent : p.line,
                  borderWidth: on ? p.borderOn : p.border,
                  opacity: pressed ? 0.85 : 1,
                },
              ];
            }}
          >
            <Text style={{ color: on ? p.accentText : p.text, fontWeight: on ? '800' : '600', fontSize: 14 }}>
              {on ? '✓ ' : ''}{o.label}
            </Text>
          </Pressable>
        );
      })}
    </View>
  );
}

export function LangButton(props: {
  code: string;
  onChange: (code: string) => void;
  allowAuto?: boolean;
  /** what the 'auto' entry is called, when it does not mean detecting the language */
  autoLabel?: string;
  style?: ViewStyle;
  caption?: string;
}) {
  const p = usePalette();
  const reduced = useReducedMotion();
  const [open, setOpen] = useState(false);
  const [q, setQ] = useState('');
  const data = useMemo(() => {
    const auto: Lang = props.autoLabel ? { ...AUTO, name: props.autoLabel } : AUTO;
    const all: Lang[] = props.allowAuto ? [auto, ...LANGUAGES] : LANGUAGES;
    const needle = q.trim().toLowerCase();
    // search both the translated and the English name
    return needle ? all.filter((l) => (l.code === 'auto' ? l.name : langName(l.code)).toLowerCase().includes(needle) || l.name.toLowerCase().includes(needle)) : all;
  }, [q, props.allowAuto, props.autoLabel]);
  const nameOf = (code: string) => (code === 'auto' && props.autoLabel ? props.autoLabel : langName(code));
  return (
    <>
      <Pressable
        accessibilityRole="button"
        accessibilityLabel={`${props.caption ?? t('Language')}: ${nameOf(props.code)}`}
        onPress={() => setOpen(true)}
        style={(state) => {
          const { pressed, hovered } = state as PressState;
          return [
            styles.lang,
            surface(p, true),
            { borderRadius: Math.max(12, p.radius - 6), opacity: pressed ? 0.85 : 1 },
            hovered ? { borderColor: p.accent } : null,
            props.style,
          ];
        }}
      >
        {/* the arrow sits beside the caption so long language names keep the full width */}
        <Text style={{ color: p.sub, fontSize: 12, fontWeight: '600' }}>
          {props.caption ? props.caption + '  ' : ''}▾
        </Text>
        <Text numberOfLines={1} style={{ color: p.text, fontWeight: '800', fontSize: 16 }}>{nameOf(props.code)}</Text>
      </Pressable>
      <Modal visible={open} animationType={reduced ? 'none' : 'slide'} onRequestClose={() => setOpen(false)}>
        <SafeAreaView style={{ flex: 1, backgroundColor: p.bg }}>
          <Ambient />
          <View style={{ flexDirection: 'row', padding: 12, gap: 8, alignItems: 'center' }}>
            <TextInput
              value={q}
              onChangeText={setQ}
              placeholder={t('Search languages')}
              placeholderTextColor={p.sub}
              accessibilityLabel={t('Search languages')}
              style={[styles.input, { flex: 1, color: p.text, borderColor: p.line, backgroundColor: p.cardAlt, borderRadius: Math.max(12, p.radius - 6) }]}
            />
            <Btn small kind="ghost" label={t('Close')} onPress={() => setOpen(false)} />
          </View>
          <FlatList
            data={data}
            keyExtractor={(l) => l.code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => {
              const on = item.code === props.code;
              return (
                <Pressable
                  accessibilityRole="button"
                  accessibilityState={{ selected: on }}
                  onPress={() => {
                    props.onChange(item.code);
                    setOpen(false);
                    setQ('');
                  }}
                  style={(state) => {
                    const { pressed, hovered } = state as PressState;
                    return {
                      flexDirection: 'row', alignItems: 'center', minHeight: 52, paddingHorizontal: 18,
                      borderBottomWidth: StyleSheet.hairlineWidth, borderColor: p.line,
                      backgroundColor: on ? p.cardAlt : pressed || hovered ? p.card : 'transparent',
                    };
                  }}
                >
                  <Text style={{ flex: 1, color: on ? p.accent : p.text, fontSize: 16, fontWeight: on ? '800' : '400' }}>{nameOf(item.code)}</Text>
                  {on ? <Text style={{ color: p.accent, fontSize: 16, fontWeight: '800' }}>✓</Text> : null}
                </Pressable>
              );
            }}
          />
        </SafeAreaView>
      </Modal>
    </>
  );
}

export function ErrorText(props: { children?: string | null }) {
  const p = usePalette();
  if (!props.children) return null;
  return <Text accessibilityRole="alert" style={{ color: p.danger, fontSize: 13, marginVertical: 6 }}>⚠ {props.children}</Text>;
}

/** Small status pill: a dot plus text, so the meaning does not depend on colour. */
export function Badge(props: { label: string; tone?: 'accent' | 'ok' | 'warm' | 'muted' }) {
  const p = usePalette();
  const c = props.tone === 'ok' ? p.ok : props.tone === 'warm' ? p.warm : props.tone === 'muted' ? p.sub : p.accent;
  return (
    <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, alignSelf: 'flex-start', paddingVertical: 3, paddingHorizontal: 9, borderRadius: 999, borderWidth: p.border, borderColor: c }}>
      <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: c }} />
      <Text style={{ color: c, fontSize: 12, fontWeight: '700' }}>{props.label}</Text>
    </View>
  );
}

export const styles = StyleSheet.create({
  btn: { paddingVertical: 12, paddingHorizontal: 18, borderRadius: 14, borderWidth: 1, alignItems: 'center', justifyContent: 'center', minHeight: 48 },
  btnSmall: { paddingVertical: 8, paddingHorizontal: 14, minHeight: 44, borderRadius: 12 },
  card: { borderRadius: 18, borderWidth: 1, padding: 16, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', paddingVertical: 10, gap: 8, minHeight: 48 },
  chip: { paddingVertical: 9, paddingHorizontal: 14, borderRadius: 999, borderWidth: 1, minHeight: 40, justifyContent: 'center' },
  lang: { flex: 1, paddingVertical: 10, paddingHorizontal: 14, borderRadius: 14, borderWidth: 1, minHeight: 56, justifyContent: 'center' },
  input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
});
