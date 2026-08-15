# 05 — API Specification

## 1. Conventions

- Base URL: `/api`
- Auth: Bearer token in `Authorization` header (Supabase JWT)
- Request bodies: JSON (`Content-Type: application/json`)
- All responses follow `{ data, error, meta }` envelope
- Errors return `{ error: { code, message, details? } }`
- Pagination: `?page=1&limit=20` (default limit 20, max 100)
- Dates in responses: ISO 8601
- UUIDs for all entity IDs

## 2. Error Codes

| Code | HTTP Status | Meaning |
|------|-------------|---------|
| VALIDATION_ERROR | 422 | Request body/params failed schema validation |
| UNAUTHORIZED | 401 | Missing or invalid token |
| FORBIDDEN | 403 | Authenticated but not allowed |
| NOT_FOUND | 404 | Resource does not exist |
| CONFLICT | 409 | Duplicate (e.g., submission already exists for today) |
| RATE_LIMITED | 429 | Too many requests |
| PAYLOAD_TOO_LARGE | 413 | File exceeds 10 MB |
| UNSUPPORTED_MEDIA_TYPE | 415 | File type not allowed |
| SERVER_ERROR | 500 | Unhandled error |

## 3. Endpoints (20 total)

---

### 3.1 Auth

#### `GET /api/auth/me`
Returns the authenticated user's profile.

**Response:** User object with role, status, department, and student record if applicable.

#### `POST /api/auth/forgot-password`
Triggers password reset email via Supabase.

**Body:** `{ email: string }`

**Response:** `{ data: { message: "Reset email sent" } }`

#### `POST /api/auth/reset-password`
Completes password reset.

**Body:** `{ token: string, password: string }`

---

### 3.2 Dashboard

#### `GET /api/dashboard`
Role-discriminated dashboard data.

**Student response:**
```json
{
  "role": "student",
  "todayStatus": "pending" | "approved" | "declined" | null,
  "attendance": { "approved": 45, "total": 60, "percentage": 75 },
  "recentSubmissions": [...]
}
```

**Faculty/Admin response:**
```json
{
  "role": "faculty",
  "pendingReviewCount": 12,
  "totalStudents": 48,
  "todaySubmissionCount": 35,
  "stats": { "approved": 180, "declined": 5, "pending": 12 }
}
```

---

### 3.3 Departments

#### `GET /api/departments`
List all departments. Any authenticated user.

#### `POST /api/departments`
Create a department. Admin only.

**Body:** `{ name: string }`

---

### 3.4 Questions

#### `GET /api/questions`
List questions. Faculty/admin: all (including inactive). Student: active only, filtered by department scope.

**Query params:** `?active=true&departmentId=uuid`

#### `POST /api/questions`
Create a question. Faculty/admin only.

**Body:**
```json
{
  "prompt": "What did you work on today?",
  "type": "long_text",
  "helpText": "Describe in detail",
  "required": true,
  "options": null,
  "minLength": 10,
  "maxLength": 2000,
  "departmentId": null
}
```

**Constraint:** Max 20 active questions. Returns CONFLICT if exceeded.

#### `GET /api/questions/:id`
Single question detail.

#### `PATCH /api/questions/:id`
Update question fields. Faculty/admin only.

#### `DELETE /api/questions/:id`
Soft-retire (sets `isActive = false`). Faculty/admin only.

#### `PATCH /api/questions/reorder`
Batch update sort order. Faculty/admin only.

**Body:** `{ order: [{ id: "uuid", sortOrder: number }] }`

---

### 3.5 Submissions

#### `GET /api/submissions`
List submissions. Student: own submissions. Faculty: department submissions. Admin: all.

**Query params:** `?status=pending&page=1&limit=20&studentId=uuid&from=date&to=date`

#### `POST /api/submissions`
Submit answers for today.

**Body:**
```json
{
  "answers": [
    { "questionId": "uuid", "answerText": "My work today..." }
  ]
}
```

**Rules:**
- One per student per day (CONFLICT on duplicate)
- If existing submission is pending or declined: answers replaced, status reset to pending
- If approved: returns FORBIDDEN
- Answer length: 10–2000 characters
- Back-dating not allowed

#### `GET /api/submissions/today`
Returns today's active questions + existing submission if present. Student only.

**Response:**
```json
{
  "questions": [...],
  "submission": { ... } | null
}
```

#### `GET /api/submissions/:id`
Submission detail with answers and documents.

#### `DELETE /api/submissions/:id`
Delete own pending submission. Student only (pending status only).

#### `POST /api/submissions/:id/review`
Review a single submission. Faculty/admin only.

**Body:**
```json
{
  "decision": "approved" | "declined",
  "reviewNote": "Please add more detail about..."
}
```

**Rules:** `reviewNote` required for decline (min 5 chars).

#### `POST /api/submissions/review`
Bulk review. Faculty/admin only.

**Body:**
```json
{
  "submissionIds": ["uuid", "uuid"],
  "decision": "approved" | "declined",
  "reviewNote": "..."
}
```

---

### 3.6 Students

#### `GET /api/students`
List students. Faculty: own department. Admin: all.

**Query params:** `?search=name&departmentId=uuid&page=1&limit=20`

#### `GET /api/students/me`
Current student's profile.

#### `PATCH /api/students/me`
Update own profile.

**Body:** `{ mobile?: string, section?: string, year?: number }`

#### `GET /api/students/:id`
Student detail with attendance summary and submission history. Faculty/admin only.

**Response:**
```json
{
  "student": { ... },
  "summary": { "totalDays": 60, "approved": 45, "declined": 3, "pending": 2 },
  "recentSubmissions": [...]
}
```

---

### 3.7 Documents

#### `GET /api/documents`
List unattached documents (uploaded but not yet linked to a submission). Owner only.

#### `POST /api/documents/upload-url`
Request a signed upload URL.

**Body:** `{ filename: string, mimeType: string, sizeBytes: number }`

**Validations:**
- Allowed MIME types: application/pdf, image/jpeg, image/png, image/heic
- Max size: 10 MB (10,485,760 bytes)

**Response:**
```json
{
  "documentId": "uuid",
  "uploadUrl": "https://...",
  "expiresAt": "2025-01-01T00:10:00Z"
}
```

#### `POST /api/documents/complete`
Confirm upload and attach to a submission.

**Body:** `{ documentId: string, submissionId: string }`

**Constraint:** Max 5 documents per submission.

#### `GET /api/documents/:id`
Returns signed download URL. Owner or reviewer of the submission.

#### `DELETE /api/documents/:id`
Soft-delete document. Owner only.

---

## 4. Authorization Summary

| Endpoint | Student | Faculty | Admin |
|----------|---------|---------|-------|
| auth/* | ✓ | ✓ | ✓ |
| dashboard | ✓ (own) | ✓ (dept) | ✓ (all) |
| departments GET | ✓ | ✓ | ✓ |
| departments POST | ✗ | ✗ | ✓ |
| questions GET | ✓ (active) | ✓ (all) | ✓ (all) |
| questions CUD | ✗ | ✓ (dept) | ✓ (all) |
| submissions GET | ✓ (own) | ✓ (dept) | ✓ (all) |
| submissions POST | ✓ | ✗ | ✗ |
| submissions review | ✗ | ✓ (dept) | ✓ (all) |
| students list | ✗ | ✓ (dept) | ✓ (all) |
| students/me | ✓ | ✗ | ✗ |
| students/:id | ✗ | ✓ (dept) | ✓ (all) |
| documents | ✓ (own) | ✓ (via review) | ✓ (via review) |
