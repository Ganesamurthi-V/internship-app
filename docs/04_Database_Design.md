# 04 — Database Design

## 1. Overview

8 models, hosted on Supabase PostgreSQL, managed by Prisma 6.

```
User ─────┐
           ├──── Department
Student ──┘          │
    │                │
    ▼                │
DailySubmission ◄────┘ (scope)
    │
    ├── Answer ──── Question
    └── Document

AuditLog (standalone)
```

## 2. Enums

```sql
CREATE TYPE "UserRole" AS ENUM ('student', 'faculty', 'admin');
CREATE TYPE "UserStatus" AS ENUM ('active', 'suspended', 'pending');
CREATE TYPE "ClientPlatform" AS ENUM ('ios', 'android', 'web');
CREATE TYPE "SubmissionStatus" AS ENUM ('pending', 'approved', 'declined');
CREATE TYPE "QuestionType" AS ENUM ('text', 'long_text', 'number', 'choice');
```

## 3. Models

### 3.1 User

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK, auto-generated |
| auth_id | VARCHAR | Unique, links to Supabase auth.users.id |
| email | VARCHAR | Unique |
| role | UserRole | student, faculty, admin |
| status | UserStatus | Default: active |
| name | VARCHAR? | Display name for faculty/admin |
| department_id | UUID? | FK → Department. Null = institution-wide |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Indexes: `auth_id`, `(role, status)`

### 3.2 Department

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| name | VARCHAR | |
| institution | VARCHAR | Default: "Sri Manakula Vinayagar Engineering College" |
| created_at | TIMESTAMPTZ | |

Unique constraint: `(name, institution)`

### 3.3 Student

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| user_id | UUID | Unique FK → User (1:1) |
| register_number | VARCHAR | Unique, stored uppercase |
| name | VARCHAR | |
| programme | VARCHAR | |
| department_id | UUID? | FK → Department |
| year | INT? | CHECK (1–5) |
| section | VARCHAR? | |
| student_email | VARCHAR | |
| mobile | VARCHAR? | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Indexes: `register_number`, `department_id`

### 3.4 Question

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| prompt | TEXT | The question text |
| help_text | TEXT? | Optional guidance |
| type | QuestionType | Default: long_text |
| sort_order | INT | Display order, default 0 |
| is_active | BOOLEAN | Default: true (soft-retire) |
| required | BOOLEAN | Default: true |
| options | JSONB? | Choice options as string array |
| min_length | INT? | For text validation |
| max_length | INT? | For text validation |
| department_id | UUID? | Null = institution-wide |
| created_by | UUID? | FK → User |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

Indexes: `(is_active, sort_order)`, `department_id`

### 3.5 DailySubmission

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| student_id | UUID | FK → Student |
| submission_date | DATE | The day being answered for |
| status | SubmissionStatus | Default: pending |
| submitted_at | TIMESTAMPTZ | |
| reviewed_by | UUID? | FK → User |
| reviewed_at | TIMESTAMPTZ? | |
| review_note | TEXT? | Required on decline |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Unique constraint: `(student_id, submission_date)` — one per student per day**

Indexes: `(status, submission_date)`, `(student_id, submission_date)`

### 3.6 Answer

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| submission_id | UUID | FK → DailySubmission (cascade delete) |
| question_id | UUID | FK → Question (cascade delete) |
| prompt_snapshot | TEXT | Question prompt at time of answer |
| answer_text | TEXT | |
| created_at | TIMESTAMPTZ | |
| updated_at | TIMESTAMPTZ | |

**Unique constraint: `(submission_id, question_id)` — one answer per question per submission**

Index: `submission_id`

### 3.7 Document

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| owner_user_id | UUID | FK → User (cascade delete) |
| submission_id | UUID? | FK → DailySubmission. Nullable for pre-attach uploads |
| storage_key | VARCHAR | Unique, random UUID path. Never exposed to client |
| original_filename | VARCHAR | |
| mime_type | VARCHAR | |
| size_bytes | INT | |
| checksum | VARCHAR? | SHA-256 |
| uploaded_at | TIMESTAMPTZ | |
| deleted_at | TIMESTAMPTZ? | Soft delete |

Indexes: `owner_user_id`, `submission_id`

### 3.8 AuditLog

| Column | Type | Notes |
|--------|------|-------|
| id | UUID | PK |
| actor_user_id | UUID? | FK → User. Null for unauthenticated events |
| action | VARCHAR | Enumerated action name |
| entity_type | VARCHAR | e.g., "submission", "question" |
| entity_id | UUID? | |
| client_platform | ClientPlatform? | |
| client_version | VARCHAR? | |
| ip_address | INET? | |
| metadata | JSONB? | |
| created_at | TIMESTAMPTZ | |

Indexes: `(entity_type, entity_id)`, `created_at`, `actor_user_id`, `action`

## 4. Key Constraints

| Rule | Implementation |
|------|----------------|
| One submission per day per student | UNIQUE (student_id, submission_date) |
| One answer per question per submission | UNIQUE (submission_id, question_id) |
| Student year range | CHECK (year BETWEEN 1 AND 5) |
| One student per user | UNIQUE (user_id) on Student |
| One auth account per user | UNIQUE (auth_id) on User |

## 5. Relationships

- User 1:1 Student (via user_id)
- User N:1 Department (staff assignment)
- Student N:1 Department
- Student 1:N DailySubmission
- DailySubmission 1:N Answer
- DailySubmission 1:N Document
- Question 1:N Answer
- User 1:N Document (ownership)
- User 1:N AuditLog (actor)
- User 1:N Question (author)
- User 1:N DailySubmission (reviewer)

## 6. Design Decisions

1. **No Attendance table** — Attendance is derived from approved DailySubmissions. This eliminates any possibility of the two getting out of sync.

2. **promptSnapshot on Answer** — When a question is edited or retired, past submissions still show what the student was actually asked. This is a deliberate denormalization for audit integrity.

3. **Document.submissionId is nullable** — The two-phase upload flow issues a signed URL before the submission exists. The `/complete` endpoint attaches the document afterward.

4. **Soft-delete for Documents** — Row is marked with `deleted_at` first, then storage object is removed. Prevents orphaned rows if storage deletion fails.

5. **Questions are soft-retired** — `is_active = false` rather than DELETE. Past answers still reference the question via foreign key.

6. **DATE not TIMESTAMP for submission_date** — "Which day" should never be a timezone question. The date is in the institution's timezone.
