import { Ionicons } from '@expo/vector-icons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, Text } from 'react-native';

import { useApp } from '@/state/AppState';
import { radius, space, useColors } from '@/theme';

/** Opens the barcode scanner (F9). */
export function ScanButton() {
  const { t } = useApp();
  const c = useColors();
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={t('scanTitle')}
      onPress={() => router.push('/scan')}
      hitSlop={4}
      style={({ pressed }) => [styles.button, { backgroundColor: c.primarySoft, opacity: pressed ? 0.8 : 1 }]}>
      <Ionicons name="barcode-outline" size={20} color={c.primary} />
      <Text style={[styles.label, { color: c.primary }]}>{t('scanButton')}</Text>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  button: { flexDirection: 'row', alignItems: 'center', gap: 6, minHeight: 40, paddingHorizontal: space.md, borderRadius: radius.pill },
  label: { fontSize: 15, fontWeight: '600' },
});
