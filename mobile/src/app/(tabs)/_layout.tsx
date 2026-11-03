import Ionicons from '@expo/vector-icons/Ionicons';
import { Tabs } from 'expo-router';
import type { ComponentProps } from 'react';
import type { ColorValue } from 'react-native';

import { BORDERS, SONGA_THEME } from '@/theme';

type IconName = ComponentProps<typeof Ionicons>['name'];

function tabIcon(active: IconName, inactive: IconName) {
  return function TabIcon({ color, focused, size }: { color: ColorValue; focused: boolean; size: number }) {
    return <Ionicons name={focused ? active : inactive} color={typeof color === 'string' ? color : undefined} size={size} />;
  };
}

export default function TabsLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: SONGA_THEME.primaryAccent,
        tabBarInactiveTintColor: SONGA_THEME.textMuted,
        tabBarLabelStyle: { fontSize: 12, fontWeight: '600' },
        tabBarStyle: {
          backgroundColor: SONGA_THEME.background,
          borderTopColor: SONGA_THEME.surfaceNatural,
          borderTopWidth: BORDERS.hard,
        },
        sceneStyle: { backgroundColor: SONGA_THEME.background },
        tabBarHideOnKeyboard: true,
      }}
    >
      {/* tabBarHideOnKeyboard: on Android the tab bar would otherwise ride up on top of the keyboard. */}
      <Tabs.Screen name="index" options={{ title: 'Speak', tabBarIcon: tabIcon('chatbubbles', 'chatbubbles-outline') }} />
      <Tabs.Screen name="look" options={{ title: 'Look', tabBarIcon: tabIcon('scan', 'scan-outline') }} />
      <Tabs.Screen name="journal" options={{ title: 'Journal', tabBarIcon: tabIcon('book', 'book-outline') }} />
      <Tabs.Screen name="anchor" options={{ title: 'Anchor', tabBarIcon: tabIcon('compass', 'compass-outline') }} />
    </Tabs>
  );
}
