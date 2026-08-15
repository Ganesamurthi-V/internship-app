# 08 — Implementation Plan

## 1. Architecture

| Component | Technology |
|-----------|-----------|
| Mobile app | Expo SDK 57, React Native 0.86, expo-router |
| Backend API | Next.js 15 (App Router, route handlers) |
| Database | PostgreSQL on Supabase |
| ORM | Prisma 6 |
| Auth | Supabase Auth + local JWT verification (jose) |
| Storage | Supabase Storage (private bucket) |
| Validation | Zod (shared package) |
| Monorepo | pnpm workspaces |

## 2. Phases

### Phase 0 — Foundation

**Goal:** Project scaffolding, Supabase setup, shared packages.

- [x] Monorepo setup (pnpm workspaces, .npmrc with node-linker=hoisted)
- [x] `@ims/shared-types` — enums, entity types, constants
- [x] `@ims/shared-validation` — Zod schemas, domain calculations
- [x] Backend scaffold (Next.js 15, Prisma config, environment variables)
- [x] Mobile scaffold (Expo SDK 57, expo-router, app.json)
- [x] Supabase project creation (Postgres + Storage + Auth)
- [x] Prisma schema (8 models)
- [x] Migrations (init + constraints + RLS)
- [x] Seed script (admin, faculty, demo students)

### Phase 1 — Auth + Core API

**Goal:** Authentication flow and all backend endpoints.

- [x] JWT verification middleware (jose + JWKS)
- [x] LRU user cache
- [x] Request parsing utilities (parseJson, parseQuery)
- [x] Error response helpers
- [x] Auth routes: /me, /forgot-password, /reset-password
- [x] Dashboard route (role-discriminated)
- [x] Questions CRUD + reorder
- [x] Submissions: create, today, list, detail, delete
- [x] Submissions: review (single + bulk)
- [x] Students: list, me, detail
- [x] Documents: upload-url, complete, download, delete, list unattached
- [x] Departments: list, create
- [x] Audit logging
- [x] Rate limiting (in-process)
- [x] Authorization checks per route

### Phase 2 — Mobile Auth + Student Loop

**Goal:** Student can log in, answer questions, attach files, see history.

- [x] Login screen
- [x] Forgot password screen
- [x] Auth state management (Zustand)
- [x] API client with token injection
- [x] Student dashboard (today's status, attendance summary)
- [x] Answer screen (question list, text inputs, file picker)
- [x] Document upload flow (two-phase)
- [x] History screen (submission list with status badges)
- [x] Profile screen (view + edit)
- [x] React Query hooks for all student endpoints

### Phase 3 — Mobile Faculty

**Goal:** Faculty/admin can review, manage questions, view students.

- [x] Faculty dashboard (overview cards)
- [x] Review queue (pending submissions list)
- [x] Review detail screen (approve/decline with note)
- [x] Students list (search, department filter)
- [x] Student detail (profile + attendance summary + history)
- [x] Questions management (CRUD + reorder)
- [x] Tab navigation for faculty layout

### Phase 4 — Polish + Testing

**Goal:** Production readiness.

- [ ] Run migrations against live Supabase database
- [ ] End-to-end test: student submits → faculty reviews → attendance counted
- [ ] Authorization integration tests (scope enforcement)
- [ ] Error handling edge cases (network failures, token expiry)
- [ ] Loading states and empty states in mobile app
- [ ] Accessibility pass (labels, contrast, touch targets)
- [ ] Performance profiling (API response times, list rendering)

### Phase 5 — Deployment

**Goal:** Ship to users.

- [ ] Backend deployment (Vercel or similar)
- [ ] Environment variable configuration
- [ ] EAS Build configuration for iOS and Android
- [ ] App Store / Play Store submission
- [ ] User documentation / onboarding

## 3. Future Considerations (Not In Scope)

- Web-based faculty portal
- Push notifications (requires dev build, not possible in Expo Go)
- Offline sync with local SQLite
- Secure token storage (expo-secure-store with chunking)
- Redis-backed rate limiting for multi-instance deployment
- Analytics and reporting exports
