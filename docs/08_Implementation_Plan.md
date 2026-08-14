# Implementation Plan — Mobile-First Build

> **Version 2.0** | React Native (Expo) + Next.js API + PostgreSQL

---

## Phase 0 — Decisions Before Any Code

| Decision | Options | Recommendation |
|---|---|---|
| Institution name | — | Confirm with client |
| Auth strategy | JWT (custom) / NextAuth / Lucia | JWT with refresh rotation |
| PostgreSQL hosting | Supabase / Railway / Neon / self-hosted | Supabase (managed + row-level security) |
| Object storage | AWS S3 / MinIO / Supabase Storage | Supabase Storage (same infra) |
| Push notifications | Expo Push + FCM/APNs | Expo Notification Service |
| Mentor access | App account / secure web invite link | Web invite link (no app install) |
| Offline DB | WatermelonDB / MMKV + custom sync | WatermelonDB |
| Document size limit | 5 MB / 10 MB / 20 MB | 10 MB |
| Notification schedule | Fixed / admin-configurable | Admin-configurable |
| App Store distribution | Internal (TestFlight/Play Internal) → Public | Internal first |

---

## Phase 1 — Foundation (Backend + Mobile Shell)

### Backend
1. Create monorepo (pnpm workspaces or Turborepo).
2. Set up Next.js API (or NestJS) with TypeScript.
3. Configure ESLint, Prettier, Husky pre-commit.
4. Configure environment variables (`.env`, no secrets committed).
5. Set up PostgreSQL + Prisma; run initial migration.
6. Implement JWT authentication (login, refresh, logout, me).
7. Implement RBAC middleware (role check + ownership).
8. Add audit log middleware.
9. Add rate limiting (auth endpoints first).
10. Set up logging (Pino / Winston) + error handling.

### Mobile
1. `npx create-expo-app@latest --template tabs` with TypeScript.
2. Configure Expo Router v3 (file-based routing).
3. Set up NativeWind or React Native Paper for styling.
4. Set up React Query + Zustand.
5. Set up `expo-secure-store` for token storage.
6. Set up `expo-notifications` (register push token on login).
7. Set up WatermelonDB schema (attendance_drafts, work_log_drafts, sync_queue).
8. Build AuthContext + token refresh interceptor.
9. Build app shell: tab navigation for each role.
10. Configure EAS Build for dev/staging/production profiles.

**Milestone 1 gate:** Login works on a real device (iOS + Android). Token stored securely. Push token registered.

---

## Phase 2 — Student & Internship

### Backend
1. Student profile endpoints (GET/PATCH /api/students/me).
2. Organisation CRUD (admin).
3. Mentor management (create, invite link generation).
4. Internship registration (POST/GET/PATCH/submit/approve/reject).
5. Document upload URL + complete endpoints.
6. Faculty approval + push notification on approval.
7. Student dashboard data endpoint.

