# 09 — Test Plan

## 1. Overview

Testing strategy for the IMS daily submission system covering unit, integration, and end-to-end layers.

## 2. Test Layers

| Layer | What | Tool | Status |
|-------|------|------|--------|
| Unit (shared-validation) | Zod schemas, domain calculations | Vitest | Passing (42 tests) |
| Unit (backend) | Authorization matrix, business logic | Vitest | Passing (59 tests) |
| Integration (API) | Full request → response with real DB | Vitest + Prisma | Not yet written |
| E2E (mobile) | User flows on device/simulator | Detox or Maestro | Not yet written |

## 3. Unit Tests

### 3.1 Shared Validation (`packages/shared-validation`)
- Zod schema parsing (valid and invalid inputs)
- Answer length validation (min 10, max 2000)
- Review note length validation (min 5)
- Question type-specific validation (choice must match options)
- File size and MIME type validation
- Pagination parameter parsing

### 3.2 Backend Business Logic
- Authorization matrix: every role × every action combination
- Scope enforcement: faculty sees only own department
- Faculty with null department sees nothing (fails closed)
- Submission state transitions: pending → approved, pending → declined, declined → pending
- Approved submission is immutable (edit rejected)
- Max 20 active questions constraint
- Max 5 documents per submission
- Unique constraint: one submission per student per day
- promptSnapshot is captured correctly

## 4. Integration Tests (Planned)

### 4.1 Auth Flow
- Login with valid credentials → JWT + user record
- Login with invalid credentials → 401
- Access protected route without token → 401
- Access with expired token → 401 (triggers refresh)
- `GET /api/auth/me` returns correct user profile

### 4.2 Submission Flow
- Student submits for today → 201 + submission created
- Student submits again same day (pending) → answers replaced
- Student submits again same day (approved) → 403
- Student submits again same day (declined) → answers replaced, status → pending
- Answers meet length requirements
- Answers fail length requirements → 422 with field errors
- Submit with missing required question → 422

### 4.3 Review Flow
- Faculty approves pending → status = approved, reviewedBy set
- Faculty declines without note → 422
- Faculty declines with note → status = declined, reviewNote set
- Faculty reviews submission from other department → 403
- Admin reviews submission from any department → 200
- Bulk review: mixed valid/invalid IDs handled correctly

### 4.4 Questions Flow
- Create question → 201
- Create when 20 active already exist → 409
- Retire question → isActive = false, past answers still reference it
- Reorder → sortOrder values updated
- Faculty creates question scoped to own department → OK
- Faculty creates question for other department → 403

### 4.5 Documents Flow
- Request upload URL → signed URL + document ID
- Complete with valid document ID → attached to submission
- Complete when 5 already attached → 409
- Request URL for disallowed MIME type → 415
- Request URL for file > 10 MB → 413
- Delete own document → soft-deleted
- Delete another's document → 403
- Download with valid access → signed URL returned

### 4.6 Scope Enforcement
- Faculty GET /api/students → only own department students
- Faculty GET /api/submissions?status=pending → only own department
- Admin GET /api/students → all students
- Faculty with departmentId=null → empty results (fails closed)

## 5. End-to-End Tests (Planned)

### 5.1 Student Happy Path
1. Login as student
2. Navigate to Today tab
3. Tap "Answer"
4. Fill all questions
5. Attach a document
6. Submit
7. Verify dashboard shows "Pending"
8. Check History tab shows submission

### 5.2 Faculty Review Path
1. Login as faculty
2. Navigate to Review tab
3. Verify pending submission appears
4. Open submission detail
5. Approve submission
6. Verify it disappears from queue

### 5.3 Decline and Resubmit
1. Faculty declines with reason
2. Student sees "Declined" with note on dashboard
3. Student taps "Resubmit"
4. Edits answers and submits
5. Status returns to "Pending"

### 5.4 Authorization E2E
- Student cannot access faculty tabs
- Faculty cannot access other department's data
- Student cannot review their own submission

## 6. Performance Tests (Planned)

| Scenario | Target |
|----------|--------|
| GET /api/submissions (paginated) | < 200ms p95 |
| GET /api/dashboard | < 300ms p95 |
| POST /api/submissions (with 10 answers) | < 500ms p95 |
| GET /api/students (search with pg_trgm) | < 300ms p95 |

## 7. Security Tests (Planned)

- Token expiry handling
- CORS enforcement
- Rate limit enforcement (429 after threshold)
- SQL injection via Zod (schemas reject non-string where string expected)
- File upload: oversized file rejected before reaching storage
- Storage key enumeration: random UUIDs not guessable
- RLS: anon key cannot read any table via Supabase REST API
