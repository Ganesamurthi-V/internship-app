/**
 * Typed API client — uses Supabase Auth for authentication.
 *
 * The access token comes from `supabase.auth.getSession()` on every request.
 * Supabase's SDK handles refresh automatically, so there is no custom refresh
 * interceptor or shared in-flight promise needed.
 *
 * The client still unwraps the `{ data }` / `{ error }` envelope from our Next.js
 * API, because our backend is a custom API server on top of Supabase (not the
 * auto-generated PostgREST API).
 */

import { Platform } from 'react-native';
import Constants from 'expo-constants';
import type { ApiErrorCode, Pagination } from '@ims/shared-types';
import { getAccessToken } from '@/lib/supabase';

/**
 * Base URL for every request, inlined by Metro when the bundle is built.
 *
 * There is no production fallback on purpose. `EXPO_PUBLIC_*` values are substituted at
 * bundle time, not read at launch, so a build made without `apps/mobile/.env` — which is
 * gitignored, so any fresh clone or CI job qualifies — compiles `undefined` here and cannot
 * be corrected without rebuilding.
 *
 * The old default was `http://localhost:3000/api`. On a phone that resolves to the phone
 * itself, so every request failed with a connection error indistinguishable from bad
 * signal: the one misconfiguration that most deserves to be obvious looked exactly like
 * the most common ordinary fault. Left empty, `assertConfigured` names the cause instead.
 *
 * Development keeps the localhost default, because that is genuinely where the API runs.
 */
// `||` rather than `??`: a variable present but blank — `EXPO_PUBLIC_API_URL=` with nothing
// after it, which is easy to leave behind while editing — is unset for every purpose that
// matters here, and `??` would accept it and skip the development default.
const configuredApiUrl = process.env.EXPO_PUBLIC_API_URL;
const API_URL = configuredApiUrl || (__DEV__ ? 'http://localhost:3000/api' : '');
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

  get isNetworkError(): boolean {
    return this.code === 'NETWORK_ERROR';
  }

  get isUnauthorized(): boolean {
    return this.code === 'UNAUTHORIZED';
  }
}

// ---------------------------------------------------------------------------
// Request
// ---------------------------------------------------------------------------

function baseHeaders(): Record<string, string> {
  return {
    'Content-Type': 'application/json',
    Accept: 'application/json',
    'x-client-platform': Platform.OS === 'ios' ? 'ios' : Platform.OS === 'android' ? 'android' : 'web',
    'x-client-version': APP_VERSION,
  };
}

/**
 * A 2xx response whose body was not the `{ data }` envelope this API always sends.
 *
 * It happens when something other than our server answers with a success status: a captive
 * portal, a proxy, or a platform error page. `response.json()` fails, the payload is null,
 * and reading `.data` off it throws a raw `TypeError` that no caller is catching — the
 * screen dies rather than showing a message.
 *
 * Raised as an `ApiError` so every existing `catch (e) { e instanceof ApiError }` path
 * handles it like any other failure.
 */
/**
 * Refuses to make a request when the build has no API URL.
 *
 * Called before the `fetch` rather than inside `buildUrl`, because `buildUrl` is evaluated
 * inside the try block that relabels anything thrown as `NETWORK_ERROR` — which would bury
 * this behind the same "check your connection" message the empty URL was causing in the
 * first place.
 */
function assertConfigured(): void {
  if (API_URL) return;
  throw new ApiError({
    code: 'SERVER_ERROR',
    message:
      'This build has no API server configured. EXPO_PUBLIC_API_URL was missing when it ' +
      'was bundled — see apps/mobile/.env.example — and it cannot be set without rebuilding.',
    status: 0,
  });
}

function malformedResponse(status: number): ApiError {
  return new ApiError({
    code: 'SERVER_ERROR',
    message: 'The server sent a response the app could not read. Try again.',
    status,
  });
}

interface RequestOptions {
  method?: 'GET' | 'POST' | 'PATCH' | 'DELETE';
  body?: unknown;
  query?: Record<string, string | number | boolean | undefined | null>;
  /** Skip auth token (for public endpoints like invite validation). */
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

  assertConfigured();

  const headers = baseHeaders();

  if (!anonymous) {
    const token = await getAccessToken();
    if (token) {
      headers.Authorization = `Bearer ${token}`;
    }
  }

  let response: Response;
  try {
    response = await fetch(buildUrl(path, query), {
      method,
      headers,
      body: body === undefined ? undefined : JSON.stringify(body),
      signal,
    });
  } catch (error) {
    throw new ApiError({
      code: 'NETWORK_ERROR',
      message:
        error instanceof Error && error.name === 'AbortError'
          ? 'Request cancelled.'
          : 'No connection. Check your network and try again.',
      status: 0,
    });
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

  // `in` rather than a truthiness check, so an endpoint that legitimately answers
  // `{ data: null }` is still treated as a successful response.
  if (payload === null || typeof payload !== 'object' || !('data' in payload)) {
    throw malformedResponse(response.status);
  }

  return (payload as { data: T }).data;
}

async function requestList<T>(
  path: string,
  options: RequestOptions = {},
): Promise<{ items: T[]; pagination: Pagination }> {
  const { method = 'GET', body, query, signal } = options;

  assertConfigured();

  const headers = baseHeaders();
  const token = await getAccessToken();
  if (token) headers.Authorization = `Bearer ${token}`;

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
      message: 'No connection. Check your network and try again.',
      status: 0,
    });
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

  // A 204 has no body to parse, and for a list that genuinely means "nothing here".
  if (response.status === 204) {
    return { items: [], pagination: { page: 1, pageSize: 0, total: 0, totalPages: 0 } };
  }

  // An unreadable body is not an empty list. Falling back to `[]` rendered "no results" on
  // every screen that shows one — a faculty reviewer would see an empty review queue and
  // reasonably conclude there was nothing waiting, which is worse than an error.
  if (payload === null || !Array.isArray(payload.data)) {
    throw malformedResponse(response.status);
  }

  const items = payload.data;

  return {
    items,
    // Derived from what actually arrived rather than zeroed. A missing `pagination` with
    // `total: 0` alongside a non-empty `items` is a contradiction, and anything showing a
    // count from it would report none while the list underneath was populated.
    pagination: payload.pagination ?? {
      page: 1,
      pageSize: items.length,
      total: items.length,
      totalPages: 1,
    },
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

  anonymous: {
    get: <T>(path: string) => request<T>(path, { method: 'GET', anonymous: true }),
    post: <T>(path: string, body?: unknown) =>
      request<T>(path, { method: 'POST', body, anonymous: true }),
  },
};

/**
 * Checks if there is an active auth session.
 */
export async function hasSession(): Promise<boolean> {
  const token = await getAccessToken();
  return token !== null;
}

export { API_URL };
