/**
 * Push notification registration — 03_TechSpec §3.4, 12_Mobile_App_Spec §7.
 *
 * Registers the Expo push token with `POST /api/device-tokens` after login
 * (06_App_Flow §2) and unregisters it on logout, which 07_Security_and_Privacy §7
 * requires so a signed-out device stops receiving that account's notifications.
 */

import * as Notifications from 'expo-notifications';
import * as Device from 'expo-device';
import Constants from 'expo-constants';
import { Platform } from 'react-native';
import type { DeviceToken } from '@ims/shared-types';
import { api } from '@/lib/api/client';

/** The last token we registered, so logout can unregister exactly that one. */
let registeredToken: string | null = null;

/**
 * Requests permission and registers the token.
 *
 * Returns null rather than throwing on every failure path — a student who declines
 * notifications must still be able to use the app, and 02_SRS §4 treats push as one
 * channel alongside the in-app list, which always works.
 */
export async function registerForPushNotifications(): Promise<string | null> {
  // Simulators and emulators cannot receive push notifications.
  if (!Device.isDevice) return null;

  try {
    const existing = await Notifications.getPermissionsAsync();
    let status = existing.status;

    if (status !== 'granted') {
      const requested = await Notifications.requestPermissionsAsync();
      status = requested.status;
    }

    if (status !== 'granted') return null;

    if (Platform.OS === 'android') {
      // Android requires a channel before any notification can be shown. The colour
      // matches the institution blue named in 12_Mobile_App_Spec §7.
      await Notifications.setNotificationChannelAsync('default', {
        name: 'Internship reminders',
        importance: Notifications.AndroidImportance.HIGH,
        lightColor: '#1e3a5f',
        vibrationPattern: [0, 250, 250, 250],
      });
    }

    // The EAS project id is required for a token in SDK 49+.
    const projectId =
      Constants.expoConfig?.extra?.eas?.projectId ?? Constants.easConfig?.projectId;

    const tokenResponse = await Notifications.getExpoPushTokenAsync(
      projectId ? { projectId } : undefined,
    );

    const token = tokenResponse.data;

    await api.post<DeviceToken>('/device-tokens', {
      expoPushToken: token,
      platform: Platform.OS === 'ios' ? 'ios' : 'android',
      appVersion: Constants.expoConfig?.version ?? '1.0.0',
    });

    registeredToken = token;
    return token;
  } catch {
    // A registration failure must not block sign-in.
    return null;
  }
}

/** Removes the token server-side. Called during logout while the session is still valid. */
export async function unregisterPushToken(): Promise<void> {
  if (!registeredToken) return;
  // The token contains `[` and `]`, so it has to be encoded into the path.
  await api.delete(`/device-tokens/${encodeURIComponent(registeredToken)}`);
  registeredToken = null;
}

/**
 * Foreground presentation.
 *
 * Notifications are shown even while the app is open, because the reminders in
 * 02_SRS §4 are time-based and a student with the app idle in the foreground should
 * still see them.
 */
export function configureNotificationHandler(): void {
  Notifications.setNotificationHandler({
    handleNotification: async () => ({
      shouldShowBanner: true,
      shouldShowList: true,
      shouldPlaySound: true,
      shouldSetBadge: true,
    }),
  });
}
