import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { PreferencesProvider } from '@/storage/preferences';
import { SONGA_THEME } from '@/theme';

export default function RootLayout() {
  return (
    <PreferencesProvider>
      <StatusBar style="dark" />
      <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: SONGA_THEME.background } }}>
        <Stack.Screen name="(tabs)" />
      </Stack>
    </PreferencesProvider>
  );
}
