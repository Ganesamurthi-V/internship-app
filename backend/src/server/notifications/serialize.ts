/**
 * Device token serialisation.
 *
 * The Expo push token is returned to its owner only — the endpoints that use this
 * are scoped to `auth.userId`. It is not secret in the way a password is, but it is
 * device-identifying (07_Security_and_Privacy §7), so it never appears in a
 * response to anyone else.
 */

import type { DeviceToken, DevicePlatform } from '@ims/shared-types';
import { toRequiredIso } from '@/lib/serialize';

type DeviceTokenRow = {
  id: string;
  userId: string;
  expoPushToken: string;
  platform: string;
  appVersion: string | null;
  lastActiveAt: Date;
  createdAt: Date;
};

export function serializeDeviceToken(row: DeviceTokenRow): DeviceToken {
  return {
    id: row.id,
    userId: row.userId,
    expoPushToken: row.expoPushToken,
    platform: row.platform as DevicePlatform,
    appVersion: row.appVersion,
    lastActiveAt: toRequiredIso(row.lastActiveAt),
    createdAt: toRequiredIso(row.createdAt),
  };
}
