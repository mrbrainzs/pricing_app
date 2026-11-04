import type { ReactNode } from 'react';
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  TextInput,
  View,
  type StyleProp,
  type TextInputProps,
  type TextStyle,
  type ViewStyle,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';

import { MAX_WIDTH, radius, space, useColors } from '@/theme';

export function Screen({ children, scroll = true, edges = ['top'] }: { children: ReactNode; scroll?: boolean; edges?: ('top' | 'bottom')[] }) {
  const c = useColors();
  const inner = <View style={styles.inner}>{children}</View>;
  return (
    <SafeAreaView edges={edges} style={[styles.screen, { backgroundColor: c.bg }]}>
      {scroll ? (
        <ScrollView contentContainerStyle={styles.scroll} keyboardShouldPersistTaps="handled">
          {inner}
        </ScrollView>
      ) : (
        <View style={[styles.scroll, { flex: 1 }]}>{inner}</View>
      )}
    </SafeAreaView>
  );
}

type Variant = 'title' | 'heading' | 'body' | 'muted' | 'small' | 'price' | 'bigPrice';

export function T({ children, variant = 'body', style, numberOfLines }: { children: ReactNode; variant?: Variant; style?: StyleProp<TextStyle>; numberOfLines?: number }) {
  const c = useColors();
  const color = variant === 'muted' || variant === 'small' ? c.muted : c.text;
  return (
    <Text numberOfLines={numberOfLines} style={[textStyles[variant], { color }, style]}>
      {children}
    </Text>
  );
}

export function Card({ children, style, highlight }: { children: ReactNode; style?: StyleProp<ViewStyle>; highlight?: boolean }) {
  const c = useColors();
  return (
    <View style={[styles.card, { backgroundColor: c.card, borderColor: highlight ? c.primary : c.border, borderWidth: highlight ? 2 : 1 }, style]}>
      {children}
    </View>
  );
}

export function Button({ label, onPress, variant = 'primary', disabled, loading, style, compact }: {
  label: string;
  onPress: () => void;
  variant?: 'primary' | 'secondary' | 'ghost';
  disabled?: boolean;
  loading?: boolean;
  style?: StyleProp<ViewStyle>;
  compact?: boolean;
}) {
  const c = useColors();
  const bg = variant === 'primary' ? c.primary : variant === 'secondary' ? c.primarySoft : 'transparent';
  const fg = variant === 'primary' ? c.onPrimary : c.primary;
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={disabled || loading}
      style={({ pressed }) => [
        styles.button,
        compact && styles.buttonCompact,
        { backgroundColor: bg, opacity: disabled ? 0.45 : pressed ? 0.8 : 1 },
        style,
      ]}>
      {loading ? <ActivityIndicator color={fg} /> : <Text style={[styles.buttonText, { color: fg }]}>{label}</Text>}
    </Pressable>
  );
}

export function Chip({ label, selected, onPress, color }: { label: string; selected?: boolean; onPress?: () => void; color?: string }) {
  const c = useColors();
  return (
    <Pressable
      accessibilityRole={onPress ? 'button' : undefined}
      accessibilityState={{ selected }}
      onPress={onPress}
      style={({ pressed }) => [
        styles.chip,
        { backgroundColor: selected ? c.primary : c.chip, opacity: pressed ? 0.8 : 1 },
      ]}>
      {color ? <View style={[styles.dot, { backgroundColor: color }]} /> : null}
      <Text style={[styles.chipText, { color: selected ? c.onPrimary : c.text }]}>{label}</Text>
    </Pressable>
  );
}

export function Badge({ label, tone = 'neutral' }: { label: string; tone?: 'neutral' | 'good' | 'high' | 'warn' | 'primary' }) {
  const c = useColors();
  const map = {
    neutral: [c.chip, c.muted],
    good: [c.goodSoft, c.good],
    high: [c.highSoft, c.high],
    warn: [c.warnSoft, c.warn],
    primary: [c.primarySoft, c.primary],
  } as const;
  const [bg, fg] = map[tone];
  return (
    <View style={[styles.badge, { backgroundColor: bg }]}>
      <Text style={[styles.badgeText, { color: fg }]}>{label}</Text>
    </View>
  );
}

