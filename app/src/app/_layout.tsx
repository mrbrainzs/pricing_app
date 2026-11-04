import { DarkTheme, DefaultTheme, Stack, ThemeProvider } from 'expo-router';
import { StatusBar } from 'expo-status-bar';
import { useColorScheme } from 'react-native';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { AppStateProvider, useApp } from '@/state/AppState';
import { useColors } from '@/theme';

function RootStack() {
  const c = useColors();
  const { t } = useApp();
  return (
    <Stack
      screenOptions={{
        headerStyle: { backgroundColor: c.bg },
        headerTintColor: c.primary,
        headerTitleStyle: { color: c.text },
        headerShadowVisible: false,
        contentStyle: { backgroundColor: c.bg },
      }}>
      <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      <Stack.Screen name="onboarding" options={{ headerShown: false }} />
      <Stack.Screen name="compare" options={{ title: t('compareTitle') }} />
      <Stack.Screen name="product/[id]" options={{ title: '' }} />
      <Stack.Screen name="paste" options={{ title: t('pasteTitle'), presentation: 'modal' }} />
    </Stack>
  );
}

export default function RootLayout() {
  const scheme = useColorScheme();
  return (
    <SafeAreaProvider>
      <ThemeProvider value={scheme === 'dark' ? DarkTheme : DefaultTheme}>
        <AppStateProvider>
          <StatusBar style="auto" />
          <RootStack />
        </AppStateProvider>
      </ThemeProvider>
    </SafeAreaProvider>
  );
}
