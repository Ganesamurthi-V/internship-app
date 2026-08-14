/**
 * Token storage — 07_Security_and_Privacy §3.1.
 *
 * "Access token and refresh token stored in `expo-secure-store` (iOS Keychain /
 * Android Keystore). Never stored in AsyncStorage (plaintext) or Redux/Zustand
 * without secure-store backing."
 *
 * The Zustand auth store holds the access token in memory for request headers, but
 * this module is the only durable home for either token. Nothing here ever writes to
 * AsyncStorage.
 */

import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';

const ACCESS_TOKEN_KEY = 'ims.accessToken';
const REFRESH_TOKEN_KEY = 'ims.refreshToken';
const ACCESS_TOKEN_EXPIRY_KEY = 'ims.accessTokenExpiresAt';
const BIOMETRIC_ENABLED_KEY = 'ims.biometricEnabled';

/**
 * SecureStore is unavailable on web, where `expo-secure-store` has no Keychain to
 * fall back on. The faculty portal is a separate Next.js app, so the mobile app is
 * only ever run on web during development — this keeps that from crashing rather
 * than pretending the storage is secure.
 */
const isSupported = Platform.OS !== 'web';

const memoryFallback = new Map<string, string>();

async function setItem(key: string, value: string): Promise<void> {
  if (!isSupported) {
    memoryFallback.set(key, value);
    return;
  }
  await SecureStore.setItemAsync(key, value, {
    // Tokens are needed by the background sync task, which can run while the device
    // is locked, so `AFTER_FIRST_UNLOCK` rather than `WHEN_UNLOCKED`.
    keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK,
  });
}

async function getItem(key: string): Promise<string | null> {
  if (!isSupported) return memoryFallback.get(key) ?? null;
  return SecureStore.getItemAsync(key);
}

async function deleteItem(key: string): Promise<void> {
  if (!isSupported) {
    memoryFallback.delete(key);
    return;
  }
  await SecureStore.deleteItemAsync(key);
}

export interface StoredSession {
  accessToken: string;
  refreshToken: string;
  /** Unix milliseconds. */
  accessTokenExpiresAt: number;
}

export const tokenStore = {
  /**
   * Persists a session.
   *
   * `expiresIn` arrives in seconds from the API and is converted to an absolute
   * instant here, with 30 seconds shaved off. That margin means the client refreshes
   * slightly early rather than firing a request that arrives just after expiry and
   * comes back 401.
   */
  async save(session: {
    accessToken: string;
    refreshToken: string;
    expiresIn: number;
  }): Promise<StoredSession> {
    const accessTokenExpiresAt = Date.now() + (session.expiresIn - 30) * 1000;

    await Promise.all([
      setItem(ACCESS_TOKEN_KEY, session.accessToken),
      setItem(REFRESH_TOKEN_KEY, session.refreshToken),
      setItem(ACCESS_TOKEN_EXPIRY_KEY, String(accessTokenExpiresAt)),
    ]);

    return {
      accessToken: session.accessToken,
      refreshToken: session.refreshToken,
      accessTokenExpiresAt,
    };
  },

  async load(): Promise<StoredSession | null> {
    const [accessToken, refreshToken, expiry] = await Promise.all([
      getItem(ACCESS_TOKEN_KEY),
      getItem(REFRESH_TOKEN_KEY),
      getItem(ACCESS_TOKEN_EXPIRY_KEY),
    ]);

    // A refresh token alone is enough to recover a session; a missing refresh token
    // is not, so treat that as no session at all.
    if (!refreshToken) return null;

    return {
      accessToken: accessToken ?? '',
      refreshToken,
      accessTokenExpiresAt: expiry ? Number(expiry) : 0,
    };
  },

  /** Replaces only the access half, after a refresh that rotated both. */
  async updateAccessToken(accessToken: string, expiresIn: number): Promise<number> {
    const accessTokenExpiresAt = Date.now() + (expiresIn - 30) * 1000;
    await Promise.all([
      setItem(ACCESS_TOKEN_KEY, accessToken),
      setItem(ACCESS_TOKEN_EXPIRY_KEY, String(accessTokenExpiresAt)),
    ]);
    return accessTokenExpiresAt;
  },

  async updateRefreshToken(refreshToken: string): Promise<void> {
    await setItem(REFRESH_TOKEN_KEY, refreshToken);
  },

  /** 07_Security_and_Privacy §3.1: "Tokens wiped on logout". */
  async clear(): Promise<void> {
    await Promise.all([
      deleteItem(ACCESS_TOKEN_KEY),
      deleteItem(REFRESH_TOKEN_KEY),
      deleteItem(ACCESS_TOKEN_EXPIRY_KEY),
    ]);
  },

  // -------------------------------------------------------------------------
  // Biometric preference — 07_Security_and_Privacy §3.2
  // -------------------------------------------------------------------------

  async setBiometricEnabled(enabled: boolean): Promise<void> {
    await setItem(BIOMETRIC_ENABLED_KEY, enabled ? 'true' : 'false');
  },

  async isBiometricEnabled(): Promise<boolean> {
    return (await getItem(BIOMETRIC_ENABLED_KEY)) === 'true';
  },
};
