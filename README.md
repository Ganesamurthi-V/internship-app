# Internship Management System

Implementation of the specification in [`docs/`](./docs). Mobile-first internship
tracking for a college: registration, daily attendance and work logs, weekly reports,
final assessment, industry mentor evaluation, and NBA-ready evidence export.

## Current status

| Part | State |
|---|---|
| `packages/shared-types` | Complete. Typechecks. |
| `packages/shared-validation` | Complete. 42 tests passing. |
| `backend` (Next.js 15 + Prisma + Supabase) | Complete. 58 API routes build. 59 tests passing. |
| `apps/mobile` (Expo SDK 57) | Foundations + daily loop. Typechecks. See below. |
| `apps/web` (faculty portal) | **Not started.** |

### What the mobile app does today

Built and typechecking:

- Auth: login, biometric unlock, forgot password, secure token storage, refresh-token
  rotation with a shared in-flight guard
- Offline layer: SQLite schema, draft repositories, FIFO sync queue, sync engine with
  NetInfo triggers and exponential backoff
- Student: dashboard (today's checklist, attendance ring, weekly/final cards),
  attendance form, work log form with live word counters, attendance history, work log
  history with search, profile
- Faculty: dashboard with the six summary cards, student list with search and filters,
  approve/return a registration
- Mentor: dashboard with assigned students
- Components: Screen, Button, TextField, Chips, TagInput, WordCounter, TimePickerField,
  ProgressRing, Card/SummaryCard, OfflineBanner, SyncBadge

Not built. The backend endpoints for all of these exist and are tested; only the screens
are missing. The dashboard cards for them show an explicit "not in this build" message
rather than navigating to a missing route:

- Internship registration wizard (3 steps) and the documents checklist
- Weekly report form and timeline
- Final assessment (3 parts, 8 skill sliders)
- Mentor evaluation form (10 ratings) and the public web invite flow
- Faculty student-detail tabs and evidence export
- Admin screens
- Components: RatingSlider, DocumentPicker, CalendarHeatmap, UploadProgress

**The database has never been reached.** Migrations are written but have not been run,
so no SQL has been executed and no endpoint has been exercised against real data. See
[Verification status](#verification-status) for exactly what is and is not proven.

## Stack

Per `03_TechSpec.md`, with the Supabase choices from `08_Implementation_Plan.md` Phase 0:

- **Database** — Supabase Postgres, accessed through Prisma
- **Storage** — Supabase Storage, private bucket, signed upload/download URLs
- **API** — Next.js 15 App Router route handlers, TypeScript
- **Auth** — custom JWT: 15-minute access token, 30-day rotating refresh token with
  theft detection. *Not* Supabase Auth — `03_TechSpec.md` §3.5 and `02_SRS.md` §1.1
  specify server-side revocable sessions in a `user_sessions` table.
- **Validation** — Zod schemas shared by the API and (once built) the mobile forms

## Repository layout

```
packages/shared-types/       Enums, entities, API contracts, limits
packages/shared-validation/  Zod schemas + pure domain calculations
backend/
  prisma/schema.prisma       20 models
  prisma/migrations/         3 migrations
  prisma/seed.ts             Idempotent seed
  src/lib/                   Cross-cutting: auth, http, storage, audit, rate limit
  src/server/<domain>/       Business logic
  src/app/api/**/route.ts    HTTP layer only
```

Business logic lives in `src/server/<domain>/`, mirroring the `backend/src/auth`,
`backend/src/students`, … layout in `03_TechSpec.md` §4. The `src/app/api` tree holds
only thin handlers, because Next reserves those paths for routing.

## Setup

### 1. Install

```bash
pnpm install
```

Node 20+ and pnpm 9+. `corepack prepare pnpm@9.15.4 --activate` if you do not have pnpm.

> `.npmrc` sets `node-linker=hoisted`. React Native's Metro bundler cannot resolve
> pnpm's symlinked layout, so this is required once the Expo app exists.

### 2. Create a Supabase project

Then fill in `backend/.env` from **Project Settings → Database** and **→ API**:

```env
# Pooled connection (port 6543) — app runtime
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1
# Direct connection (port 5432) — prisma migrate only
DIRECT_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres

SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...   # server-side only, never in the app bundle

AUTH_SECRET=...                 # openssl rand -base64 32
```

Two connection strings are needed because Prisma Migrate cannot run DDL, advisory
locks or a shadow database through a transaction-mode pooler.

### 3. Migrate and seed

```bash
cd backend
pnpm prisma:deploy    # applies the 3 migrations
pnpm prisma:seed      # admin + departments, plus demo data outside production
```

The seed prints the demo accounts it created and their shared development password.
Change them before exposing the API.

### 4. Run

```bash
cd backend && pnpm dev     # http://localhost:3000
```

## Migrations

| Migration | Contents |
|---|---|
| `20260814000000_init` | Tables, enums, indexes. Pure `prisma migrate diff` output. |
| `20260814000050_constraints_and_indexes` | CHECK constraints Prisma cannot express, plus `pg_trgm`/GIN search indexes. |
| `20260814000100_supabase_storage_and_rls` | Private storage bucket; RLS enabled on every table with no permissive policies. |

**Prisma Migrate is the source of truth for the schema.** Do not run `supabase db push`
against this project — two migration systems on one database will drift. Use
`pnpm prisma:migrate` to make schema changes.

The third migration enables RLS with no policies on purpose. The API enforces the
`05_API_Spec.md` authorization matrix in application code and connects as `postgres`
(which carries `BYPASSRLS`), so these policies do not affect normal operation. They
exist because a Supabase project exposes a public `anon` key by design, and without RLS
that key can read every table through the auto-generated REST API.

## Deviations from the documents

Each is commented at the point it occurs. The material ones:

1. **`internships.duration_days` and `attendance.total_hours`** are specified as
   `GENERATED ALWAYS ... STORED` (`04_Database_Design.md` §2). Prisma cannot manage
   generated columns without permanent migration drift, so they are plain columns
   written by the server from the shared calculators. CHECK constraints pin them to the
   documented formulas, preserving "computed, never manually entered" (§5).

2. **Attendance times are `TEXT` in `HH:MM`**, not `TIME`. Prisma surfaces a `TIME`
   column as a 1970-epoch `Date`, which invites timezone bugs in the one place we can
   least afford them. Zero-padded text compares correctly, so `valid_times` is
   unchanged in effect.

3. **`GET /api/documents/:id` returns JSON, not a redirect.** The spec says redirect;
   pass `?redirect=1` for that. JSON is the default because the mobile client needs the
   metadata alongside the URL.

4. **Export jobs run inline.** The async API from `05_API_Spec.md` is implemented
   (`POST` returns a job id, `GET` polls), but there is no queue — Phase 0 never selects
   a job runner. `processExportJob` takes only a job id so it can move to a worker
   without a client change.

5. **Columns and tables added** because an endpoint could not work without them:
   `users.department_id` (faculty department scoping, tested in `09_Test_Plan.md` §3),
   `final_assessments.faculty_unlocked_at` (the `/unlock` endpoint),
   `internships.evidence_uploads_permitted` (`02_SRS.md` §2.3 gate),
   `documents.deleted_at` and `documents.internship_id`, and the
   `password_reset_tokens`, `export_jobs` and `app_settings` tables.

## Known gaps

- **No mail provider.** `src/lib/mailer.ts` defines the seam and logs the message body
  in development. Password reset and mentor invite links therefore appear in the server
  log rather than an inbox. `sendMail` refuses to fall back to logging in production.
- **Rate limiting is in-process.** Correct for one instance; on a multi-instance or
  serverless deployment each instance keeps its own counters. Implement
  `RateLimitStore` against Redis and pass it to `setRateLimitStore`. Account lockout is
  unaffected — it lives in `users.failed_login_attempts`, which is shared.
- **No integration or E2E tests.** Requires a live database; see below.
- **Offline database is not encrypted.** `07_Security_and_Privacy.md` §3.4 asks for
  SQLCipher. `expo-sqlite` does not bundle it, so the local drafts are unencrypted at
  rest. Exposure is bounded by design — drafts hold attendance and work-log text, never
  tokens, passwords or document bytes — but it is a real gap against the spec.
- **Offline store is expo-sqlite, not WatermelonDB.** The documents recommend
  WatermelonDB; it relies on a JSI adapter plus a community Expo config plugin and has
  known friction with React Native's New Architecture, which is the default in RN 0.86.
  The table shapes, `sync_status` state machine and sync protocol from
  `12_Mobile_App_Spec.md` §5–§6 are unchanged. Rationale is documented at the top of
  `apps/mobile/lib/db/schema.ts`.

## Verification status

Proven:

- `tsc --noEmit` clean across all four workspaces
- `next build` succeeds — all 58 route handlers compile
- 101 unit tests pass (42 domain calculations, 42 authorization matrix, 17 CSV escaping)
- `prisma validate` passes; the client generates

Not proven, because no database was reachable while building this:

- **No migration has been executed.** The SQL is unverified against a real Postgres.
- **No endpoint has served a request.** Nothing has been exercised end to end.
- **The mobile app has never been run.** It typechecks, but it has not been launched on a
  device or simulator, so no screen has actually rendered and the offline sync path is
  untested against the real API.
- The integration, authorization-in-practice, offline-sync and E2E suites in
  `09_Test_Plan.md` §2–§5 are not written.

Order to work in after configuring Supabase:

1. `cd backend && pnpm prisma:deploy` — confirm the three migrations apply cleanly.
2. `pnpm prisma:seed`, then `pnpm dev`.
3. Point `apps/mobile/.env` at your machine's LAN IP (not `localhost` — on a phone that
   means the phone), then `cd apps/mobile && pnpm start`.
4. Sign in as a seeded student and walk the daily loop, on and off airplane mode.

## Build gotchas

Both of these cost real debugging time. They are pinned in `pnpm.overrides` in the root
`package.json` so they cannot recur.

**Zod must exist exactly once.** Two physical copies at different paths become two
distinct TypeScript type identities, which makes `tsc` exhaust an 8 GB heap with
`TS2589`, and breaks `instanceof ZodError` at runtime. It is declared once in the root
`package.json` and listed only as a `peerDependency` by `shared-validation`. If `tsc`
starts hanging, check for duplicate `zod` directories first.

**React must exist exactly once.** Expo SDK 57 pins `react@19.2.3` and that version is
tied to the native runtime, so the backend is aligned to it rather than the reverse. With
two copies, `next build` fails prerendering `/404` with
`Cannot read properties of null (reading 'useContext')` — the backend resolving a
different React than the one Next's own bundle uses.

Diagnostic for either:

```powershell
Get-ChildItem -Recurse -Directory -Filter "zod" -Path . | Select-Object FullName
```

Also worth knowing: `parseJson`/`parseQuery` in `backend/src/lib/http.ts` are generic over
`S extends z.ZodTypeAny` returning `z.output<S>`, not `schema: ZodType<T>`. The latter
pins a schema's input type equal to its output, which breaks for every schema using
`.transform()` and was a contributing factor in the same `tsc` blow-up.

Zustand stores use the curried `create<T>()(...)` form. Zustand v5 requires it when the
state type is given explicitly; the single-call form silently leaves every selector
parameter as `any`.

## Useful commands

```bash
pnpm typecheck                      # all packages
pnpm test                           # all tests
cd backend && pnpm prisma:studio    # browse data
cd backend && pnpm prisma:migrate   # new migration after a schema change
```
