# 10 — Project Setup

## 1. Prerequisites

| Tool | Version |
|------|---------|
| Node.js | 20+ |
| pnpm | 9+ (`corepack prepare pnpm@9.15.4 --activate`) |
| Supabase project | With Postgres, Auth, and Storage enabled |

## 2. Repository Structure

```
├── packages/
│   ├── shared-types/          # Enums, entity types, constants
│   └── shared-validation/     # Zod schemas, validators
├── backend/                   # Next.js 15 API
│   ├── prisma/
│   │   ├── schema.prisma      # 8 models
│   │   ├── migrations/
│   │   └── seed.ts
│   └── src/
│       ├── app/api/           # Route handlers
│       ├── lib/               # Auth, storage, audit, rate limit
│       └── server/            # Business logic
├── apps/
│   └── mobile/                # Expo SDK 57 + React Native 0.86
│       ├── app/               # File-based routes (expo-router)
│       ├── components/
│       ├── lib/
│       └── constants/
└── docs/                      # This documentation
```

## 3. Installation

```bash
pnpm install
```

> `.npmrc` sets `node-linker=hoisted` — required for Metro bundler compatibility with pnpm.

## 4. Supabase Setup

### 4.1 Create Project
1. Go to [supabase.com](https://supabase.com) and create a new project
2. Note the project reference ID, region, and database password

### 4.2 Configure Storage
1. Create a private bucket named `documents`
2. No public access policies

### 4.3 Configure Auth
1. Enable email/password sign-in
2. Configure password reset email template
3. Set redirect URL for reset flow

## 5. Environment Variables

### Backend (`backend/.env`)

```env
# Pooled connection (port 6543) — runtime queries
DATABASE_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:6543/postgres?pgbouncer=true&connection_limit=1

# Direct connection (port 5432) — Prisma Migrate only
DIRECT_URL=postgresql://postgres.PROJECT_REF:PASSWORD@aws-0-REGION.pooler.supabase.com:5432/postgres

# Supabase project
SUPABASE_URL=https://PROJECT_REF.supabase.co
SUPABASE_SERVICE_ROLE_KEY=...    # Never expose to client
SUPABASE_JWT_SECRET=...          # From Project Settings → API

# App
NODE_ENV=development
```

### Mobile (`apps/mobile/.env`)

```env
EXPO_PUBLIC_API_URL=http://YOUR_LAN_IP:3000
EXPO_PUBLIC_SUPABASE_URL=https://PROJECT_REF.supabase.co
EXPO_PUBLIC_SUPABASE_ANON_KEY=...
```

> Use your machine's LAN IP for `EXPO_PUBLIC_API_URL` — `localhost` on a physical device means the device itself.

## 6. Database Setup

```bash
cd backend

# Apply migrations
pnpm prisma:deploy

# Seed development data
pnpm prisma:seed
```

The seed creates:
- Admin account: admin@smvec.ac.in
- Faculty account: faculty@smvec.ac.in (CSE department)
- Student accounts: praveen@smvec.ac.in, divya@smvec.ac.in, arjun@smvec.ac.in
- Departments: CSE, ECE, MECH, etc.
- Sample questions

## 7. Running

### Backend
```bash
cd backend
pnpm dev          # http://localhost:3000
```

### Mobile
```bash
cd apps/mobile
pnpm start        # Starts Expo dev server
```

Scan QR code with Expo Go (iOS/Android) or press `i`/`a` for simulator.

### Type Checking
```bash
pnpm typecheck    # All workspaces
```

### Tests
```bash
pnpm test         # All workspaces
```

## 8. Development Commands

| Command | Location | Purpose |
|---------|----------|---------|
| `pnpm dev` | backend/ | Start API server |
| `pnpm start` | apps/mobile/ | Start Expo |
| `pnpm typecheck` | root | Check all TypeScript |
| `pnpm test` | root | Run all tests |
| `pnpm prisma:studio` | backend/ | Browse database |
| `pnpm prisma:migrate` | backend/ | Create new migration |
| `pnpm prisma:deploy` | backend/ | Apply pending migrations |
| `pnpm prisma:seed` | backend/ | Seed data |

## 9. Known Build Issues

### Zod singleton
Zod must exist exactly once in node_modules. Two copies cause `tsc` to hang with TS2589 and break `instanceof ZodError`. It's declared in root `package.json` and listed as `peerDependency` in shared-validation.

### React singleton
React must also exist once. Expo SDK 57 pins `react@19.2.3`. The backend aligns to this version. Two copies cause Next.js prerender failures.

**Diagnostic:**
```powershell
Get-ChildItem -Recurse -Directory -Filter "zod" -Path . | Select-Object FullName
```

### Zustand curried form
Zustand v5 requires `create<T>()(...)` (curried) when the state type is explicit. The single-call form silently leaves selectors as `any`.

## 10. Deployment Notes

- Backend deploys to any Node.js 20+ platform (Vercel, Railway, etc.)
- Mobile builds via EAS Build (see `apps/mobile/eas.json`)
- Two database connection strings required (pooled for runtime, direct for migrations)
- Rate limiting is in-process; for multi-instance, implement Redis-backed `RateLimitStore`
