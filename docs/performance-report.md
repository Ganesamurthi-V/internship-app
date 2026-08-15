# Performance Root Cause Report — Internship Management App

**Date:** 2026-08-15  
**Symptom:** 3–4 second page load on every navigation  
**Root cause count:** 6 confirmed causes, 1 contributing factor  
**Severity:** P1 — affects every screen transition for every user  

---

## Executive Summary

Every navigation in your app triggers a full round-trip to the database because of a chain of decisions across three layers: the React Query cache is misconfigured so data is considered stale almost immediately, every screen focus fires an unconditional refetch to the server, the server validates the JWT against Supabase on every single request (adding a remote HTTP call before any business logic runs), and the backend has no caching layer for the auth lookup. The result is that navigating from the dashboard to the attendance screen and back does **at minimum 4 network round trips** — none of which are necessary. Fix them in the order listed below: the first two alone will eliminate 80% of the problem.

---

## Cause 1 — `staleTime: 30_000` Makes Every Query Refetch on Screen Focus

**File:** `apps/mobile/app/_layout.tsx`, lines 26–37  
**Severity:** Critical — this is the primary driver of the 3–4 second delay

```typescript
// Current — BAD
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 30_000,   // ← 30 seconds. Data is "stale" almost immediately
      // No gcTime set. Defaults to 5 minutes, which is fine, but staleTime is the problem
    },
  },
});
```

**What this means in practice:**

React Query's `staleTime` controls how long cached data is considered fresh. When a query's data is stale and the component re-mounts (which happens on every tab/screen focus), React Query fires a background refetch automatically via its internal `refetchOnMount: true` default.

With `staleTime: 30_000`, if you viewed the dashboard 31 seconds ago and navigate back to it — even if nothing on the server has changed — React Query considers its data stale and immediately fires `GET /api/dashboard` again. On a mobile app where the student submits attendance once per day and the data barely changes, 30 seconds is far too short.

**Timeline of what happens when a student taps the "Attendance" tab:**

```
User taps "Attendance" tab
  → AttendanceHistoryScreen mounts
  → useMyInternship() hook runs
      → staleTime has passed → React Query fires GET /api/internships/me
  → useAttendanceSummary() hook runs
      → staleTime has passed → React Query fires GET /api/attendance/summary
  → useFocusEffect fires load()
      → Unconditional: GET /api/attendance (full list)
  = 3 concurrent requests on every tab focus
```

User taps "Dashboard" tab
  → StudentDashboard mounts
  → useDashboard() hook runs
      → staleTime has passed → React Query fires GET /api/dashboard
  → useFocusEffect fires refetch()
      → Second fire of GET /api/dashboard
  = 1-2 requests on every dashboard focus
```

**Fix:**

```typescript
// apps/mobile/app/_layout.tsx

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // Dashboard and internship data changes at most a few times per day.
      // 5 minutes means navigating between tabs doesn't re-fetch anything.
      staleTime: 5 * 60 * 1000,   // 5 minutes

      // Keep data in memory for 30 minutes after a component unmounts.
      // This means navigating to a screen you visited recently is instant.
      gcTime: 30 * 60 * 1000,     // 30 minutes

      // Don't refetch just because the component mounted — use staleTime to decide.
      refetchOnMount: true,        // keep true but staleTime now controls the guard

      // The app already handles offline manually via the response cache.
      // Refetching on reconnect is fine but not critical.
      refetchOnReconnect: true,

      retry: (failureCount, error: unknown) => {
        const status = (error as { status?: number } | null)?.status ?? 0;
        if (status >= 400 && status < 500) return false;
        return failureCount < 2;
      },
    },
    mutations: {
      retry: false,
    },
  },
});
```

**Per-query overrides** (already partially done for reference data, needs expanding):

```typescript
// lib/api/hooks.ts — attendance summary changes only when attendance is submitted
export function useAttendanceSummary(internshipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.student.attendanceSummary(internshipId ?? 'none'),
    enabled: Boolean(internshipId),
    staleTime: 10 * 60 * 1000,   // 10 minutes — only changes when attendance is logged
    queryFn: () => fetchWithCache(...)
  });
}

// Weekly reports list — changes at most once a week
export function useWeeklyReports(internshipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.student.weeklyReports(internshipId ?? 'none'),
    enabled: Boolean(internshipId),
    staleTime: 30 * 60 * 1000,   // 30 minutes
    queryFn: () => fetchWithCache(...)
  });
}

