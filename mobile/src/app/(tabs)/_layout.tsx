import { Tabs } from 'expo-router';
import { ColorValue, Text } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { palette } from '@/constants/market-theme';

const SURGE_ALERTS_ENABLED = process.env.EXPO_PUBLIC_SURGE_ALERTS_ENABLED === 'true';

const icon = (glyph: string, color: ColorValue) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;

export default function TabLayout() {
  const insets = useSafeAreaInsets();
  const bottomInset = Math.max(insets.bottom, 8);

  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarHideOnKeyboard: true,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          height: 62 + bottomInset,
          paddingTop: 8,
          paddingBottom: bottomInset,
        },
        tabBarLabelStyle: { fontSize: 10, fontWeight: '700' },
      }}>
      <Tabs.Screen
        name="index"
        options={{ title: '홈', tabBarIcon: ({ color }) => icon('⌂', color) }}
      />
      <Tabs.Screen
        name="watchlist"
        options={{ title: '관심', tabBarIcon: ({ color }) => icon('☆', color) }}
      />
      <Tabs.Screen
        name="movers"
        options={SURGE_ALERTS_ENABLED
          ? { title: '급등', tabBarIcon: ({ color }) => icon('↗', color) }
          : { href: null }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: '일정', tabBarIcon: ({ color }) => icon('◷', color) }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: '보고서', tabBarIcon: ({ color }) => icon('▤', color) }}
      />
      <Tabs.Screen
        name="settings"
        options={{ href: null }}
      />
    </Tabs>
  );
}
