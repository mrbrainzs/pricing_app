import { Ionicons } from '@expo/vector-icons';
import { Redirect } from 'expo-router';
import { Tabs } from 'expo-router/js-tabs';

import { useApp } from '@/state/AppState';
import { useColors } from '@/theme';

export default function TabsLayout() {
  const { ready, settings, t } = useApp();
  const c = useColors();
  if (!ready) return null;
  if (!settings.onboarded) return <Redirect href="/onboarding" />;
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: c.primary,
        tabBarInactiveTintColor: c.muted,
        tabBarStyle: { backgroundColor: c.card, borderTopColor: c.border },
        sceneStyle: { backgroundColor: c.bg },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: t('tabList'), tabBarIcon: ({ color, size }) => <Ionicons name="list" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="search"
        options={{ title: t('tabSearch'), tabBarIcon: ({ color, size }) => <Ionicons name="search" color={color as string} size={size} /> }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: t('tabSettings'), tabBarIcon: ({ color, size }) => <Ionicons name="options-outline" color={color as string} size={size} /> }}
      />
    </Tabs>
  );
}
