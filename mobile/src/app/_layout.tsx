import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { useSurgeAlerts } from '@/hooks/use-surge-alerts';

export default function RootLayout() {
  useSurgeAlerts();

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