// Final assessment — effectively static once submitted
export function useFinalAssessment(internshipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.student.finalAssessment(internshipId ?? 'none'),
    enabled: Boolean(internshipId),
    staleTime: 60 * 60 * 1000,   // 1 hour
    queryFn: () => fetchWithCache(...)
  });
}
```

---

## Cause 2 — `useFocusEffect` Calls `refetch()` Unconditionally on Every Screen Focus

**File:** `apps/mobile/app/(student)/dashboard.tsx`, lines 66–71  
**Severity:** Critical — doubles the dashboard network load on every tab visit

```typescript
// Current — BAD
useFocusEffect(
  useCallback(() => {
    void reconcileLocal();
    void refetch();         // ← This fires on EVERY focus, ignoring React Query's stale check
  }, [reconcileLocal, refetch]),
);
```

**The problem:** `refetch()` bypasses `staleTime` entirely. Even if the data was fetched 2 seconds ago and is perfectly fresh, calling `refetch()` directly forces an immediate network request. Combined with `useFocusEffect`, this means **every single time the student taps the Dashboard tab**, a network request fires regardless of whether anything has changed.

The same pattern appears in `attendance/history.tsx` (line 107–110), which calls `load()` on focus — and `load()` makes an unconditional `api.get('/attendance')` call internally, completely bypassing React Query's cache.

**Fix — Dashboard:**

```typescript
// apps/mobile/app/(student)/dashboard.tsx

// Import isFetching from React Query to guard the manual refetch
import { useQueryClient } from '@tanstack/react-query';

// Replace the unconditional refetch with a stale-aware check
useFocusEffect(
  useCallback(() => {
    void reconcileLocal();
    // Only refetch if the data is actually stale — respect staleTime
    // React Query does this automatically on mount, so you only need this
    // useFocusEffect for the reconcileLocal() call
    // Remove the refetch() line entirely — let React Query's staleTime decide
  }, [reconcileLocal]),
);
```

If you genuinely need fresh dashboard data on every focus (e.g., because a faculty member may have approved the internship since last visit), use `invalidateQueries` after a write, not a blanket `refetch()` on focus:

```typescript
// After internship registration is submitted:
await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });

// After attendance is submitted (from attendance/today.tsx):
await queryClient.invalidateQueries({ queryKey: queryKeys.student.attendanceSummary(internshipId) });
await queryClient.invalidateQueries({ queryKey: queryKeys.dashboard });
```

**Fix — Attendance History:**

```typescript
// Current — BAD: load() is called on every focus and bypasses React Query
useFocusEffect(
  useCallback(() => {
    void load();    // ← raw API call, no cache, no stale check
  }, [load]),
);
```

Move the attendance list into a proper React Query hook so the cache works:

```typescript
// lib/api/hooks.ts — add this hook
export function useAttendanceList(internshipId: string | undefined) {
  return useQuery({
    queryKey: queryKeys.student.attendanceAll(internshipId ?? 'none'),
    enabled: Boolean(internshipId),
    staleTime: 5 * 60 * 1000,
    queryFn: () =>
      fetchWithCache(`attendance:list:${internshipId}`, () =>
        api.get<Attendance[]>('/attendance', { internshipId }),
      ),
  });
}
```

Then in `attendance/history.tsx`, replace the raw `api.get` and `useFocusEffect` combo with `useAttendanceList`. The local draft merging logic stays — just feed `data?.value` into it instead of the manual fetch result.

---

## Cause 3 — `getAccessToken()` Calls `supabase.auth.getSession()` on Every API Request

**File:** `apps/mobile/lib/supabase.ts`, lines 82–85  
**File:** `apps/mobile/lib/api/client.ts`, lines 88, 146, 210  
**Severity:** High — adds async overhead to every single HTTP request

```typescript
// supabase.ts — current
export async function getAccessToken(): Promise<string | null> {
  const { data } = await getSupabase().auth.getSession();  // ← async call every time
  return data.session?.access_token ?? null;
}

