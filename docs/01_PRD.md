# 01 — Product Requirements Document

## 1. Overview

The Internship Management System (IMS) is a mobile-first daily submission and attendance tracking tool for Sri Manakula Vinayagar Engineering College. Students answer a set of faculty-configured questions each day and optionally attach supporting documents. The submission itself is the attendance record — there is no separate check-in step. Faculty and admins review submissions and approve or decline them.

## 2. Problem Statement

Tracking daily student activities during internships relies on paper logs or disconnected spreadsheets. This leads to lost records, inconsistent tracking, and no easy way for faculty to review and verify what a student did each day.

## 3. Goals

| # | Goal |
|---|------|
| G1 | Replace paper-based daily logs with a structured digital submission |
| G2 | Derive attendance directly from approved submissions (single source of truth) |
| G3 | Give faculty a streamlined review queue with approve/decline workflow |
| G4 | Support file attachments (photos of work, PDFs) as evidence |
| G5 | Maintain audit history with immutable snapshots of questions asked |

## 4. Users and Roles

| Role | Description |
|------|-------------|
| Student | Answers daily questions, attaches documents, views own history |
| Faculty | Manages questions, reviews submissions for their department |
| Admin | Same capabilities as faculty, scoped to the entire institution |

Admin is not a separate feature set — it is faculty with institution-wide data scope.

## 5. Core Loop

```
Faculty configures questions
        ↓
Student opens app → sees today's questions → answers → attaches files → submits
        ↓
Submission lands as "pending" (= today's attendance)
        ↓
Faculty reviews → approves or declines (with note)
        ↓
Approved = day attended | Declined = student may resubmit
```

## 6. Functional Requirements

### 6.1 Questions Management (Faculty/Admin)

- Create, edit, reorder, and soft-retire daily questions
- Question types: text, long_text, number, choice
- Department-scoped or institution-wide questions
- Maximum 20 active questions at once

### 6.2 Daily Submission (Student)

- One submission per student per day (enforced by unique constraint)
- Student answers all active questions for their department
- Can attach up to 5 files (PDF, JPG, PNG, HEIC; max 10 MB each)
- Cannot back-date (today only, `SUBMISSION_BACKDATE_DAYS = 0`)
- Can edit while status is pending (`ALLOW_EDIT_WHILE_PENDING = true`)
- Resubmission allowed after decline (status resets to pending)
- Approved submissions are locked

### 6.3 Review (Faculty/Admin)

- Review queue showing pending submissions
- Individual approve/decline with optional note
- Bulk approve/decline
- Decline requires a reason (minimum 5 characters)
- Faculty scoped to their department; admin sees all

### 6.4 Attendance

- No separate attendance table
- A day is "attended" when an approved DailySubmission exists for that student on that date
- Dashboard shows attendance metrics derived from submission history

### 6.5 Documents

- Two-phase upload: get signed URL → upload to storage → confirm with `/complete`
- Private bucket with signed download URLs
- Soft delete (mark row, then remove storage object)
- Documents are reviewed as part of their submission (no per-file review state)

### 6.6 Student Profile

- Register number, name, programme, department, year, section, email, mobile
- Editable by owner and admin only

## 7. Non-Functional Requirements

| Area | Requirement |
|------|-------------|
| Platform | iOS and Android via Expo; backend via Next.js on Vercel/similar |
| Auth | Supabase Auth with local JWT verification |
| Data store | PostgreSQL on Supabase |
| File storage | Supabase Storage (private bucket) |
| Performance | API responses < 500ms p95 |
| Security | Row-level scoping in application code; RLS as defense-in-depth |

## 8. Out of Scope

- Offline sync / local SQLite database
- Push notifications
- Mentor role or external industry mentor features
- Weekly reports, final assessments, skill ratings
- Organisation/company records
- Evidence export jobs
- Web faculty portal (future)
