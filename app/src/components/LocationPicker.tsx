import { isValidPostalCode, nearestPostalCode, postalCodeLocation } from '@pricing/core';
import * as Location from 'expo-location';
import { useState } from 'react';

import { View } from 'react-native';

import { Button, Input, T } from '@/components/ui';
import { useApp } from '@/state/AppState';
import { space, useColors } from '@/theme';

/** Postal code or GPS (F1). v1 covers Barcelona city postal codes. */
export function LocationPicker() {
  const { settings, updateSettings, t } = useApp();
  const c = useColors();
  const [code, setCode] = useState(settings.postalCode ?? '');
  const [error, setError] = useState<string | null>(null);
  const [locating, setLocating] = useState(false);

  const applyCode = (value: string) => {
    const clean = value.replace(/\D/g, '').slice(0, 5);
    setCode(clean);
    if (clean.length < 5) return;
    if (isValidPostalCode(clean) && postalCodeLocation(clean)) {
      setError(null);
      updateSettings({ postalCode: clean, location: null });
    } else {
      setError(t('postalInvalid'));
    }
  };

  const useGps = async () => {
    setLocating(true);
    setError(null);
    try {
      const { status } = await Location.requestForegroundPermissionsAsync();
      if (status !== 'granted') throw new Error('denied');
      const pos = await Location.getCurrentPositionAsync({ accuracy: Location.Accuracy.Balanced });
      const location = { lat: pos.coords.latitude, lng: pos.coords.longitude };
      const nearest = nearestPostalCode(location);
      setCode(nearest ?? '');
      updateSettings({ location, postalCode: nearest });
    } catch {
      setError(t('gpsDenied'));
    } finally {
      setLocating(false);
    }
  };

  return (
    <>
      <View style={{ gap: space.sm }}>
        <Input
          value={code}
          onChangeText={applyCode}
          placeholder={t('postalPlaceholder')}
          keyboardType="number-pad"
          maxLength={5}
          accessibilityLabel={t('postalCode')}
        />
        <Button label={t('useGps')} onPress={useGps} variant="secondary" loading={locating} />
      </View>
      {error ? <T variant="small" style={{ color: c.high }}>{error}</T> : null}
    </>
  );
}
