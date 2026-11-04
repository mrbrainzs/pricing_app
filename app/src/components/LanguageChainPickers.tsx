import { CHAINS, ONLINE_CHAINS, type ChainId, type Lang } from '@pricing/core';
import { View } from 'react-native';

import { Chip } from '@/components/ui';
import { LANG_LABEL } from '@/i18n';
import { useApp } from '@/state/AppState';
import { space } from '@/theme';

export function LanguagePicker() {
  const { settings, updateSettings } = useApp();
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {(['ca', 'es', 'en'] as Lang[]).map((lang) => (
        <Chip key={lang} label={LANG_LABEL[lang]} selected={settings.lang === lang} onPress={() => updateSettings({ lang })} />
      ))}
    </View>
  );
}

export function ChainPicker() {
  const { settings, updateSettings } = useApp();
  const toggle = (id: ChainId) => {
    const has = settings.chains.includes(id);
    const next = has ? settings.chains.filter((c) => c !== id) : [...settings.chains, id];
    if (next.length > 0) updateSettings({ chains: next });
  };
  return (
    <View style={{ flexDirection: 'row', flexWrap: 'wrap', gap: space.sm }}>
      {ONLINE_CHAINS.map((id) => (
        <Chip key={id} label={CHAINS[id].name} color={CHAINS[id].color} selected={settings.chains.includes(id)} onPress={() => toggle(id)} />
      ))}
    </View>
  );
}
