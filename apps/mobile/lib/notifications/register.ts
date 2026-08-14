/**
 * Push notification registration — safe for Expo Go.
 *
 * Since SDK 53, expo-notifications push functionality is NOT available in Expo Go.
 * All notification calls are wrapped in try/catch so the app runs without them.
 * Push notifications will only work in a development build (eas build).
 */

import { Platform } from 'react-native';

/** Safely try to import expo-notifications — returns null if unavailable */
async function getNotificationsModule() {
  try {
    const mod = await import('expo-notifications');
    return mod;
  } catch {
    return null;
  }
}

let registeredToken: string | null = null;

/**
 * Registers for push notifications. Returns null in Expo Go (expected).
 * Only works in development/production builds with native modules.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  if (Platform.OS === 'web') return null;

  try {
    const Notifications = await getNotificationsModule();
    if (!Notifications) return null;

    const Device = await import('expo-device');
    if (!Device.isDevice) return null;

    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Internship reminders',
        importance: Notifications.AndroidImportance.HIGH,
      });
    }

    const Constants = await import('expo-constants');
    const projectId =
      Constants.default.expoConfig?.extra?.eas?.projectId ??
      (Constants.default as unknown as { easConfig?: { projectId?: string } }).easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    registeredToken = tokenResponse.data;

    // Register with our backend (best effort)
    try {
      const { api } = await import('@/lib/api/client');
      await api.post('/device-tokens', {
        expoPushToken: registeredToken,
        platform: Platform.OS === 'ios' ? 'ios' : 'android',
        appVersion: Constants.default.expoConfig?.version ?? '1.0.0',
      });
    } catch {
      // Backend might not be running — that's fine
    }

    return registeredToken;
  } catch (error) {
    // expo-notifications not available (Expo Go) — completely expected
    console.log('Push notifications not available:', (error as Error)?.message ?? 'unknown');
    return null;
  }
}

/** Removes the push token from the backend. Best-effort. */
export async function unregisterPushToken(): Promise<void> {
  if (!registeredToken) return;
  try {
    const { api } = await import('@/lib/api/client');
    await api.delete(`/device-tokens/${encodeURIComponent(registeredToken)}`);
    registeredToken = null;
  } catch {
    // Best effort
  }
}

/**
 * Configures foreground notification display.
 * No-op in Expo Go since notifications aren't available.
 */
export function configureNotificationHandler(): void {
  if (Platform.OS === 'web') return;

  // Use dynamic import to avoid crash at module load time
  void (async () => {
    try {
      const Notifications = await getNotificationsModule();
      if (!Notifications) return;

      Notifications.setNotificationHandler({
        handleNotification: async () => ({
          shouldShowBanner: true,
          shouldShowList: true,
          shouldPlaySound: true,
          shouldSetBadge: true,
        }),
      });
    } catch {
      // Not available in Expo Go — expected
    }
  })();
}
