# Internship Management System — Project Start Guide (Mobile)

> **Version 2.0** | React Native (Expo) + Next.js API + PostgreSQL

---

## Prerequisites

| Tool | Version | Install |
|---|---|---|
| Node.js | 20 LTS | https://nodejs.org |
| pnpm | 9+ | `npm i -g pnpm` |
| Expo CLI | latest | `npm i -g expo-cli` |
| EAS CLI | latest | `npm i -g eas-cli` |
| PostgreSQL | 16 | Local or Supabase |
| Xcode | 15+ | Mac only (iOS Simulator) |
| Android Studio | latest | Android Emulator |
| Git | — | — |

---

## Repository Structure

```
internship-management/
├── apps/
│   ├── mobile/                     # React Native / Expo app (iOS + Android)
│   │   ├── app/                    # Expo Router v3 (file-based)
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx
│   │   │   │   └── forgot-password.tsx
│   │   │   ├── (student)/
│   │   │   │   ├── _layout.tsx     # Tab navigator for students
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── internship/
│   │   │   │   ├── attendance/
│   │   │   │   ├── work-log/
│   │   │   │   ├── weekly-report/
│   │   │   │   ├── final-assessment/
│   │   │   │   └── documents/
│   │   │   ├── (faculty)/
│   │   │   ├── (mentor)/
│   │   │   └── (admin)/
│   │   ├── components/
│   │   │   ├── forms/
│   │   │   ├── ui/
│   │   │   └── shared/
│   │   ├── lib/
│   │   │   ├── api/                # Typed fetch wrappers
│   │   │   ├── db/                 # WatermelonDB schema + models
│   │   │   ├── sync/               # Offline sync engine
│   │   │   ├── auth/               # Token management
│   │   │   └── notifications/      # Push handlers + deep links
│   │   ├── stores/                 # Zustand global state
│   │   ├── hooks/                  # useTodayLog, useAttendanceSummary, etc.
│   │   ├── constants/              # Colors, dimensions, enums
│   │   ├── app.json                # Expo project config
│   │   ├── eas.json                # EAS profiles
│   │   └── babel.config.js
│   │
│   └── web/                        # Next.js (faculty/admin web portal)
│       └── app/
│
├── packages/
│   ├── shared-types/               # TypeScript interfaces shared by mobile + API
│   │   └── src/index.ts
│   └── shared-validation/          # Zod schemas used on mobile + server
│       └── src/index.ts
│
├── backend/                        # Next.js API or NestJS
│   ├── src/
│   │   ├── auth/
│   │   ├── students/
│   │   ├── internships/
│   │   ├── attendance/
│   │   ├── work-logs/
│   │   ├── weekly-reports/
│   │   ├── final-assessments/
│   │   ├── mentor-evaluations/
│   │   ├── documents/
│   │   ├── reports/
│   │   └── notifications/
│   └── prisma/
│       ├── schema.prisma
│       └── migrations/
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/                        # Maestro test flows
│       ├── student_registration.yaml
│       ├── daily_log.yaml
│       └── faculty_evidence_export.yaml
│
├── .env.example
├── pnpm-workspace.yaml
├── turbo.json                       # Turborepo build pipeline
└── README.md
```

---

## Initial Setup

### 1. Clone and install
```bash
git clone <repo-url> internship-management
cd internship-management
pnpm install
```

### 2. Environment variables

Copy `.env.example` to `.env` in each app:
```bash
cp .env.example backend/.env
cp .env.example apps/mobile/.env
```

**.env (backend)**
```env
DATABASE_URL=postgresql://user:pass@localhost:5432/internship_db
AUTH_SECRET=<generate: openssl rand -base64 32>
AUTH_ACCESS_TOKEN_EXPIRY=900      # 15 minutes (seconds)
AUTH_REFRESH_TOKEN_EXPIRY=2592000 # 30 days (seconds)
STORAGE_ENDPOINT=https://your-storage-endpoint
STORAGE_BUCKET=internship-documents
STORAGE_ACCESS_KEY=
STORAGE_SECRET_KEY=
APP_URL=https://api.your-institution.edu
EXPO_PUSH_API_URL=https://exp.host/--/api/v2/push/send
REDIS_URL=redis://localhost:6379
```

**.env (mobile) — no secrets here**
```env
EXPO_PUBLIC_API_URL=https://api.your-institution.edu/api
EXPO_PUBLIC_APP_ENV=development
```

> Never commit secrets. Add `.env` to `.gitignore`. Use EAS Secrets for build-time env vars.

### 3. Database setup
```bash
cd backend
pnpm prisma migrate dev --name init
pnpm prisma db seed                 # creates admin user, departments
```

### 4. Run backend
```bash
cd backend
pnpm dev                            # Next.js on http://localhost:3000
```

### 5. Run mobile app
```bash
cd apps/mobile
npx expo start                      # Scan QR with Expo Go
npx expo start --ios                # iOS Simulator (Mac only)
npx expo start --android            # Android Emulator
```

---

## EAS Build (CI/CD)

### Setup EAS
```bash
cd apps/mobile
eas login
eas build:configure
```

### Build for device testing
```bash
# Android APK (internal testing)
eas build --platform android --profile preview

# iOS IPA (TestFlight)
eas build --platform ios --profile preview
```

### Production build + submission
```bash
eas build --platform all --profile production
eas submit --platform ios      # Submits to App Store Connect
eas submit --platform android  # Submits to Google Play
```

### OTA JavaScript update (no store review)
```bash
eas update --branch production --message "Fix offline sync bug"
```

---

## First Development Milestone

The first usable milestone must demonstrate:

1. Student can login on a real iPhone and Android phone simultaneously.
2. Student can register an internship (fill form, upload 2 documents).
3. Faculty can approve the internship on their device.
4. Student receives push notification of approval.
5. Student can mark attendance (online and offline).
6. Student can submit a work log.
7. Faculty can see today's submissions on their dashboard.

Only after this full loop works should weekly reports, final assessment, mentor evaluation, and evidence reporting be added.

---

## Useful Commands

```bash
# Type-check entire monorepo
pnpm typecheck

# Run all unit tests
pnpm test

# Run E2E (Maestro — requires device/emulator running)
maestro test tests/e2e/student_registration.yaml

# Generate Prisma client after schema change
cd backend && pnpm prisma generate

# Reset local database
cd backend && pnpm prisma migrate reset

# View WatermelonDB local data (debug)
# Connect to emulator via adb and pull SQLite file
adb shell "run-as com.yourapp cp /data/data/com.yourapp/databases/watermelon.db /sdcard/"
adb pull /sdcard/watermelon.db
```

---

## Source

Requirements are based on the uploaded internship app guide (DOCX) and the original 11-document technical package. Mobile-specific architecture (React Native, Expo, WatermelonDB, offline sync, push notifications, EAS Build) are implementation recommendations added during the v2.0 mobile enhancement pass.
