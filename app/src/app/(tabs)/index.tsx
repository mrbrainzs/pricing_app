import { CATEGORIES, normalize, tokenMatches, tokens, type Category, type Lang } from '@pricing/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { ListItemRow } from '@/components/ListItemRow';
import { WeeklyIndexCard } from '@/components/WeeklyIndexCard';
import { PriceDropBanner } from '@/components/PriceAlerts';
import { Button, Chip, Input, Row, Screen, T } from '@/components/ui';
import { APP_NAME } from '@/i18n';
import { useApp } from '@/state/AppState';
import { space, useColors } from '@/theme';

/** Generic items whose names (any language) start with or fuzzily match what's typed. */
function suggest(query: string, lang: Lang): Category[] {
  const q = normalize(query);
  if (q.length < 2) return [];
  const qWords = tokens(query);
  const scored = CATEGORIES.map((c) => {
    const names = [c.names[lang], c.names.ca, c.names.es, c.names.en, ...c.synonyms].map(normalize);
    let score = 0;
    for (const n of names) {
      if (n.startsWith(q)) score = Math.max(score, n === c.names[lang].toLowerCase() ? 3 : 2);
      else if (qWords.every((w) => tokens(n).some((nw) => tokenMatches(w, nw)))) score = Math.max(score, 1);
    }
    return { c, score };
  });
  return scored.filter((s) => s.score > 0).sort((a, b) => b.score - a.score).slice(0, 5).map((s) => s.c);
}

export default function ListScreen() {
  const { items, addItem, clearItems, settings, t } = useApp();
  const c = useColors();
  const [text, setText] = useState('');
  const suggestions = useMemo(() => suggest(text, settings.lang), [text, settings.lang]);

  const submit = (value = text) => {
    if (!value.trim()) return;
    addItem(value);
    setText('');
  };

  return (
    <Screen>
      <View style={{ gap: 2 }}>
        <T variant="small" style={{ color: c.primary, fontWeight: '700' }}>{APP_NAME}</T>
        <T variant="title">{t('listTitle')}</T>
      </View>
      <WeeklyIndexCard />

      <PriceDropBanner />

      <View style={{ gap: space.sm }}>
        <Row>
          <Input
            value={text}
            onChangeText={setText}
            onSubmitEditing={() => submit()}
            placeholder={t('addPlaceholder')}
            returnKeyType="done"
            submitBehavior="submit"
            style={{ flex: 1 }}
            accessibilityLabel={t('addPlaceholder')}
          />
          <Button label={t('add')} onPress={() => submit()} disabled={!text.trim()} />
        </Row>
        {suggestions.length > 0 ? (
          <Row style={{ flexWrap: 'wrap' }}>
            {suggestions.map((s) => (
              <Chip key={s.id} label={s.names[settings.lang]} onPress={() => submit(s.names[settings.lang])} />
            ))}
          </Row>
        ) : null}
        <Button label={t('paste')} variant="secondary" onPress={() => router.push('/paste')} />
      </View>

      {items.length === 0 ? (
        <T variant="muted">{t('emptyList')}</T>
      ) : (
        <View style={{ gap: space.sm }}>
          {items.map((item) => (
            <ListItemRow key={item.id} item={item} />
          ))}
        </View>
      )}

      {items.length > 0 ? (
        <View style={{ gap: space.sm }}>
          <Button label={`${t('compare')} (${items.length})`} onPress={() => router.push('/compare')} />
          <Button label={t('clearList')} variant="ghost" onPress={clearItems} />
        </View>
      ) : null}
    </Screen>
  );
}
