import { router } from 'expo-router';
import { View } from 'react-native';

import { ChainPicker, LanguagePicker } from '@/components/LanguageChainPickers';
import { LocationPicker } from '@/components/LocationPicker';
import { Button, Card, Screen, T } from '@/components/ui';
import { APP_NAME } from '@/i18n';
import { useApp } from '@/state/AppState';
import { space, useColors } from '@/theme';

export default function Onboarding() {
  const { settings, updateSettings, origin, t } = useApp();
  const c = useColors();
  const finish = () => {
    updateSettings({ onboarded: true });
    router.replace('/');
  };
  return (
    <Screen edges={['top', 'bottom']}>
      <View style={{ gap: space.sm, paddingTop: space.xl }}>
        <T variant="title" style={{ color: c.primary }}>{APP_NAME}</T>
        <T variant="heading">{t('tagline')}</T>
        <T variant="muted">{t('welcomeBody')}</T>
      </View>

      <Card>
        <T variant="heading">{t('language')}</T>
        <LanguagePicker />
      </Card>

      <Card>
        <T variant="heading">{t('postalCode')}</T>
        <LocationPicker />
      </Card>

      <Card>
        <T variant="heading">{t('chainsQuestion')}</T>
        <T variant="small">{t('chainsHint')}</T>
        <ChainPicker />
      </Card>

      <Button label={t('start')} onPress={finish} disabled={!origin || settings.chains.length === 0} />
    </Screen>
  );
}