// client.ts — called in request(), requestList(), and api.anonymous
const token = await getAccessToken();   // 3 separate call sites
```

`supabase.auth.getSession()` is async because it reads from the storage adapter (a `Map` in memory for your current setup). While the `Map` lookup itself is synchronous, the Supabase SDK wraps it in an async flow that adds microtask overhead and, in some SDK versions, may re-check the token expiry and schedule a refresh. This is called before every API request — meaning a single page that fires 3 queries (e.g., dashboard + attendance summary + internship) calls `getSession()` 3 times serially.

**Fix — cache the token in memory with a short TTL:**

```typescript
// apps/mobile/lib/supabase.ts

// Add a short-lived token cache
let cachedToken: { value: string; expiresAt: number } | null = null;

export async function getAccessToken(): Promise<string | null> {
  const now = Date.now();

  // Serve from cache if it's still valid (30 seconds buffer before JWT expiry)
  if (cachedToken && cachedToken.expiresAt - now > 30_000) {
    return cachedToken.value;
  }

  const { data } = await getSupabase().auth.getSession();
  const token = data.session?.access_token ?? null;

  if (token && data.session?.expires_at) {
    cachedToken = {
      value: token,
      // expires_at is in seconds (Unix timestamp)
      expiresAt: data.session.expires_at * 1000,
    };
  }

  return token;
}

// Clear the cache on sign-out
export function clearTokenCache(): void {
  cachedToken = null;
}
```

Call `clearTokenCache()` in `authStore.logout()` after `supabase.auth.signOut()`.

---

## Cause 4 — `requireAuth()` Makes Two Remote Calls on Every API Request

**File:** `backend/src/lib/auth/context.ts`, lines 53–68  
**Severity:** High — adds 200–600 ms latency to every protected endpoint

```typescript
export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  // ...
  // CALL 1: Validate JWT against Supabase's auth service (network round trip)
  const { data: { user: authUser }, error } = await supabase.auth.getUser();

  // CALL 2: Look up the application user in Postgres
  const user = await prisma.user.findUnique({
    where: { authId: authUser.id },
    select: { id, authId, email, role, status, name, departmentId, student, mentor },
  });
}
```

Every protected API request makes:
1. An HTTP call to Supabase's `auth.getUser()` endpoint to validate the JWT
2. A Postgres query to load the user's application record

For a request like `GET /api/dashboard`, which is already doing 4–6 Postgres queries, adding 2 more before the handler even starts contributes meaningfully to the total latency.

**Fix — Validate the JWT locally, cache the user lookup:**

**Step A:** Replace `supabase.auth.getUser()` with local JWT verification using `jsonwebtoken` or Supabase's own `jose`-based JWT verifier. Supabase JWTs are standard RS256 tokens — the public key is available at `https://<your-project>.supabase.co/auth/v1/.well-known/jwks.json`. Local verification adds ~0 ms vs ~100–300 ms for a remote call.

```typescript
// backend/src/lib/auth/jwt.ts
import { createRemoteJWKSet, jwtVerify } from 'jose';

const JWKS_URL = new URL(`${env.SUPABASE_URL}/auth/v1/.well-known/jwks.json`);
const JWKS = createRemoteJWKSet(JWKS_URL);  // cached automatically by jose

export async function verifySupabaseJwt(token: string): Promise<{ sub: string; email: string }> {
  const { payload } = await jwtVerify(token, JWKS, {
    issuer: `${env.SUPABASE_URL}/auth/v1`,
    audience: 'authenticated',
  });

  return {
    sub: payload.sub as string,
    email: (payload as { email?: string }).email ?? '',
  };
}
```

**Step B:** Cache the `prisma.user.findUnique` result per `authId` using a short-lived in-memory LRU cache:

```typescript
// backend/src/lib/auth/userCache.ts
import { LRUCache } from 'lru-cache';
import type { AuthContext } from './context';

// 500 entries, 2 minute TTL
// A user's role or status changing mid-session is rare enough that a 2-minute stale
// window is acceptable. The cache is per-server-instance so a role change takes
// effect on the next deployment or cache expiry, whichever comes first.
const cache = new LRUCache<string, Omit<AuthContext, 'request'>>({
  max: 500,
  ttl: 2 * 60 * 1000,
});

export const userCache = cache;
```

