import { Tabs } from 'expo-router';
import { ColorValue, Text } from 'react-native';

import { palette } from '@/constants/market-theme';

const icon = (glyph: string, color: ColorValue) => <Text style={{ color, fontSize: 20 }}>{glyph}</Text>;

export default function TabLayout() {
  return (
    <Tabs
      screenOptions={{
        headerShown: false,
        tabBarActiveTintColor: palette.primary,
        tabBarInactiveTintColor: palette.textMuted,
        tabBarStyle: {
          backgroundColor: palette.surface,
          borderTopColor: palette.border,
          height: 70,
          paddingTop: 8,
          paddingBottom: 8,
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
        options={{ title: '급등', tabBarIcon: ({ color }) => icon('↗', color) }}
      />
      <Tabs.Screen
        name="reports"
        options={{ title: '보고서', tabBarIcon: ({ color }) => icon('▤', color) }}
      />
      <Tabs.Screen
        name="calendar"
        options={{ title: '일정', tabBarIcon: ({ color }) => icon('◷', color) }}
      />
      <Tabs.Screen
        name="settings"
        options={{ title: '설정', tabBarIcon: ({ color }) => icon('⚙', color) }}
      />
    </Tabs>
  );
}
