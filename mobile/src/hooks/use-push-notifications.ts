import { useEffect } from 'react';
import { AppState, Platform } from 'react-native';
import Constants from 'expo-constants';
import * as Notifications from 'expo-notifications';
import { useRouter } from 'expo-router';

import { registerPushToken } from '@/lib/market-api';

Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowBanner: true,
    shouldShowList: true,
    shouldPlaySound: true,
    shouldSetBadge: false,
  }),
});

async function registerForRemoteNotifications() {
  if (Platform.OS === 'web') return;

  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('surge-alerts', {
      name: '급등 알림',
      description: '상승률과 거래량 기준을 새로 충족한 종목 알림',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 180, 250],
      sound: 'default',
    });
  }

  const existing = await Notifications.getPermissionsAsync();
  let status = existing.status;

  if (status !== 'granted') {
    const requested = await Notifications.requestPermissionsAsync();
    status = requested.status;
  }

  if (status !== 'granted') return;

  const projectId =
    Constants.expoConfig?.extra?.eas?.projectId
    ?? Constants.easConfig?.projectId;

  if (!projectId) {
    console.warn('Expo EAS projectId is not configured; remote push registration skipped.');
    return;
  }

  const token = (await Notifications.getExpoPushTokenAsync({ projectId })).data;
  await registerPushToken({
    token,
    platform: Platform.OS === 'ios' ? 'ios' : 'android',
  });
}

export function usePushNotifications() {
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;

    const register = async () => {
      try {
        await registerForRemoteNotifications();
      } catch (error) {
        if (!cancelled) {
          console.warn('Push notification registration failed', error);
        }
      }
    };

    void register();

    const appStateSubscription = AppState.addEventListener('change', (state) => {
      if (state === 'active') void register();
    });

    const responseSubscription = Notifications.addNotificationResponseReceivedListener((response) => {
      const screen = response.notification.request.content.data?.screen;
      if (screen === 'movers') {
        router.push('/(tabs)/movers');
      }
    });

    return () => {
      cancelled = true;
      appStateSubscription.remove();
      responseSubscription.remove();
    };
  }, [router]);
}
