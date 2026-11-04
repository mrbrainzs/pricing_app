import { lookupBarcode, parseBarcode, type PriceObservation } from '@pricing/core';
import { router, Stack } from 'expo-router';
import { useMemo, useState } from 'react';

import { BarcodeCamera, HAS_CAMERA_SCANNER } from '@/components/BarcodeCamera';
import { Button, Card, Input, Row, Screen, T } from '@/components/ui';
import { latestByProduct } from '@/data/prices';
import { useApp } from '@/state/AppState';
import { useColors } from '@/theme';

/**
 * Barcode scanner (F9). Phones scan with the camera; the web build, and anyone without
 * camera access, types the digits. A known product opens its page; anything else opens
 * the barcode screen, which always offers a way on (own-brand equivalents or search).
 */
export default function ScanScreen() {
  const { catalog, t } = useApp();
  const c = useColors();
  const [text, setText] = useState('');
  const [error, setError] = useState<string | null>(null);
  const latest = useMemo(() => (catalog ? latestByProduct(catalog.prices) : new Map<string, PriceObservation>()), [catalog]);

  const open = (input: string) => {
    if (!catalog) {
      // Prices still loading: the barcode screen looks the code up once they arrive.
      const parsed = parseBarcode(input);
      if (parsed) router.replace(`/barcode/${parsed.digits}`);
      else setError(t('barcodeFormatError'));
      return;
    }
    const result = lookupBarcode(input, catalog.products, (p) => latest.get(p.id));
    if (result.kind === 'found') router.replace(`/product/${encodeURIComponent(result.products[0]!.id)}`);
    else if (result.kind === 'invalid') setError(t(result.reason === 'format' ? 'barcodeFormatError' : 'barcodeCheckError'));
    else router.replace(`/barcode/${result.code}`);
  };

  return (
    <Screen edges={['bottom']}>
      <Stack.Screen options={{ title: t('scanTitle') }} />
      <BarcodeCamera onCode={open} />
      <Card>
        <T variant="heading">{t('manualTitle')}</T>
        <T variant="small">{t('manualHint')}</T>
        <Row>
          <Input
            style={{ flex: 1 }}
            value={text}
            onChangeText={(v) => {
              setText(v);
              setError(null);
            }}
            onSubmitEditing={() => open(text)}
            placeholder={t('barcodeTitle')}
            keyboardType="number-pad"
            inputMode="numeric"
            autoComplete="off"
            autoCorrect={false}
            autoFocus={!HAS_CAMERA_SCANNER}
            returnKeyType="search"
            maxLength={20}
            accessibilityLabel={t('manualTitle')}
          />
          <Button label={t('lookUp')} onPress={() => open(text)} disabled={!text.trim()} />
        </Row>
        {error ? <T variant="small" style={{ color: c.high }}>{error}</T> : null}
        {HAS_CAMERA_SCANNER ? null : <T variant="small">{t('manualWebNote')}</T>}
      </Card>
    </Screen>
  );
}
