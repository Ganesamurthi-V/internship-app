# 03 — Technical Specification

## 1. Architecture Overview

```
┌─────────────────┐        ┌──────────────────────────────────┐
│  Expo Mobile App │───────▶│  Next.js 15 API (App Router)     │
│  (React Native)  │        │  Route handlers only (no pages)  │
└─────────────────┘        └──────────┬───────────────────────┘
                                      │
                           ┌──────────┼───────────────────────┐
                           │          ▼                       │
                           │  ┌──────────────┐               │
                           │  │ Prisma 6 ORM │               │
                           │  └──────┬───────┘               │
                           │         ▼                       │
                           │  ┌──────────────┐  ┌─────────┐ │
                           │  │  PostgreSQL   │  │ Storage │ │
                           │  │  (Supabase)   │  │ Bucket  │ │
                           │  └──────────────┘  └─────────┘ │
                           │         Supabase Project        │
                           └─────────────────────────────────┘
```

## 2. Technology Stack

| Layer | Technology | Version |
|-------|-----------|---------|
| Mobile | Expo SDK | 57 |
| Mobile | React Native | 0.86 |
| Mobile | expo-router | File-based routing |
| Mobile state | React Query + Zustand | TanStack Query v5 |
| Backend | Next.js | 15 (App Router) |
| ORM | Prisma | 6 |
| Database | PostgreSQL | 15+ (Supabase) |
| Auth | Supabase Auth | JWT with JWKS verification |
| Storage | Supabase Storage | Private bucket, signed URLs |
| Validation | Zod | Shared schemas |
| Monorepo | pnpm workspaces | 9.x |

## 3. Shared Packages

### @ims/shared-types
- Enums: UserRole, UserStatus, SubmissionStatus, QuestionType, ClientPlatform
- Entity types and API response contracts
- Constant limits (MAX_FILES_PER_SUBMISSION, MAX_FILE_SIZE, etc.)

### @ims/shared-validation
- Zod schemas for all API request/response shapes
- Validation rules used by both client and server
- Pure domain calculations

## 4. Backend Architecture

### 4.1 Project Structure
```
backend/
├── prisma/
│   ├── schema.prisma         # 8 models
│   ├── migrations/           # PostgreSQL DDL
│   └── seed.ts               # Dev data
└── src/
    ├── app/api/              # Route handlers (HTTP layer only)
    │   ├── auth/
    │   ├── dashboard/
    │   ├── departments/
    │   ├── documents/
    │   ├── questions/
    │   ├── students/
    │   └── submissions/
    ├── lib/                  # Cross-cutting concerns
    │   ├── auth.ts           # JWT verification, user cache
    │   ├── http.ts           # Request parsing, error responses
    │   ├── storage.ts        # Supabase Storage helpers
    │   ├── audit.ts          # Audit log writer
    │   └── rateLimit.ts      # In-process rate limiter
    └── server/               # Business logic per domain
        ├── dashboard/
        ├── departments/
        ├── documents/
        ├── questions/
        ├── students/
        └── submissions/
```

### 4.2 Request Flow
1. Route handler receives request
2. JWT extracted from Authorization header → verified via `jose` + Supabase JWKS
3. User record fetched from LRU cache (or DB on cache miss)
4. Request body parsed and validated with Zod schema
5. Authorization check (role + scope)
6. Business logic in `src/server/<domain>/`
7. Response serialized and returned

### 4.3 Authentication
- Supabase Auth issues JWTs
- Backend verifies locally using `jose` library with Supabase JWKS endpoint
- LRU cache stores verified user records (avoids DB lookup per request)
- No custom session table — relies on Supabase token lifecycle
- Password reset handled by Supabase's built-in email flow

### 4.4 File Storage
- Private Supabase Storage bucket
- Two-phase upload:
  1. Server generates signed upload URL with UUID storage key
  2. Client uploads directly to Supabase
  3. Client calls `/api/documents/complete` to record metadata and attach to submission
- Download via signed URLs (time-limited)
- Storage key is random UUID, never derived from user data or filename

### 4.5 Database Connections
- `DATABASE_URL` — pooled connection via Supavisor (port 6543) for runtime
- `DIRECT_URL` — direct connection (port 5432) for Prisma Migrate
- Transaction-mode pooler cannot handle DDL or advisory locks

## 5. Mobile Architecture

### 5.1 Navigation (expo-router)
```
app/
├── _layout.tsx              # Root layout + auth gate
├── index.tsx                # Redirect based on role
├── (auth)/
│   ├── _layout.tsx
│   ├── login.tsx
│   └── forgot-password.tsx
├── (student)/
│   ├── _layout.tsx          # Tab navigator
│   ├── dashboard.tsx        # Today tab
│   ├── answer.tsx           # Answer form (push from dashboard)
│   ├── history.tsx          # History tab
│   └── profile.tsx          # Profile tab
└── (faculty)/
    ├── _layout.tsx          # Tab navigator
    ├── dashboard.tsx        # Overview tab
    ├── questions.tsx        # Questions management tab
    ├── review/              # Review tab (queue + detail)
    │   ├── _layout.tsx
    │   ├── index.tsx
    │   └── [id].tsx
    └── students/            # Students tab (list + detail)
        ├── _layout.tsx
        ├── index.tsx
        └── [id].tsx
```

### 5.2 State Management
- **React Query** — server state (submissions, questions, students)
  - staleTime: 5 minutes
  - gcTime: 30 minutes
- **Zustand** — client state (auth tokens, UI preferences)
  - Curried `create<T>()(...)` form (required by Zustand v5)

### 5.3 API Client
- Centralized HTTP client with auth header injection
- Automatic token refresh on 401
- Type-safe hooks wrapping React Query

## 6. Key Design Decisions

| Decision | Rationale |
|----------|-----------|
| No Attendance table | Attendance = approved submission; single source of truth, no drift |
| promptSnapshot on Answer | Editing a question must not rewrite past history |
| Answers replaced wholesale on resubmit | Simpler than diffing; old state is never needed |
| Soft-retire questions (not delete) | Past submissions reference them |
| Faculty cannot edit student answers | Immutable audit trail of what the student actually wrote |
| No offline sync | Simplicity; mobile connectivity assumed |
| In-process rate limiting | Sufficient for single-instance deployment; Redis adapter ready |

## 7. Environment Variables

### Backend (`backend/.env`)
```
DATABASE_URL=              # Pooled Supabase connection
DIRECT_URL=                # Direct connection for migrations
SUPABASE_URL=              # https://PROJECT.supabase.co
SUPABASE_SERVICE_ROLE_KEY= # Server-side only
SUPABASE_JWT_SECRET=       # For local JWT verification
```

### Mobile (`apps/mobile/.env`)
```
EXPO_PUBLIC_API_URL=       # Backend URL (LAN IP for device testing)
EXPO_PUBLIC_SUPABASE_URL=  # Supabase project URL
EXPO_PUBLIC_SUPABASE_ANON_KEY= # Public anon key
```