### Mobile
1. Student profile screen (read + edit).
2. Internship registration wizard (3-step form: org/dates → mentor/coordinator → documents).
3. Document upload flow (camera scan + file picker).
4. Upload progress indicator.
5. Pending approval screen.
6. Student dashboard (today's checklist, internship summary card).

**Milestone 2 gate:** Full registration → faculty approval → approved internship visible on student dashboard. Works offline and syncs.

---

## Phase 3 — Daily Operations

### Backend
1. Attendance endpoints (POST/GET/PATCH, verify, summary).
2. Daily work log endpoints (POST/GET/PATCH/submit).
3. Batch sync endpoint (POST /api/sync).
4. Missing submission detection (background job, daily).
5. Push notification: missing log reminder.

### Mobile
1. Attendance screen: status chips, time pickers, optional proof upload.
2. Work log screen: text areas with word counters, technology tags, deliverable chips.
3. Offline queue: store drafts in WatermelonDB; sync on reconnect.
4. Offline banner + pending-sync badge on dashboard.
5. Attendance history: calendar heatmap view.
6. Work log history: scrollable daily cards.
7. Push notification tap → deep link to correct screen.

**Milestone 3 gate:** Student can log attendance and work on a device with no internet; records appear on server when internet restored. Faculty can see today's submissions.

---

## Phase 4 — Weekly & Final

### Backend
1. Weekly report endpoints (POST/GET/PATCH/submit, current-week summary).
2. Auto-aggregation of hours and days from attendance (server-side, not client-trusted).
3. Final assessment endpoints (POST/GET/PATCH/submit/unlock).
4. Skill ratings save/update.
5. Final document checklist validation.
6. Push: weekly due reminder (Sunday), final assessment reminder (3 days before end).

### Mobile
1. Weekly report screen: pre-populated days/hours (read-only), free-text fields, tags, PDF upload.
2. Weekly reports list (timeline view).
3. Final assessment multi-step form (3 parts: completion → self-rating → feedback).
4. Skill rating sliders (1–5) with labels.
5. Final documents checklist with per-document upload.
6. Completion celebration screen.

**Milestone 4 gate:** Complete student lifecycle works: registration → daily logs → weekly reports → final assessment → documents uploaded.

---

## Phase 5 — Mentor

### Backend
1. Mentor invite link generation and validation.
2. Assigned student list endpoint.
3. Attendance verification endpoint.
4. Work log review (faculty + mentor read).
5. Mentor evaluation endpoints (POST/GET/PATCH/submit).
6. Push: evaluation request to mentor.

### Mobile/Web
1. Mentor app screens (or web-based invite flow if mentor chooses no app install).
2. Assigned students list.
3. Attendance verify toggle.
4. Work log review view.
5. Mentor evaluation form (10 rating sliders + text fields + digital confirmation).

**Milestone 5 gate:** Mentor can open invite link on any device, submit evaluation, and it appears on faculty dashboard.

---

## Phase 6 — Faculty & Reporting

### Backend
1. Faculty dashboard data endpoint (summary counts).
2. Student detail endpoints (all tabs).
3. Evidence generation (student-wise PDF).
4. Aggregate report generation (NBA package).
5. Async export job with polling.
6. Evidence export: attendance percentage, hour totals, daily logs, weekly summaries, mentor eval, final assessment.

### Mobile
1. Faculty dashboard with summary cards and drill-down.
2. Student list (search, filter by status/missing logs).
3. Student detail view (tabbed: overview, attendance, logs, docs, eval, assessment).
4. Document verification (verify/reject with reason).
5. Evidence export button → progress indicator → download.

**Milestone 6 gate:** Faculty can generate a full student evidence package as PDF. Aggregate report contains all NBA sections (A–F).

---

## Phase 7 — Hardening

- Security review: OWASP Mobile Top 10 checklist.
- Authorization penetration tests (student A cannot read student B).
- File upload edge cases: malformed MIME, oversized, wrong extension.
- Offline sync stress test (100 queued records, reconnect, verify all land correctly).
- Performance test: list screen with 200 students, 60-day attendance history.
- E2E test suite (Maestro or Detox): full student lifecycle, faculty approval, mentor evaluation.
- Accessibility review: VoiceOver, TalkBack, dynamic type.
- Backup/restore test on PostgreSQL.
- App Store / Play Store submission preparation (screenshots, descriptions, privacy policy).
- Production deployment.

---

## MVP Order (strict)

Build in this exact order. Do not skip ahead.

1. Auth + RBAC + device token
2. Student profile
3. Internship registration + document upload
4. Faculty approval
5. Attendance (online + offline)
6. Daily work log (online + offline)
7. Offline sync
8. Faculty dashboard (basic)
9. Weekly report
10. Final assessment + skill ratings
11. Mentor evaluation
12. Evidence reporting + export

> Do not start analytics dashboards before underlying data is reliable.

---

## Suggested Timeline

| Phase | Duration |
|---|---|
| Phase 0 (Decisions) | 1 week |
| Phase 1 (Foundation) | 2 weeks |
| Phase 2 (Internship) | 2 weeks |
| Phase 3 (Daily Ops) | 2 weeks |
| Phase 4 (Weekly/Final) | 2 weeks |
| Phase 5 (Mentor) | 1 week |
| Phase 6 (Reporting) | 2 weeks |
| Phase 7 (Hardening) | 2 weeks |
| **Total** | **~14 weeks** |
