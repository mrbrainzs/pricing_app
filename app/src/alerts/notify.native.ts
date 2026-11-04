import { PermissionStatus } from 'expo';
import * as Notifications from 'expo-notifications';
import { AndroidImportance, IosAuthorizationStatus } from 'expo-notifications';
import { useEffect, useRef } from 'react';
import { Linking, Platform } from 'react-native';

import type { NotificationPermission, Notifier } from './notify.types';

/** Local notifications only: nothing is registered with a push service. */
const CHANNEL_ID = 'price-alerts';

// While the app is open it shows its own banner, so the notification only goes to the list.
Notifications.setNotificationHandler({
  handleNotification: async () => ({ shouldShowBanner: false, shouldShowList: true, shouldPlaySound: false, shouldSetBadge: false }),
});

function toPermission(p: Notifications.NotificationPermissionsStatus): NotificationPermission {
  if (p.granted || p.ios?.status === IosAuthorizationStatus.PROVISIONAL) return 'granted';
  if (p.status === PermissionStatus.UNDETERMINED || p.canAskAgain) return 'undetermined';
  return 'denied';
}

/** Android 8+ needs a channel, and Android 13+ only shows the permission prompt once one exists. */
async function ensureChannel(name: string): Promise<void> {
  if (Platform.OS !== 'android') return;
  await Notifications.setNotificationChannelAsync(CHANNEL_ID, { name, importance: AndroidImportance.DEFAULT });
}

async function getPermission(): Promise<NotificationPermission> {
  try {
    return toPermission(await Notifications.getPermissionsAsync());
  } catch {
    return 'unsupported';
  }
}

async function requestPermission(channelName: string): Promise<NotificationPermission> {
  try {
    await ensureChannel(channelName);
    return toPermission(await Notifications.requestPermissionsAsync({ ios: { allowAlert: true, allowSound: true, allowBadge: false } }));
  } catch {
    return 'unsupported';
  }
}

const show: Notifier['show'] = async (items, channelName) => {
  if (!items.length || (await getPermission()) !== 'granted') return;
  await ensureChannel(channelName);
  for (const item of items) {
    await Notifications.scheduleNotificationAsync({
      identifier: `price-alert:${item.id}`,
      content: { title: item.title, body: item.body, data: { productId: item.productId } },
      // No trigger: show now. Android takes the channel through the trigger.
      trigger: Platform.OS === 'android' ? { channelId: CHANNEL_ID } : null,
    });
  }
};

function useTaps(open: (productId: string) => void): void {
  const response = Notifications.useLastNotificationResponse();
  const handled = useRef<string | null>(null);
  useEffect(() => {
    if (!response || response.actionIdentifier !== Notifications.DEFAULT_ACTION_IDENTIFIER) return;
    const { request, date } = response.notification;
    const key = `${request.identifier}@${date}`;
    if (handled.current === key) return;
    handled.current = key;
    const productId = request.content.data?.productId;
    if (typeof productId === 'string') open(productId);
    Notifications.clearLastNotificationResponse();
  }, [response, open]);
}

export const notifier: Notifier = {
  supported: true,
  getPermission,
  requestPermission,
  show,
  openSettings: () => {
    Linking.openSettings().catch(() => {});
  },
  useTaps,
};
