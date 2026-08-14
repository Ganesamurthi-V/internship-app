/**
 * Typed API client — 03_TechSpec §4 (`lib/api/` "typed fetch wrappers").
 *
 * Responsibilities:
 *   - unwrap the fixed `{ data }` / `{ error }` envelope from 05_API_Spec,
 *   - attach the bearer token,
 *   - refresh a stale access token before the request, and retry once on a 401,
 *   - send the client platform and version headers the audit log records (02_SRS §6),
 *   - surface a typed `ApiError` carrying `code` and per-field messages so forms can
 *     map them straight onto inputs.
 *
 * The refresh logic is the delicate part. Because the backend rotates refresh tokens
 * on every use (07_Security_and_Privacy §5), two concurrent refreshes would make the
 * second one present an already-rotated token, which the server treats as theft and
 * punishes by revoking every session. A single in-flight promise is therefore shared
 * by all callers — this is a correctness requirement, not an optimisation.
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type {
  ApiErrorCode,
  LoginResponse,
  RefreshResponse,
  Pagination,
} from '@ims/shared-types';
import { tokenStore } from '@/lib/auth/tokenStore';

const API_URL = process.env.EXPO_PUBLIC_API_URL ?? 'http://localhost:3000/api';

const APP_VERSION = Constants.expoConfig?.version ?? '1.0.0';

/** Error thrown by every client method on a non-2xx response. */
export class ApiError extends Error {
  readonly code: ApiErrorCode | 'NETWORK_ERROR';
  readonly status: number;
  readonly fields?: Record<string, string>;

  constructor(options: {
    code: ApiErrorCode | 'NETWORK_ERROR';
    message: string;
    status: number;
    fields?: Record<string, string>;
  }) {
    super(options.message);
    this.name = 'ApiError';
    this.code = options.code;
    this.status = options.status;
    this.fields = options.fields;
  }

  /** True when the request never reached the server — the signal to queue offline. */
  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR';
  }

  get isUnauthorized(): boolean {
    return this.code === 'UNAUTHORIZED';
  }
}

// ---------------------------------------------------------------------------
// Session state
// ---------------------------------------------------------------------------

interface SessionState {
  accessToken: string | null;
  refreshToken: string | null;
  accessTokenExpiresAt: number;
}

const session: SessionState = {
  accessToken: null,
  refreshToken: null,
  accessTokenExpiresAt: 0,
};

/** Called once at startup and after login, to prime the in-memory token. */
export function setSession(next: {
  accessToken: string;
  refreshToken: string;
  accessTokenExpiresAt: number;
}): void {
  session.accessToken = next.accessToken;
  session.refreshToken = next.refreshToken;
  session.accessTokenExpiresAt = next.accessTokenExpiresAt;
}

export function clearSession(): void {
  session.accessToken = null;
  session.refreshToken = null;
  session.accessTokenExpiresAt = 0;
}

export function hasSession(): boolean {
  return session.refreshToken !== null;
}

/**
 * Invoked when the refresh token is rejected, i.e. the session is unrecoverable.
 * The auth store registers a handler that clears state and routes to login.
 */
type SessionExpiredHandler = () => void;
let onSessionExpired: SessionExpiredHandler = () => {};

export function setSessionExpiredHandler(handler: SessionExpiredHandler): void {
  onSessionExpired = handler;
}

// ---------------------------------------------------------------------------
// Refresh
// ---------------------------------------------------------------------------

/** Shared in-flight refresh. See the note at the top of the file. */
let refreshInFlight: Promise<string | null> | null = null;

async function refreshAccessToken(): Promise<string | null> {
  if (refreshInFlight) return refreshInFlight;

  refreshInFlight = (async () => {
    const refreshToken = session.refreshToken ?? (await tokenStore.load())?.refreshToken ?? null;
    if (!refreshToken) return null;

    try {
      const response = await fetch(`${API_URL}/auth/refresh`, {
        method: 'POST',
        headers: baseHeaders(),
        body: JSON.stringify({ refreshToken }),
      });

      if (!response.ok) {
        // The refresh token is invalid, revoked, or was already rotated. There is no
        // recovery path from here.
        await tokenStore.clear();
        clearSession();
        onSessionExpired();
        return null;
      }

      const body = (await response.json()) as { data: RefreshResponse };
      const { accessToken, refreshToken: rotated, expiresIn } = body.data;

      // The rotated refresh token must be persisted, or the next refresh presents a
      // spent token and the server revokes the whole family.
      const expiresAt = await tokenStore.updateAccessToken(accessToken, expiresIn);
      await tokenStore.updateRefreshToken(rotated);

      setSession({ accessToken, refreshToken: rotated, accessTokenExpiresAt: expiresAt });
      return accessToken;
    } catch {
      // A network failure during refresh is not a session failure — the token may
      // still be perfectly valid once connectivity returns.
      return null;
    } finally {
      refreshInFlight = null;
    }
  })();

  return refreshInFlight;
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

function baseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    // Recorded on audit rows (02_SRS §6).
    'x-client-platform': Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    'x-client-version': APP_VERSION,
  };
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip the bearer token, for the public invite endpoints. */
  anonymous?: boolean;
  signal?: AbortSignal;
}

