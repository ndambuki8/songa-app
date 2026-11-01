import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { WelcomeView } from '@/features/welcome/components/WelcomeView';
import { PreferencesProvider, usePreferences } from '@/storage/preferences';
import { SONGA_THEME } from '@/theme';

function RootNavigator() {
  const { loaded, onboarded } = usePreferences();
  if (!loaded) return null;
  if (!onboarded) return <WelcomeView />;
  return (
    <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: SONGA_THEME.background } }}>
      <Stack.Screen name="(tabs)" />
    </Stack>
  );
}

export default function RootLayout() {
  return (
    <PreferencesProvider>
      <StatusBar style="dark" />
      <RootNavigator />
    </PreferencesProvider>
  );
}
