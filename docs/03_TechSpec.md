# Technical Specification — Cross-Platform Mobile App

> **Version 2.0** | Single codebase, iOS + Android, React Native (Expo)

---

## 1. Architecture Overview

```
┌─────────────────────────────────────────────────────────┐
│           Mobile App (React Native / Expo)              │
│  iOS (Swift runtime)     Android (Kotlin runtime)       │
│                                                         │
│  ┌────────────┐  ┌───────────┐  ┌────────────────────┐ │
│  │ UI Layer   │  │State Mgmt │  │  Offline Layer     │ │
│  │ (RN + NUI) │  │(Zustand / │  │ (WatermelonDB /    │ │
│  │            │  │React Query)│  │  SQLite + Queue)   │ │
│  └────────────┘  └───────────┘  └────────────────────┘ │
└─────────────────────┬───────────────────────────────────┘
                      │ HTTPS / REST
                      ▼
┌─────────────────────────────────────────────────────────┐
│                  Backend API                            │
│  Next.js 15 Route Handlers (TypeScript)                 │
│  OR NestJS (if API-only backend preferred)              │
│                                                         │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │  Auth    │  │  RBAC    │  │   Business Logic     │  │
│  │  (JWT)   │  │ Middleware│  │    (Zod validated)   │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
│                      │                                  │
│  ┌──────────┐  ┌──────────┐  ┌──────────────────────┐  │
│  │PostgreSQL│  │  Object  │  │  Push Notifications  │  │
│  │          │  │  Storage │  │  (FCM + APNs via     │  │
│  │ (Prisma) │  │ (S3/Min) │  │   Expo Push API)     │  │
│  └──────────┘  └──────────┘  └──────────────────────┘  │
└─────────────────────────────────────────────────────────┘
```

---

## 2. Mobile Stack — Single Codebase

### 2.1 Core Framework

| Layer | Technology | Reason |
|---|---|---|
| Framework | **React Native 0.74+** | Single codebase, iOS + Android |
| Build tooling | **Expo SDK 51+** | Managed workflow, OTA updates, native module access |
| Language | **TypeScript** | Type safety across entire codebase |
| Navigation | **Expo Router v3** (file-based) | Same routing paradigm as Next.js; deep linking free |
| UI Components | **React Native Paper** or **NativeWind** | Material Design 3 / Tailwind-style utility classes |
| Icons | **@expo/vector-icons** | Cross-platform icon set |
| Forms | **React Hook Form + Zod** | Consistent with backend validation schemas |
| State | **Zustand** (global) + **React Query / TanStack Query** (server state) | Lightweight; React Query handles caching, refetch, offline |
| Offline DB | **WatermelonDB** (SQLite-backed) | Fast local queries; sync adapter for server reconciliation |
| Secure storage | **expo-secure-store** | iOS Keychain / Android Keystore |
| Push notifications | **expo-notifications** | Unified FCM + APNs wrapper |
| Camera | **expo-camera** | Document scanning, QR codes |
| File picker | **expo-document-picker** | PDF/image selection |
| Image picker | **expo-image-picker** | Gallery + camera |
| Biometrics | **expo-local-authentication** | Face ID / Touch ID / Fingerprint |
| Network | **@react-native-community/netinfo** | Connectivity detection for offline queue |
| Analytics | **expo-analytics** or PostHog | Usage tracking |

### 2.2 Why Expo Over Bare React Native

- Expo EAS Build: CI/CD for both iOS and Android from one config.
- Expo EAS Update: Push JavaScript-only OTA updates without App Store review.
- Managed native modules eliminate manual `android/` and `ios/` folder edits.
- Full ejection always available if custom native code is needed later.

---

## 3. Backend Stack

### 3.1 API Server

```
Next.js 15 App Router — Route Handlers (TypeScript)
├── /api/auth/*
├── /api/students/*
├── /api/internships/*
├── /api/attendance/*
├── /api/work-logs/*
├── /api/weekly-reports/*
├── /api/final-assessments/*
├── /api/mentor-evaluations/*
├── /api/documents/*
├── /api/reports/*
└── /api/notifications/*
```

Alternative: **NestJS** if you prefer a dedicated REST API without Next.js coupling.

### 3.2 Database
- **PostgreSQL 16** — primary datastore
- **Prisma** ORM — type-safe queries; migrations
- **Redis** — session cache, notification queue, rate-limit counters

### 3.3 Object Storage
- **AWS S3** or **MinIO** (self-hosted) for documents
- Private bucket; no public URLs
- Presigned URLs (15-minute TTL) for upload and download

### 3.4 Push Notifications
- **Expo Push Notification Service** → routes to FCM (Android) and APNs (iOS)
- Server calls `POST https://exp.host/--/api/v2/push/send`
- Tokens stored per device in `device_tokens` table
- Notification preferences configurable per user

### 3.5 Authentication
- **JWT access token** (15-minute TTL) + **refresh token** (30-day, rotating)
- Refresh token stored in `user_sessions` table (server-side revocable)
- Tokens stored on device via `expo-secure-store`
- Optional: **NextAuth.js** or **Lucia** for session management

---

## 4. Project Repository Structure

