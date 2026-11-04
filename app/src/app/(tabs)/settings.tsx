import { router } from 'expo-router';

import { Button, Card, Chip, Row, Screen, Stepper, T } from '@/components/ui';
import { ChainPicker, LanguagePicker } from '@/components/LanguageChainPickers';
import { LocationPicker } from '@/components/LocationPicker';
import { APP_NAME, money } from '@/i18n';
import { useAlerts } from '@/state/Alerts';
import { useApp } from '@/state/AppState';

const DISTANCES = [1, 2, 3, 5];

export default function SettingsScreen() {
  const { settings, updateSettings, t } = useApp();
  const { alerts } = useAlerts();
  return (
    <Screen>
      <T variant="title">{t('settingsTitle')}</T>
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
        <ChainPicker />
      </Card>
      <Card>
        <T variant="heading">{t('maxDistance')}</T>
        <Row style={{ flexWrap: 'wrap' }}>
          {DISTANCES.map((d) => (
            <Chip key={d} label={`${d} km`} selected={settings.maxDistanceKm === d} onPress={() => updateSettings({ maxDistanceKm: d })} />
          ))}
        </Row>
      </Card>
      <Card>
        <T variant="heading">{t('minSaving')}</T>
        <Row style={{ justifyContent: 'space-between' }}>
          <T variant="price">{money(settings.minSaving, settings.lang)}</T>
          <Stepper value={settings.minSaving} onChange={(minSaving) => updateSettings({ minSaving: Math.min(20, minSaving) })} />
        </Row>
      </Card>
      <Card>
        <T variant="heading">{t('alertsTitle')}</T>
        <T variant="muted">{alerts.length ? t('alertsCount', { n: alerts.length }) : t('alertsSettingsBody')}</T>
        <Button label={t('alertsManage')} variant="secondary" onPress={() => router.push('/alerts')} />
      </Card>
      <Card>
        <T variant="heading">{t('dataSource')}</T>
        <T variant="muted">{t('dataSourceBody')}</T>
        <T variant="small">{t('storesAttribution')}</T>
      </Card>
      <T variant="small">{APP_NAME} 0.1.0</T>
    </Screen>
  );
}