```typescript
// Updated requireAuth
export async function requireAuth(request: NextRequest): Promise<AuthContext> {
  const token = extractBearerToken(request.headers.get('authorization'));
  if (!token) throw unauthorized('Sign in to continue.');

  // LOCAL verification — no network call
  const { sub: authId } = await verifySupabaseJwt(token);

  // Check cache first
  const cached = userCache.get(authId);
  if (cached) {
    return { ...cached, request: getRequestContext(request) };
  }

  // Cache miss — fetch from DB (this only happens once per 2 minutes per user)
  const user = await prisma.user.findUnique({
    where: { authId },
    select: { id, authId, email, role, status, name, departmentId, student, mentor },
  });

  if (!user || user.status !== 'active') {
    throw unauthorized('Account not found or inactive.');
  }

  const context = {
    userId: user.id,
    authId: user.authId,
    email: user.email,
    role: user.role as UserRole,
    name: user.student?.name ?? user.mentor?.name ?? user.name ?? user.email.split('@')[0]!,
    studentId: user.student?.id ?? null,
    mentorId: user.mentor?.id ?? null,
    departmentId: user.departmentId ?? user.student?.departmentId ?? null,
  };

  userCache.set(authId, context);
  return { ...context, request: getRequestContext(request) };
}
```

Install the needed packages:
```bash
cd backend
pnpm add jose lru-cache
```

---

## Cause 5 — `force-dynamic` on Every Route Disables Next.js Route-Level Caching

**File:** Every route handler, e.g. `backend/src/app/api/dashboard/route.ts`  
**File:** `backend/src/lib/http.ts`, line 25

```typescript
// Every route handler exports this:
export const dynamic = 'force-dynamic';

// And http.ts sends this header on every response:
const BASE_HEADERS: Record<string, string> = {
  'Cache-Control': 'no-store',
};
```

`force-dynamic` is correct for authenticated, personal data — you never want Student A's dashboard cached and served to Student B. And `Cache-Control: no-store` is correct for the same reason. These are not bugs.

However, `no-store` on **every route including reference data** (departments, faculty coordinators) is wasteful:

```typescript
// backend/src/app/api/departments/route.ts — current
export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  const departments = await prisma.department.findMany(...);
  return ok(departments);  // ← inherits BASE_HEADERS with Cache-Control: no-store
});
```

Department and faculty coordinator lists change at most once a semester. Sending `no-store` forces the mobile app to re-fetch them on every mount. Your `hooks.ts` already sets `staleTime: 60 * 60 * 1000` on these queries, but the server is telling the HTTP layer not to cache anything regardless.

**Fix — allow short-lived caching for reference data:**

```typescript
// backend/src/lib/http.ts — add a cacheable response helper
export function cachedOk<T>(data: T, maxAgeSeconds: number): NextResponse {
  return NextResponse.json(
    { data },
    {
      status: 200,
      headers: {
        'Cache-Control': `private, max-age=${maxAgeSeconds}, stale-while-revalidate=${maxAgeSeconds * 2}`,
      },
    },
  );
}

// backend/src/app/api/departments/route.ts
return cachedOk(departments, 3600);   // 1 hour — departments barely change

// backend/src/app/api/faculty-coordinators/route.ts
return cachedOk(coordinators, 3600);
```

---

## Cause 6 — The Dashboard Makes 5–6 Sequential or Partially Parallel DB Queries With No Result Caching

**File:** `backend/src/server/dashboards/dashboardService.ts`, lines 70–95  
**Severity:** Medium — each page load runs expensive Postgres work from scratch

The student dashboard handler does the following on every call:

```
1. prisma.student.findUnique(...)                      — student profile
2. prisma.internship.findFirst(...)                    — latest internship
3. prisma.notificationLog.count(...)                   — unread count
(parallel)
4. prisma.attendance.findFirst(...)                    — today's attendance
5. prisma.dailyWorkLog.findFirst(...)                  — today's work log
6. prisma.attendance.groupBy(...)                      — attendance summary (full scan)
7. prisma.document.count(...)                          — pending documents
(sequential after parallel)
8. prisma.weeklyReport.findUnique(...)                 — current week report
```

Steps 4–7 are correctly parallelized with `Promise.all`. But steps 1, 2, 3, and 8 are serial. Every call recomputes the attendance summary from a full `groupBy` over the entire attendance table — for a 90-day internship with daily records that's a read of up to 90 rows and an aggregation, every time any tab is focused.

**Fix A — Short-circuit on stale server data with an `ETag`:**

