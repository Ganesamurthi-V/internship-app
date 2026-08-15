# 02 — Software Requirements Specification

## 1. Authentication

### 1.1 Login
- Email + password via Supabase Auth
- JWT issued by Supabase, verified locally using `jose` with JWKS
- LRU cache of verified user records to reduce DB lookups
- Session persists until app is killed (in-memory token store currently)

### 1.2 Forgot Password
- `POST /api/auth/forgot-password` triggers Supabase's password reset email
- `POST /api/auth/reset-password` completes the flow with the reset token

### 1.3 Current User
- `GET /api/auth/me` returns the authenticated user's profile and role

## 2. Dashboard

`GET /api/dashboard` returns a role-discriminated response:

**Student dashboard:**
- Today's submission status (none / pending / approved / declined)
- Attendance summary (approved count, total days, percentage)
- Recent submission history

**Faculty/Admin dashboard:**
- Pending review count
- Total students (scoped to department for faculty)
- Today's submission count
- Approval/decline statistics

## 3. Questions

| Requirement | Detail |
|-------------|--------|
| Create | `POST /api/questions` — prompt, type, helpText, options, required, department scope |
| List | `GET /api/questions` — returns active questions in sort order |
| Update | `PATCH /api/questions/:id` — edit prompt, type, options, active status |
| Delete | `DELETE /api/questions/:id` — soft-retire (sets `isActive = false`) |
| Reorder | `PATCH /api/questions/reorder` — batch update sort_order values |
| Limit | Maximum 20 active questions at any time |
| Types | text, long_text, number, choice |
| Choice | Options stored as JSON array; answer must be one of them |
| Scope | Questions can be department-scoped or institution-wide (null department) |

## 4. Submissions

### 4.1 Submit Answers
- `POST /api/submissions` with answers array
- Each answer includes questionId and answerText
- Server snapshots the question prompt into `promptSnapshot`
- Creates DailySubmission + Answer rows in a transaction
- Unique constraint: one submission per student per calendar day

### 4.2 Today's Form
- `GET /api/submissions/today` returns active questions + existing submission if any
- Used to render the answer form and detect resubmission state

### 4.3 Edit / Resubmit
- If status is pending: answers are replaced wholesale
- If status is declined: submission resets to pending, answers are replaced
- If status is approved: submission is locked, edits rejected

### 4.4 Review
- `POST /api/submissions/:id/review` — approve or decline a single submission
- `POST /api/submissions/review` — bulk review (array of submission IDs + decision)
- Decline requires `reviewNote` (min 5 characters)
- Sets reviewedById, reviewedAt, reviewNote, status

### 4.5 Validation Rules
- Answer min length: 10 characters
- Answer max length: 2000 characters
- Review note min length: 5 characters (decline only)
- Back-dating: not allowed (today only)

## 5. Students

| Endpoint | Behaviour |
|----------|-----------|
| `GET /api/students` | List students; faculty sees own department, admin sees all |
| `GET /api/students/me` | Current student's profile |
| `PATCH /api/students/me` | Update own profile (mobile, section, year) |
| `GET /api/students/:id` | Student detail + submission summary + history |

## 6. Documents

| Step | Endpoint | Detail |
|------|----------|--------|
| 1. Request URL | `POST /api/documents/upload-url` | Returns signed upload URL + document ID |
| 2. Upload | Client PUT to signed URL | Direct to Supabase Storage |
| 3. Confirm | `POST /api/documents/complete` | Attaches document to submission, records metadata |
| 4. Download | `GET /api/documents/:id` | Returns signed download URL |
| 5. Delete | `DELETE /api/documents/:id` | Soft-delete (marks deleted_at, removes from storage) |
| 6. List unattached | `GET /api/documents` | Documents uploaded but not yet attached to a submission |

### Constraints
- Max 5 files per submission
- Max 10 MB per file
- Allowed types: PDF, JPG, PNG, HEIC
- Storage key is a random UUID (never derived from filename or student data)

## 7. Departments

- `GET /api/departments` — list all departments
- `POST /api/departments` — create department (admin only)

## 8. Authorization Matrix

| Resource | Action | Allowed Roles |
|----------|--------|---------------|
| Submission | create/edit | Owner (student) only |
| Submission | review | Department faculty + admin |
| Question | create/edit/delete | Department faculty + admin |
| Student profile | edit | Owner + admin |
| Department | create | Admin |
| Documents | upload/delete | Owner only |
| Documents | view (via submission) | Owner + scoped reviewer |

Faculty scope is departmental and fails closed on null department (a faculty with no department sees nothing).

## 9. Business Rules

1. Attendance = count of approved DailySubmissions (no separate table)
2. One submission per student per day (unique constraint on studentId + submissionDate)
3. Editing a question does not alter past answers (promptSnapshot preserves history)
4. Questions are soft-retired, never hard-deleted
5. Faculty cannot create or edit student answers
6. Approved submissions are immutable
7. Declined submissions can be resubmitted (answers replaced wholesale)
