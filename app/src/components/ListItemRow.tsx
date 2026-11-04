import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_BY_ID, SHARED_LIST_LIMITS, type Lang, type ListItem } from '@pricing/core';
import { useState } from 'react';
import { Pressable, View } from 'react-native';

import { Card, Chip, Input, Row, Stepper, T } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { space, useColors } from '@/theme';

const LANGS: Lang[] = ['ca', 'es', 'en'];

/** Item name in the app language, plus the other two (helps newcomers learn "llet = leche = milk"). */
export function itemNames(item: Pick<ListItem, 'categoryId' | 'text'>, lang: Lang): { main: string; others: string | null } {
  const cat = item.categoryId ? CATEGORY_BY_ID[item.categoryId] : undefined;
  if (!cat) return { main: item.text, others: null };
  return { main: cat.names[lang], others: LANGS.filter((l) => l !== lang).map((l) => cat.names[l]).join(' · ') };
}

export function ListItemRow({ item }: { item: ListItem }) {
  const { settings, updateItem, removeItem, t } = useApp();
  const c = useColors();
  const { main, others } = itemNames(item, settings.lang);
  // Remembers the brand while another level is picked; the item itself is the source otherwise
  // (on a shared list it can change on another phone).
  const [brand, setBrand] = useState(item.level.kind === 'specific' ? item.level.brand : '');
  const checked = item.checked === true;

  return (
    <Card style={{ gap: space.sm }}>
      <Row style={{ alignItems: 'flex-start' }}>
        <Pressable
          accessibilityRole="checkbox"
          accessibilityState={{ checked }}
          aria-checked={checked}
          accessibilityLabel={main}
          onPress={() => updateItem(item.id, { checked: !checked })}
          hitSlop={10}
          style={{ paddingTop: 1 }}>
          <Ionicons name={checked ? 'checkbox' : 'square-outline'} size={24} color={checked ? c.primary : c.muted} />
        </Pressable>
        <View style={{ flex: 1, gap: 2, opacity: checked ? 0.6 : 1 }}>
          <T variant="heading" style={checked ? { textDecorationLine: 'line-through' } : undefined}>{main}</T>
          {others ? <T variant="small">{others}</T> : <T variant="small" style={{ color: c.warn }}>{t('unknownItem')}</T>}
        </View>
        <Stepper value={item.quantity} max={SHARED_LIST_LIMITS.maxQuantity} onChange={(quantity) => updateItem(item.id, { quantity })} />
        <Pressable accessibilityRole="button" accessibilityLabel="remove" onPress={() => removeItem(item.id)} hitSlop={10} style={{ paddingLeft: space.xs, paddingTop: 4 }}>
          <Ionicons name="close" size={22} color={c.muted} />
        </Pressable>
      </Row>
      <Row style={{ flexWrap: 'wrap' }}>
        <Chip label={t('levelOwn')} selected={item.level.kind === 'own'} onPress={() => updateItem(item.id, { level: { kind: 'own' } })} />
        <Chip label={t('levelAny')} selected={item.level.kind === 'any'} onPress={() => updateItem(item.id, { level: { kind: 'any' } })} />
        <Chip label={t('levelBrand')} selected={item.level.kind === 'specific'} onPress={() => updateItem(item.id, { level: { kind: 'specific', brand } })} />
      </Row>
      {item.level.kind === 'specific' ? (
        <Input
          value={item.level.brand}
          onChangeText={(b) => {
            setBrand(b);
            updateItem(item.id, { level: { kind: 'specific', brand: b } });
          }}
          placeholder={t('brandPlaceholder')}
          autoCapitalize="words"
        />
      ) : null}
    </Card>
  );
}