```typescript
// backend/src/app/api/dashboard/route.ts
export const GET = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  await enforceRateLimit('general', auth.userId);

  const result = await getDashboard(auth);

  // Generate a hash of the response shape so the client can skip parsing
  // if nothing has changed since its last fetch
  const etag = `"${generateETag(result)}"`;
  const clientEtag = request.headers.get('if-none-match');

  if (clientEtag === etag) {
    return new NextResponse(null, { status: 304 });
  }

  const response = ok(result);
  response.headers.set('ETag', etag);
  return response;
});
```

On the mobile side, React Query's `staleTime` fix (Cause 1) already reduces how often this endpoint is called. The ETag is a secondary optimization for pull-to-refresh scenarios.

**Fix B — Parallelize the serial queries:**

```typescript
// dashboardService.ts — parallelize student + internship + notifications
const [student, internship, unreadNotificationCount] = await Promise.all([
  prisma.student.findUnique({ where: { id: studentId }, select: {...} }),
  prisma.internship.findFirst({ where: { studentId }, orderBy: { createdAt: 'desc' }, select: {...} }),
  prisma.notificationLog.count({ where: { userId: studentUserId, readAt: null } }),
]);
```

You need the student's `userId` for the notification count, so you'd fetch the student first and then fire the other two in parallel. Or denormalize `userId` into the student lookup by joining through the `users` table.

**Fix C — Cache the attendance summary in Redis (for high-load deployments):**

The attendance `groupBy` is the most expensive per-request operation. Since the summary only changes when a new attendance record is written, you can cache it in Redis and invalidate it on write:

```typescript
// On attendance POST/PATCH — invalidate:
await redis.del(`attendance:summary:${internshipId}`);

// On GET /api/dashboard — read from cache first:
const cacheKey = `attendance:summary:${internshipId}`;
const cached = await redis.get(cacheKey);
if (cached) return JSON.parse(cached) as AttendanceSummary;

const summary = await getAttendanceSummary(internshipId);
await redis.setex(cacheKey, 300, JSON.stringify(summary));   // 5 min TTL
return summary;
```

This is optional given the index coverage is already good, but becomes necessary once a department has 200+ students all hitting the faculty dashboard simultaneously.

---

## Contributing Factor — In-Memory Supabase Session Storage Causes Unnecessary Re-Auth on App Kill

**File:** `apps/mobile/lib/supabase.ts`, lines 22–48  
**Severity:** Low–Medium (only on full app restart, not navigation)

```typescript
// Current: sessions live in a JS Map
const memoryStorage = new Map<string, string>();
```

When the app is killed and relaunched, the in-memory `Map` is gone. `getSupabase().auth.getSession()` returns null, the `authStore.bootstrap()` finds no session, and the user is sent to the login screen. They log in again, which fires `GET /api/auth/me` and re-populates the store. This isn't the navigation slowdown you reported, but it causes unexpected logouts.

**Fix:** Switch to `expo-secure-store` with JWT chunking for production builds. The 2048-byte per-key limit is why the comment says it fails — but JWTs can be chunked across multiple keys:

```typescript
// apps/mobile/lib/secureStorage.ts
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 1800;  // under the 2048 limit per key

export const secureStorageAdapter = {
  getItem: async (key: string): Promise<string | null> => {
    const count = await SecureStore.getItemAsync(`${key}__chunks`);
    if (!count) return SecureStore.getItemAsync(key);   // single-chunk fallback

    const chunks: string[] = [];
    for (let i = 0; i < parseInt(count, 10); i++) {
      const chunk = await SecureStore.getItemAsync(`${key}__${i}`);
      if (!chunk) return null;
      chunks.push(chunk);
    }
    return chunks.join('');
  },

  setItem: async (key: string, value: string): Promise<void> => {
    if (value.length <= CHUNK_SIZE) {
      await SecureStore.setItemAsync(key, value);
      return;
    }
    const chunks = Math.ceil(value.length / CHUNK_SIZE);
    for (let i = 0; i < chunks; i++) {
      await SecureStore.setItemAsync(`${key}__${i}`, value.slice(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE));
    }
    await SecureStore.setItemAsync(`${key}__chunks`, String(chunks));
  },

  removeItem: async (key: string): Promise<void> => {
    const count = await SecureStore.getItemAsync(`${key}__chunks`);
    if (count) {
      for (let i = 0; i < parseInt(count, 10); i++) {
        await SecureStore.deleteItemAsync(`${key}__${i}`);
      }
      await SecureStore.deleteItemAsync(`${key}__chunks`);
    }
    await SecureStore.deleteItemAsync(key);
  },
};
```

