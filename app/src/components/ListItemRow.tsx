import { Ionicons } from '@expo/vector-icons';
import { CATEGORY_BY_ID, type Lang, type ListItem } from '@pricing/core';
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
  const [brand, setBrand] = useState(item.level.kind === 'specific' ? item.level.brand : '');

  return (
    <Card style={{ gap: space.sm }}>
      <Row style={{ alignItems: 'flex-start' }}>
        <View style={{ flex: 1, gap: 2 }}>
          <T variant="heading">{main}</T>
          {others ? <T variant="small">{others}</T> : <T variant="small" style={{ color: c.warn }}>{t('unknownItem')}</T>}
        </View>
        <Stepper value={item.quantity} onChange={(quantity) => updateItem(item.id, { quantity })} />
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
          value={brand}
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