export function Input(props: TextInputProps) {
  const c = useColors();
  return (
    <TextInput
      placeholderTextColor={c.muted}
      {...props}
      style={[styles.input, { backgroundColor: c.card, borderColor: c.border, color: c.text }, props.style]}
    />
  );
}

export function Row({ children, style, gap = space.sm }: { children: ReactNode; style?: StyleProp<ViewStyle>; gap?: number }) {
  return <View style={[{ flexDirection: 'row', alignItems: 'center', gap }, style]}>{children}</View>;
}

export function Stepper({ value, onChange }: { value: number; onChange: (v: number) => void }) {
  const c = useColors();
  const btn = (label: string, next: number, a11y: string) => (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={a11y}
      onPress={() => onChange(next)}
      hitSlop={8}
      style={[styles.stepBtn, { backgroundColor: c.chip }]}>
      <Text style={[styles.stepText, { color: c.text }]}>{label}</Text>
    </Pressable>
  );
  return (
    <Row gap={space.xs}>
      {btn('−', Math.max(1, value - 1), 'decrease')}
      <Text style={[styles.stepValue, { color: c.text }]}>{value}</Text>
      {btn('+', value + 1, 'increase')}
    </Row>
  );
}

export function Banner({ text, tone = 'warn' }: { text: string; tone?: 'warn' | 'primary' }) {
  const c = useColors();
  return (
    <View style={[styles.banner, { backgroundColor: tone === 'warn' ? c.warnSoft : c.primarySoft }]}>
      <Text style={{ color: tone === 'warn' ? c.warn : c.primary, fontSize: 13, lineHeight: 18 }}>{text}</Text>
    </View>
  );
}

export function Divider() {
  const c = useColors();
  return <View style={{ height: StyleSheet.hairlineWidth, backgroundColor: c.border, marginVertical: space.sm }} />;
}

const textStyles = StyleSheet.create({
  title: { fontSize: 28, fontWeight: '700', letterSpacing: -0.4 },
  heading: { fontSize: 18, fontWeight: '600' },
  body: { fontSize: 16, lineHeight: 22 },
  muted: { fontSize: 15, lineHeight: 21 },
  small: { fontSize: 13, lineHeight: 18 },
  price: { fontSize: 17, fontWeight: '600', fontVariant: ['tabular-nums'] },
  bigPrice: { fontSize: 26, fontWeight: '700', fontVariant: ['tabular-nums'] },
});

const styles = StyleSheet.create({
  screen: { flex: 1 },
  scroll: { paddingHorizontal: space.lg, paddingTop: space.lg, paddingBottom: space.xxl, alignItems: 'center' },
  inner: { width: '100%', maxWidth: MAX_WIDTH, gap: space.lg },
  card: { borderRadius: radius.lg, padding: space.lg, gap: space.sm },
  button: { minHeight: 48, borderRadius: radius.md, paddingHorizontal: space.lg, alignItems: 'center', justifyContent: 'center' },
  buttonCompact: { minHeight: 36, paddingHorizontal: space.md },
  buttonText: { fontSize: 16, fontWeight: '600' },
  chip: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: space.md, minHeight: 36, borderRadius: radius.pill },
  chipText: { fontSize: 14, fontWeight: '500' },
  dot: { width: 8, height: 8, borderRadius: 4 },
  badge: { alignSelf: 'flex-start', paddingHorizontal: space.sm, paddingVertical: 2, borderRadius: radius.pill },
  badgeText: { fontSize: 12, fontWeight: '600' },
  input: { minHeight: 48, minWidth: 0, flexShrink: 1, borderWidth: 1, borderRadius: radius.md, paddingHorizontal: space.md, fontSize: 16 },
  stepBtn: { width: 32, height: 32, borderRadius: 16, alignItems: 'center', justifyContent: 'center' },
  stepText: { fontSize: 18, fontWeight: '600' },
  stepValue: { minWidth: 22, textAlign: 'center', fontSize: 16, fontWeight: '600', fontVariant: ['tabular-nums'] },
  banner: { borderRadius: radius.md, padding: space.md },
});
