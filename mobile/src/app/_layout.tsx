import { Stack } from 'expo-router';
import { StatusBar } from 'expo-status-bar';

import { usePushNotifications } from '@/hooks/use-push-notifications';

export default function RootLayout() {
  usePushNotifications();

  return (
    <>
      <StatusBar style="light" />
      <Stack screenOptions={{ headerShown: false }} />
    </>
  );
}