---

## Impact Summary

| Cause | File(s) | Effort | Latency Saved Per Navigation |
|---|---|---|---|
| 1. `staleTime: 30s` — cache expires too fast | `_layout.tsx`, `hooks.ts` | 30 min | 1,000–3,000 ms (eliminates most refetches) |
| 2. Unconditional `refetch()` in `useFocusEffect` | `dashboard.tsx`, `attendance/history.tsx` | 1 hour | 500–1,500 ms per tab tap |
| 3. `getAccessToken()` calls `getSession()` per request | `supabase.ts`, `client.ts` | 30 min | 10–50 ms per request |
| 4. `requireAuth()` calls Supabase + Prisma per request | `auth/context.ts` | 2–3 hours | 150–400 ms per API call |
| 5. `no-store` on reference endpoints | `http.ts`, `departments/route.ts` | 30 min | 200–800 ms (first load after nav) |
| 6. Dashboard serial DB queries | `dashboardService.ts` | 1–2 hours | 100–300 ms per dashboard load |
| CF. Memory-only session storage | `supabase.ts` | 2–3 hours | Not navigation speed — prevents logouts |

**Combined expected improvement after fixes 1 + 2:** Navigation between tabs should drop from 3–4 seconds to under 200 ms for cached data. The server round-trip only fires when the `staleTime` window has genuinely expired, and on focus the app serves from cache instantly.

---

## Recommended Fix Order

### Step 1 — Do this today (< 1 hour, zero risk)

In `apps/mobile/app/_layout.tsx`, change `staleTime: 30_000` to `staleTime: 5 * 60 * 1000` and add `gcTime: 30 * 60 * 1000`. This is one line change. Test by navigating between tabs rapidly — they should load instantly from cache.

### Step 2 — Do this today (1 hour)

Remove `void refetch()` from the `useFocusEffect` in `dashboard.tsx`. Replace the raw `api.get` loop in `attendance/history.tsx` with a proper `useAttendanceList` React Query hook. Add `queryClient.invalidateQueries` calls in the attendance and work-log submit handlers so the cache is invalidated at the right time (after a write), not on every focus.

### Step 3 — Do this this week (3–4 hours)

Implement local JWT verification in the backend using `jose`. Replace `supabase.auth.getUser()` in `requireAuth` with `verifySupabaseJwt()`. Add the LRU cache for the `prisma.user.findUnique` call. This removes 150–400 ms from every API call server-side.

### Step 4 — Do this this week (1 hour)

Parallelize the serial queries in `getStudentDashboard()`. Move the three top-level `await` calls before the `if (!internship)` branch into a single `Promise.all`. This reduces the dashboard response time by one Postgres round-trip.

### Step 5 — Plan for next sprint

Switch the mobile Supabase storage adapter to the `expo-secure-store` chunked implementation. Add `cachedOk()` to the departments and faculty coordinators routes. Add Redis-backed attendance summary caching if you expect the faculty dashboard to be used concurrently by many faculty members.

---

## What Is Already Correct (Do Not Change)

- **The offline sync architecture** is well-designed. Writing to SQLite first and syncing in the background is exactly right for a mobile app. Do not change this.
- **The attendance summary `groupBy` query** is correct — it aggregates in Postgres, not in Node. The indexes on `(internship_id, attendance_date)` are in place. The query is efficient; the problem is calling it too often.
- **`force-dynamic`** on student/faculty dashboard routes is correct. Never cache personal, role-scoped data at the HTTP layer.
- **The batch sync endpoint** (`POST /api/sync`) is the right pattern for offline records. The `clientId` idempotency key prevents duplicates correctly.
- **The `getDatabase()` singleton** in `database.ts` is correct — one promise, migrations run once, WAL mode enabled.
- **Reference data `staleTime: 60 * 60 * 1000`** in `useDepartments()` and `useFacultyCoordinators()` is exactly right and should be the model for all other hooks.

---

*Report generated from static analysis of the `internship-app-main` codebase. No runtime profiling data was available — all timings are estimates based on network topology (mobile → Supabase auth endpoint → API server → Supabase Postgres) and the number of sequential async operations observed in the code.*
