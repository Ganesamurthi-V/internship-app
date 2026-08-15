# 06 — Application Flow

## 1. Authentication Flow

```
App Launch
    │
    ▼
┌─────────────────┐     No token      ┌───────────┐
│ Check Auth State │──────────────────▶│  Login    │
└────────┬────────┘                    │  Screen   │
         │ Token valid                 └─────┬─────┘
         ▼                                   │
┌─────────────────┐                          │ Success
│ GET /api/auth/me│◀─────────────────────────┘
└────────┬────────┘
         │
         ▼
┌─────────────────┐
│ Route by role:  │
│ student → (student)/dashboard │
│ faculty → (faculty)/dashboard │
│ admin   → (faculty)/dashboard │
└─────────────────┘
```

### Login
1. User enters email + password
2. Supabase Auth returns JWT
3. App stores token in memory (Zustand)
4. `GET /api/auth/me` loads user profile
5. Router redirects to role-appropriate tab layout

### Forgot Password
1. User taps "Forgot Password" on login screen
2. Enters email → `POST /api/auth/forgot-password`
3. Receives reset email from Supabase
4. Clicks link → enters new password → `POST /api/auth/reset-password`

## 2. Student Flows

### 2.1 Daily Submission (Happy Path)

```
Today Tab (Dashboard)
    │
    │ Tap "Answer" / "Submit Today's Log"
    ▼
Answer Screen
    │
    │ 1. GET /api/submissions/today → questions + existing submission
    │ 2. Student fills in answers
    │ 3. (Optional) Upload files:
    │    a. POST /api/documents/upload-url
    │    b. PUT file to signed URL
    │    c. POST /api/documents/complete
    │ 4. POST /api/submissions
    ▼
Success → Navigate back to Today Tab
    │
    │ Dashboard now shows: "Pending review"
    ▼
Wait for faculty review
```

### 2.2 Resubmission After Decline

```
Today Tab shows: "Declined" + review note
    │
    │ Tap "Resubmit"
    ▼
Answer Screen (pre-filled with previous answers)
    │
    │ Student edits answers
    │ POST /api/submissions (replaces answers, resets to pending)
    ▼
Success → Status back to "Pending"
```

### 2.3 History

```
History Tab
    │
    │ GET /api/submissions?page=1&limit=20
    ▼
List of past submissions with status badges
    │
    │ Tap a submission
    ▼
Detail view: answers, documents, review note if declined
```

### 2.4 Profile

```
Profile Tab
    │
    │ GET /api/students/me
    ▼
View: register number, name, programme, department, year, section, email, mobile
    │
    │ Tap "Edit"
    ▼
Edit: mobile, section, year
    │
    │ PATCH /api/students/me
    ▼
Updated
```

## 3. Faculty/Admin Flows

### 3.1 Overview (Dashboard)

```
Overview Tab
    │
    │ GET /api/dashboard
    ▼
Cards:
  - Pending reviews (count)
  - Today's submissions (count)
  - Total students
  - Approval stats
```

### 3.2 Review Queue

```
Review Tab
    │
    │ GET /api/submissions?status=pending
    ▼
List of pending submissions
    │
    │ Tap a submission
    ▼
Review Detail Screen [id]
    │
    │ View: student name, date, answers, attached documents
    │
    ├── Tap "Approve" → POST /api/submissions/:id/review { decision: "approved" }
    │
    └── Tap "Decline" → Enter reason (min 5 chars)
                       → POST /api/submissions/:id/review { decision: "declined", reviewNote: "..." }
```

### 3.3 Bulk Review

```
Review Tab → Select multiple submissions
    │
    │ POST /api/submissions/review { submissionIds: [...], decision: "approved" }
    ▼
All selected submissions approved/declined
```

### 3.4 Students Management

```
Students Tab
    │
    │ GET /api/students
    ▼
Student list with search
    │
    │ Tap a student
    ▼
Student Detail [id]
    │
    │ GET /api/students/:id
    ▼
View: profile, attendance summary, submission history
```

### 3.5 Questions Management

```
Questions Tab
    │
    │ GET /api/questions
    ▼
List of questions (active + retired) with drag-to-reorder
    │
    ├── Tap "Add" → Form: prompt, type, helpText, required, options, department
    │              → POST /api/questions → Added to list
    │
    ├── Tap a question → PATCH /api/questions/:id → Edit fields
    │
    ├── Tap "Retire" → DELETE /api/questions/:id → Soft-retired
    │
    └── Drag to reorder → PATCH /api/questions/reorder
```

## 4. Document Upload Flow (Detail)

```
Answer Screen → Tap "Attach File"
    │
    ▼
Device file picker (PDF, JPG, PNG, HEIC)
    │
    │ Validate: ≤ 10 MB, allowed MIME type
    ▼
POST /api/documents/upload-url { filename, mimeType, sizeBytes }
    │
    │ Response: { documentId, uploadUrl }
    ▼
PUT file bytes to uploadUrl (direct to Supabase Storage)
    │
    ▼
POST /api/documents/complete { documentId, submissionId }
    │
    │ Document attached to submission
    ▼
Thumbnail/badge shown in answer form
```

## 5. State Transitions

### Submission Status

```
                    ┌──────────────────────┐
                    │                      │
[New] ──submit──▶ PENDING ──approve──▶ APPROVED (locked)
                    │                      
                    │──decline──▶ DECLINED ──resubmit──▶ PENDING
                    │                                      │
                    └──────────────────────────────────────┘
```

| From | Action | To | Who |
|------|--------|----|-----|
| (none) | Submit | pending | Student |
| pending | Edit | pending | Student |
| pending | Approve | approved | Faculty/Admin |
| pending | Decline | declined | Faculty/Admin |
| declined | Resubmit | pending | Student |
| approved | (locked) | — | — |
