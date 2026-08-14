# Requirements Traceability Matrix — Enhanced

> **Version 2.0** | Original source → Features → Technical docs → Mobile screens

---

## Full Traceability Table

| Source Section | Feature | PRD | SRS | DB Table(s) | API Endpoint(s) | Mobile Screen(s) | Test Coverage |
|---|---|---|---|---|---|---|---|
| Section 1 | Internship registration | §4.1 | §1.2 | `internships`, `organisations`, `mentors` | POST /api/internships | `(student)/internship/register` (3-step wizard) | E2E #1, Integration |
| Section 1 | Document upload (offer, joining) | §4.1, §4.8 | §1.2 | `documents` | POST /api/documents/upload-url | Upload flow in registration wizard | File upload tests |
| Section 2 | Daily attendance | §4.2 | §2.2, §3 | `attendance` | POST /api/attendance | `(student)/attendance/today` | E2E #3, Offline #1 |
| Section 2 | Attendance proof (optional) | §4.2 | §2.2 | `attendance.proof_document_id` | POST /api/documents | Camera/picker in attendance screen | File tests |
| Section 2 | Mentor attendance verification | §4.2 | §1.4 | `attendance.mentor_verified` | POST /api/attendance/:id/verify | `(mentor)/students/[id]/attendance` | E2E #7 |
| Section 3 | Daily work log | §4.3 | §2.3, §3 | `daily_work_logs` | POST /api/work-logs | `(student)/work-log/today` | E2E #5, Offline #2 |
| Section 3 | Word count enforcement | §4.3 | §3 | — (app + Zod) | Zod validation | Live counter in textarea | Unit tests |
| Section 4 | Weekly report | §4.4 | §2.4 | `weekly_reports` | POST /api/weekly-reports | `(student)/weekly-report/[weekNumber]` | E2E #6 |
| Section 4 | Auto-aggregate attendance | §4.4 | §2.4 | `attendance` → computed | GET /api/weekly-reports/current | Pre-populated fields (read-only) | Integration |
| Section 5 | Skill self-rating 1–5 | §4.6 | §2.5 | `skill_ratings` | POST /api/final-assessment | `(student)/final-assessment/skill-ratings` | Unit, E2E #9 |
| Section 6 | Post-internship assessment | §4.5 | §2.5 | `final_assessments` | POST/PATCH /api/final-assessment | `(student)/final-assessment/index` | E2E #9 |
| Section 7 | Final documents upload | §4.8 | §1.2 | `documents` | POST /api/documents | Checklist screen in final assessment | File tests |
| Section 8 | Mentor evaluation (10 ratings) | §4.7 | §2.6 | `mentor_evaluations` | POST /api/mentor-evaluations | `(mentor)/evaluation/[internshipId]` | E2E #8 |
| NBA evidence | Evidence package export | §6 (PRD) | §7 | All tables | POST /api/reports/export | Faculty evidence export button | E2E #10 |
| NBA evidence | Attendance % + hours | §6 (PRD) | §7 | `attendance` computed | GET /api/attendance/summary | Dashboard ring chart | Integration |
| NBA evidence | Aggregate report (A–F) | §6 (PRD) | §7 | All tables | GET /api/reports/evidence | Faculty export → PDF | E2E #10 |

---

## Mobile-Specific Features Traceability

| Requirement | Source | PRD | Tech Spec | Mobile Implementation |
|---|---|---|---|---|
| Single codebase iOS + Android | Client brief | §1, §6 | §2 (React Native/Expo) | `apps/mobile/` — one codebase |
| Offline attendance submission | SRS §5 | §5.1 | §5 (Offline Sync) | WatermelonDB + sync queue |
| Offline work log submission | SRS §5 | §5.1 | §5 | WatermelonDB + sync queue |
| Push: missing submission reminder | SRS §4 | §5.2 | §3.4 | expo-notifications + FCM/APNs |
| Push: weekly report reminder | SRS §4 | §5.2 | §3.4 | Sunday 6 PM scheduled job |
| Push: final assessment reminder | SRS §4 | §5.2 | §3.4 | 3 days before end date |
| Camera document scan | PRD §5.3 | §5.3 | §2.1 | expo-camera + expo-image-manipulator |
| File picker (existing PDF) | PRD §5.3 | §5.3 | §2.1 | expo-document-picker |
| Biometric / app lock | PRD §5.4 | §5.4 | §3.1 | expo-local-authentication |
| Secure token storage | SRS §1.1 | §5.4 | §3.1 | expo-secure-store (Keychain/Keystore) |
| EAS Build (iOS + Android CI/CD) | Engineering | §2 (TechSpec) | §9 | eas.json profiles |
| OTA updates (no store review) | Engineering | §2 (TechSpec) | §9 | eas update --branch production |

---

## Coverage Summary

| Document | v1.0 Status | v2.0 Enhancement |
|---|---|---|
| 01_PRD.md | Web-only scope | Mobile-first; offline; push; camera |
| 02_SRS.md | Web requirements | Mobile OS, biometrics, offline rules, push channels |
| 03_TechSpec.md | Next.js web stack | React Native/Expo full stack; WatermelonDB; EAS |
| 04_Database_Design.md | PostgreSQL only | + device_tokens, user_sessions, notification_logs; mobile SQLite schema |
| 05_API_Spec.md | REST basics | + /api/sync (batch offline), /api/device-tokens, /api/weekly-reports/current |
| 06_App_Flow.md | Screen flows (web) | Mobile screen map; offline banner; step-by-step wizard flows |
| 07_Security_and_Privacy.md | Server security | + mobile token storage, cert pinning, SQLite encryption, biometrics |
| 08_Implementation_Plan.md | Phase list | Mobile milestones; EAS build; Maestro E2E; ~14-week timeline |
| 09_Test_Plan.md | API/unit tests | + device tests, offline tests, accessibility, Maestro E2E |
| 10_Project_Setup_README.md | Next.js setup | Monorepo; Expo setup; EAS build/submit commands; first milestone |
| 11_Requirements_Traceability.md | Basic matrix | Full traceability to mobile screens + mobile-specific features |
