import { parseListText } from '@pricing/core';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { View } from 'react-native';

import { itemNames } from '@/components/ListItemRow';
import { Badge, Button, Card, Input, Row, Screen, T } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { space } from '@/theme';

/** Paste a list from WhatsApp or notes and turn it into items. */
export default function PasteScreen() {
  const { addItems, settings, t } = useApp();
  const [text, setText] = useState('');
  const parsed = useMemo(() => parseListText(text), [text]);

  const add = () => {
    addItems(parsed);
    router.back();
  };

  return (
    <Screen edges={['bottom']}>
      <T variant="muted">{t('pasteHint')}</T>
      <Input
        value={text}
        onChangeText={setText}
        multiline
        placeholder={t('pastePlaceholder')}
        style={{ minHeight: 160, paddingTop: space.md, textAlignVertical: 'top' }}
        autoFocus
      />
      {parsed.length > 0 ? (
        <Card>
          <T variant="heading">{t('pasteFound', { n: parsed.length })}</T>
          <View style={{ gap: space.xs }}>
            {parsed.map((item) => {
              const { main, others } = itemNames(item, settings.lang);
              return (
                <Row key={item.id} style={{ justifyContent: 'space-between' }}>
                  <View style={{ flex: 1 }}>
                    <T>{main}</T>
                    {others ? <T variant="small">{others}</T> : <T variant="small">{t('unknownItem')}</T>}
                  </View>
                  <Badge label={`× ${item.quantity}`} tone={item.categoryId ? 'primary' : 'warn'} />
                </Row>
              );
            })}
          </View>
        </Card>
      ) : null}
      <Button label={t('pasteAdd')} onPress={add} disabled={parsed.length === 0} />
    </Screen>
  );
}