function buildUrl(path: string, query?: RequestOptions['query']): string {
  const url = new URL(`${API_URL}${path.startsWith('/') ? path : `/${path}`}`);
  if (query) {
    for (const [key, value] of Object.entries(query)) {
      if (value === undefined || value === null || value === '') continue;
      url.searchParams.set(key, String(value));
    }
  }
  return url.toString();
}

async function request<T>(path: string, options: RequestOptions = {}): Promise<T> {
  const { method = 'GET', body, query, anonymous = false, signal } = options;

  if (!anonymous) {
    // Refresh proactively when the token is expired or about to be, so the common
    // case is one request rather than a 401 followed by a retry.
    if (session.refreshToken && session.accessTokenExpiresAt <= Date.now()) {
      await refreshAccessToken();
    }
  }

  const send = async (token: string | null): Promise<Response> => {
    const headers = baseHeaders();
    if (token) headers.Authorization = `Bearer ${token}`;

    try {
      return await fetch(buildUrl(path, query), {
        method,
        headers,
        body: body === undefined ? undefined : JSON.stringify(body),
        signal,
      });
    } catch (error) {
      // `fetch` rejects only on network failure. This is the signal the offline queue
      // and the OfflineBanner key off.
      throw new ApiError({
        code: 'NETWORK_ERROR',
        message:
          error instanceof Error && error.name === 'AbortError'
            ? 'Request cancelled.'
            : 'No connection. Your work will be saved and synced automatically.',
        status: 0,
      });
    }
  };

  let response = await send(anonymous ? null : session.accessToken);

  // Retry once on 401: the token may have been revoked or the clock may have drifted.
  if (response.status === 401 && !anonymous) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      response = await send(refreshed);
    }
  }

  if (response.status === 204) {
    return undefined as T;
  }

  let payload: unknown;
  try {
    payload = await response.json();
  } catch {
    payload = null;
  }

  if (!response.ok) {
    const error = (payload as { error?: { code?: ApiErrorCode; message?: string; fields?: Record<string, string> } })
      ?.error;

    throw new ApiError({
      code: error?.code ?? 'SERVER_ERROR',
      message: error?.message ?? 'Something went wrong. Try again.',
      status: response.status,
      ...(error?.fields ? { fields: error.fields } : {}),
    });
  }

  // Every success is `{ data: ... }` (05_API_Spec).
  return (payload as { data: T }).data;
}

/** List responses carry a `pagination` sibling to `data`. */
async function requestList<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ items: T[]; pagination: Pagination }> {
  const { method = 'GET', body, query, signal } = options;

  if (session.refreshToken && session.accessTokenExpiresAt <= Date.now()) {
    await refreshAccessToken();
  }

  const headers = baseHeaders();
  if (session.accessToken) headers.Authorization = `Bearer ${session.accessToken}`;

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch {
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message: 'No connection. Showing the last data we have.',
      status: 0,
    });
  }

  if (response.status === 401) {
    const refreshed = await refreshAccessToken();
    if (refreshed) {
      headers.Authorization = `Bearer ${refreshed}`;
      response = await fetch(buildUrl(path, query), { method, headers, signal });
    }
  }

  const payload = (await response.json().catch(() => null)) as {
    data?: T[];
    pagination?: Pagination;
    error?: { code?: ApiErrorCode; message?: string; fields?: Record<string, string> };
  } | null;

  if (!response.ok) {
    throw new ApiError({
      code: payload?.error?.code ?? 'SERVER_ERROR',
      message: payload?.error?.message ?? 'Something went wrong. Try again.',
      status: response.status,
      ...(payload?.error?.fields ? { fields: payload.error.fields } : {}),
    });
  }

  return {
    items: payload?.data ?? [],
    pagination:
      payload?.pagination ?? { page: 1, pageSize: 0, total: 0, totalPages: 0 },
  };
}

export const api = {
  get: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    request<T>(path, { method: 'GET', query, signal }),

  list: <T>(path: string, query?: RequestOptions['query'], signal?: AbortSignal) =>
    requestList<T>(path, { method: 'GET', query, signal }),

  post: <T>(path: string, body?: unknown) => request<T>(path, { method: 'POST', body }),

  patch: <T>(path: string, body?: unknown) => request<T>(path, { method: 'PATCH', body }),

  delete: <T>(path: string) => request<T>(path, { method: 'DELETE' }),

  /** For the public mentor invite endpoints, which take no bearer token. */
  anonymous: {
    get: <T>(path: string) => request<T>(path, { method: 'GET', anonymous: true }),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body, anonymous: true }),
  },
};

/**
 * Login is separate because it establishes the session rather than using it.
 * Persisting the tokens is part of the operation, so no caller can forget to.
 */
export async function login(email: string, password: string): Promise<LoginResponse> {
  const result = await request<LoginResponse>('/auth/login', {
    method: 'POST',
    body: { email, password },
    anonymous: true,
  });

  const stored = await tokenStore.save({
    accessToken: result.accessToken,
    refreshToken: result.refreshToken,
    expiresIn: result.expiresIn,
  });

  setSession({
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    accessTokenExpiresAt: stored.accessTokenExpiresAt,
  });

  return result;
}

/** Restores a session from secure storage at app launch. */
export async function restoreSession(): Promise<boolean> {
  const stored = await tokenStore.load();
  if (!stored) return false;

  setSession({
    accessToken: stored.accessToken,
    refreshToken: stored.refreshToken,
    accessTokenExpiresAt: stored.accessTokenExpiresAt,
  });

  return true;
}

export { API_URL };