```
internship-management/
├── apps/
│   ├── mobile/                     # React Native / Expo app
│   │   ├── app/                    # Expo Router screens (file-based routing)
│   │   │   ├── (auth)/
│   │   │   │   ├── login.tsx
│   │   │   │   └── forgot-password.tsx
│   │   │   ├── (student)/
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── internship/
│   │   │   │   ├── attendance/
│   │   │   │   ├── work-log/
│   │   │   │   ├── weekly-report/
│   │   │   │   ├── final-assessment/
│   │   │   │   └── documents/
│   │   │   ├── (faculty)/
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── students/
│   │   │   │   ├── reports/
│   │   │   │   └── evidence/
│   │   │   ├── (mentor)/
│   │   │   │   ├── dashboard.tsx
│   │   │   │   ├── students/
│   │   │   │   └── evaluation/
│   │   │   └── (admin)/
│   │   │       ├── users/
│   │   │       ├── organisations/
│   │   │       └── settings/
│   │   ├── components/
│   │   │   ├── forms/
│   │   │   ├── ui/
│   │   │   └── shared/
│   │   ├── lib/
│   │   │   ├── api/                # API client (fetch wrappers)
│   │   │   ├── db/                 # WatermelonDB models and schema
│   │   │   ├── sync/               # Offline sync logic
│   │   │   ├── auth/               # Token management
│   │   │   └── notifications/      # Push notification handlers
│   │   ├── stores/                 # Zustand stores
│   │   ├── hooks/                  # Custom React hooks
│   │   ├── constants/
│   │   ├── app.json                # Expo config
│   │   └── eas.json                # EAS Build/Update config
│   │
│   └── web/                        # Next.js web (faculty/admin portal)
│       ├── app/
│       ├── components/
│       └── ...
│
├── packages/
│   ├── shared-types/               # TypeScript types shared across apps
│   ├── shared-validation/          # Zod schemas reused in mobile + backend
│   └── api-client/                 # Generated or hand-written API client
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
│       └── schema.prisma
│
├── tests/
│   ├── unit/
│   ├── integration/
│   └── e2e/                        # Maestro or Detox E2E tests
│
└── README.md
```

---

## 5. Offline Sync Architecture

```
Mobile (WatermelonDB)
       │
       │  1. Write locally (draft state)
       ▼
Local SQLite (WatermelonDB)
       │
       │  2. Network detected
       ▼
Sync Queue (FIFO, persistent)
       │
       │  3. POST /api/sync
       ▼
Backend — validate + persist
       │
       │  4. Return server IDs + timestamps
       ▼
WatermelonDB updated (local IDs → server IDs)
```

**Sync endpoint:** `POST /api/sync`
- Accepts batch of pending records (attendance, work logs)
- Returns success/failure per record
- Idempotent: duplicate records identified by `client_id` (UUID generated on device)

---

## 6. File Handling Pipeline

```
1. User picks file (expo-document-picker / expo-image-picker)
2. Client validates: MIME type ∈ {PDF, JPG, PNG, HEIC}, size ≤ 10 MB
3. Client requests upload URL: POST /api/documents/upload-url
4. Server generates presigned S3/MinIO PUT URL (5-min TTL)
5. Client uploads directly to storage (no file bytes through server)
6. Client calls: POST /api/documents/complete {storageKey, filename, mimeType, size}
7. Server stores metadata in documents table
8. Download: GET /api/documents/:id → redirect to presigned GET URL (15-min TTL)
```

HEIC images (from iPhone camera) are converted to JPEG client-side before upload using `expo-image-manipulator`.

---

## 7. Security

- Server-side authorization on every API route; never trust client-provided role or user ID.
- Parameterized queries via Prisma ORM (no raw string interpolation).
- CSRF: not applicable to React Native (no cookie-based sessions); JWT in Authorization header.
- Rate limiting: `express-rate-limit` or Next.js middleware — 10 req/min on auth, 100 req/min on general.
- File upload: MIME validation on both client and server; random UUID storage keys; no executable files.
- Certificate pinning (optional, high-security deployments): `expo-build-properties` + `TrustKit`.
- Secure HTTP headers on web: CSP, HSTS, X-Frame-Options.
- Secrets outside source control: `.env` files, never committed.

---

## 8. Performance Targets

| Metric | Target |
|---|---|
| App cold start | < 2 seconds on mid-range Android |
| API response (95th pct) | < 500 ms |
| List render (100 items) | 60 fps scrolling |
| Offline queue sync | < 10 seconds per day's records |
| PDF export generation | < 5 seconds |
| File upload (5 MB) | < 15 seconds on 4G |

---

## 9. Development & Deployment

### Dev
```bash
# Mobile
cd apps/mobile
npx expo start           # Metro bundler; scan QR to open on device
npx expo start --ios     # iOS Simulator
npx expo start --android # Android Emulator
```

### Build (EAS)
```bash
eas build --platform ios --profile production
eas build --platform android --profile production
eas submit --platform ios      # Submit to App Store
eas submit --platform android  # Submit to Play Store
```

### OTA Update
```bash
eas update --branch production --message "Fix attendance sync"
```

### CI/CD (GitHub Actions)
```yaml
on: push to main
jobs:
  - type-check
  - unit-test
  - eas-build (android + ios parallel)
  - eas-update (on success)
```

---

## 10. Minimum OS Requirements

| Platform | Minimum | Recommended |
|---|---|---|
| iOS | 15.0 | 17.0+ |
| Android | API 30 (Android 11) | API 34 (Android 14) |
