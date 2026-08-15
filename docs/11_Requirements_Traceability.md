# 11 — Requirements Traceability

## 1. Functional Requirements → Implementation

| ID | Requirement | API Endpoint | Database | Mobile Screen | Status |
|----|-------------|-------------|----------|---------------|--------|
| FR-01 | Student login | POST (Supabase Auth) | User | (auth)/login | Done |
| FR-02 | Forgot password | /api/auth/forgot-password | — | (auth)/forgot-password | Done |
| FR-03 | Role-based routing | /api/auth/me | User.role | _layout.tsx (root) | Done |
| FR-04 | Student dashboard | /api/dashboard | DailySubmission | (student)/dashboard | Done |
| FR-05 | View today's questions | /api/submissions/today | Question | (student)/answer | Done |
| FR-06 | Submit daily answers | POST /api/submissions | DailySubmission, Answer | (student)/answer | Done |
| FR-07 | Attach documents | /api/documents/* | Document | (student)/answer | Done |
| FR-08 | View submission history | GET /api/submissions | DailySubmission | (student)/history | Done |
| FR-09 | Edit pending submission | POST /api/submissions | Answer (replace) | (student)/answer | Done |
| FR-10 | Resubmit after decline | POST /api/submissions | DailySubmission.status | (student)/answer | Done |
| FR-11 | View own profile | GET /api/students/me | Student | (student)/profile | Done |
| FR-12 | Edit own profile | PATCH /api/students/me | Student | (student)/profile | Done |
| FR-13 | Faculty dashboard | /api/dashboard | DailySubmission | (faculty)/dashboard | Done |
| FR-14 | Review queue | GET /api/submissions | DailySubmission | (faculty)/review/index | Done |
| FR-15 | Approve submission | POST /api/submissions/:id/review | DailySubmission | (faculty)/review/[id] | Done |
| FR-16 | Decline submission | POST /api/submissions/:id/review | DailySubmission | (faculty)/review/[id] | Done |
| FR-17 | Bulk review | POST /api/submissions/review | DailySubmission | (faculty)/review/index | Done |
| FR-18 | View students | GET /api/students | Student | (faculty)/students/index | Done |
| FR-19 | Student detail | GET /api/students/:id | Student, DailySubmission | (faculty)/students/[id] | Done |
| FR-20 | Create question | POST /api/questions | Question | (faculty)/questions | Done |
| FR-21 | Edit question | PATCH /api/questions/:id | Question | (faculty)/questions | Done |
| FR-22 | Retire question | DELETE /api/questions/:id | Question.isActive | (faculty)/questions | Done |
| FR-23 | Reorder questions | PATCH /api/questions/reorder | Question.sortOrder | (faculty)/questions | Done |
| FR-24 | Create department | POST /api/departments | Department | — (API only) | Done |
| FR-25 | Attendance = approved | — (derived) | DailySubmission.status | dashboard cards | Done |

## 2. Non-Functional Requirements → Implementation

| ID | Requirement | Implementation | Verification |
|----|-------------|---------------|--------------|
| NF-01 | Answer 10–2000 chars | Zod schema (shared-validation) | Unit test |
| NF-02 | Review note ≥ 5 chars | Zod schema + API check | Unit test |
| NF-03 | Max 20 active questions | Business logic check + 409 | Unit test |
| NF-04 | Max 5 files per submission | Business logic check + 409 | Unit test |
| NF-05 | Max 10 MB per file | Upload URL validation + 413 | Unit test |
| NF-06 | One submission per day | UNIQUE constraint + 409 | DB + unit test |
| NF-07 | Today only (no backdate) | Server-side date check | Unit test |
| NF-08 | Department scope for faculty | Query filter + fails closed | Unit test |
| NF-09 | Approved is immutable | Status check before edit | Unit test |
| NF-10 | JWT verification | jose + JWKS | Unit test |
| NF-11 | Rate limiting | In-process sliding window | Manual test |
| NF-12 | Audit logging | AuditLog table | Code review |
| NF-13 | RLS enabled | Migration 3 | Supabase dashboard |
| NF-14 | Private storage bucket | Supabase config | Manual verify |
| NF-15 | Prompt snapshot | Write-once on Answer.promptSnapshot | Unit test |

## 3. Business Rules → Enforcement

| Rule | Enforcement Point | Fail Behaviour |
|------|-------------------|----------------|
| One submission per student per day | DB UNIQUE constraint + app check | 409 CONFLICT |
| Faculty scoped to department | Authorization middleware | 403 FORBIDDEN or empty result |
| Admin = institution-wide scope | No department filter applied | Full data access |
| Cannot backdate submissions | Server compares date to today | 422 VALIDATION_ERROR |
| Approved submissions locked | Status check before mutation | 403 FORBIDDEN |
| Declined allows resubmit | Status check allows pending reset | Success (answers replaced) |
| Question soft-retire | isActive = false (not DELETE) | Past answers intact |
| promptSnapshot immutability | Written once at submission time | Cannot update |
| Faculty cannot edit answers | Authorization: write = owner only | 403 FORBIDDEN |
| Document limit per submission | Count check before attach | 409 CONFLICT |

## 4. Security Requirements → Controls

| Threat | Control | Layer |
|--------|---------|-------|
| Unauthorized access | JWT verification + role check | API middleware |
| Cross-department data leak | Department scope filter | Business logic |
| Storage enumeration | Random UUID keys, private bucket | Storage design |
| Orphan files | Two-phase upload, soft-delete | Application logic |
| History falsification | promptSnapshot, approved = locked | Database design |
| Anon key data access | RLS with no permissive policies | Database (Supabase) |
| Brute-force login | Supabase Auth rate limiting | Infrastructure |
| API abuse | In-process rate limiter | API middleware |
