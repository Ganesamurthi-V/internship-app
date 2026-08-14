# Software Requirements Specification — Enhanced for Mobile (iOS + Android)

> **Version 2.0** | Single Codebase React Native (Expo)

---

## 1. System Requirements

### 1.1 Authentication
- Secure login with email + password.
- Role-based access: Student, Faculty, Mentor, Admin.
- Biometric login (Face ID / Touch ID) after initial sign-in.
- Students access only their own internship records.
- Faculty/Admin access records scoped to department/administrative assignment.
- Mentor access limited to assigned students only.
- JWT-based authentication with refresh token rotation.
- Secure token storage: iOS Keychain / Android Keystore via `expo-secure-store`.
- Session expiry with automatic re-authentication prompt.

### 1.2 Student Requirements
- Complete registration once; all other forms pre-populate common fields.
- Upload required documents from camera or file picker.
- Submit daily attendance and work log each working day.
- Submit weekly report with auto-aggregated hours/days.
- Complete final assessment at internship end.
- View own attendance percentage, total hours, submission history, and status at a glance.
- Receive push notifications for missing submissions and upcoming deadlines.
- Work offline; data syncs automatically when connectivity is restored.

### 1.3 Faculty Requirements
- Dashboard showing all active internships in assigned scope.
- Student-wise attendance overview.
- Missing daily submissions list (sorted by last-active date).
- Weekly progress view per student.
- Document completeness checklist.
- Mentor evaluation status.
- Final outcome analytics.
- One-tap evidence export per student or batch.

### 1.4 Mentor Requirements
- View assigned student(s).
- Verify attendance where enabled.
- Review work logs.
- Submit evaluation form.
- Provide remarks and employment recommendation.
- Accessible via mobile app or secure web invite link (no app install required for mentor-only workflow).

### 1.5 Admin Requirements
- Manage users, departments, organisations, internship periods.
- Configure notification schedules and document requirements.
- Access audit logs.
- Bulk export evidence for NBA review.

---

## 2. Business Rules

### 2.1 Internship
- Start date must be ≤ end date.
- Working hours per day must be a positive number.
- Duration is auto-calculated from dates; display as working days and calendar days.
- A student may have one active internship at a time (institution may override).

### 2.2 Attendance
- One attendance record per student per internship date.
- Total hours auto-calculated from reporting/leaving time.
- Leave/absence requires a reason field.
- Holiday and Weekly Off do not count as attended days.
- Attendance proof upload is optional — never block daily submission.
- Mentor verification is a soft confirmation, not a gate.

### 2.3 Daily Work Log
- One daily work log per student per internship date.
- Activities field enforces 200-word maximum (live counter shown).
- Learning field enforces 100-word maximum (live counter shown).
- Evidence upload is optional and gated by "Is the organisation permitting evidence uploads?" setting.

### 2.4 Weekly Report
- One report per student per internship week (week = Mon–Sun or configurable).
- Week dates must fall within internship start/end dates.
- Days attended and total hours are pre-populated from attendance records; student cannot override without faculty unlock.

### 2.5 Final Assessment
- Unlocked when internship end date is reached OR faculty manually enables early access.
- Usefulness rating and all skill ratings must be 1–5.
- Objectives status: Fully / Partially / No.
- Cannot be re-submitted after final submission unless faculty/admin reopens.

### 2.6 Mentor Evaluation
- Ratings must be 1–5 on all 10 parameters.
- Mentor evaluates only assigned students.
- Immutable after digital confirmation unless faculty/admin reopens.

---

## 3. Validation Rules

| Field | Rule |
|---|---|
| Email | RFC 5322 format |
| Mobile | 10-digit Indian mobile or E.164 |
| Dates | ISO 8601; start ≤ end |
| Times | HH:MM; leaving > reporting |
| Activities | ≤ 200 words |
| Learning | ≤ 100 words |
| Ratings | Integer 1–5 |
| File type | PDF, JPG, PNG, HEIC |
| File size | ≤ 10 MB per file |
| Duplicates | Prevent duplicate attendance, work log, weekly report per date/week |

---

## 4. Notifications

| Event | Trigger | Channel |
|---|---|---|
| Missing daily submission | No log by configurable time (e.g., 9 PM) | Push + in-app |
| Weekly report due | Sunday 6 PM of each internship week | Push + in-app |
| Final assessment due | 3 days before internship end | Push + in-app |
| Mentor evaluation request | Faculty sends; mentor gets email/push | Push + email |
| Document rejected | Faculty marks document invalid | Push + in-app |
| Internship approved | Faculty approves registration | Push + in-app |

Notification schedules are configurable by Admin. Push notifications use FCM (Android) and APNs (iOS) via Expo Notifications.

---

## 5. Offline Behaviour

| Action | Offline Behaviour |
|---|---|
| Submit attendance | Queued locally in SQLite; submitted on reconnect |
| Submit work log | Queued locally; submitted on reconnect |
| View own records | Served from local cache |
| Upload document | Upload queued; file cached locally until sent |
| Faculty dashboard | Stale cache shown with last-sync timestamp |
| Mentor evaluation | Requires connectivity (not queued offline) |

Conflict policy: server record wins for approved/verified records. Student edits win for draft records.

---

## 6. Auditability

Record for every significant action:
- `actor_user_id`
- `action` (enum)
- `entity_type` and `entity_id`
- `timestamp`
- `client_platform` (ios / android / web)
- `client_version`
- `ip_address` (server-side)
- `metadata` (JSON diff or additional context)

Audited actions include: role changes, internship approval/rejection, attendance edits, mentor evaluation edits, document verification, final assessment reopening, report exports.

---

## 7. Reporting

System supports:
- Attendance percentage per student (auto-calculated)
- Total internship hours
- Days attended vs working days
- Daily activity history (searchable by date, tech, keyword)
- Weekly progress timeline
- Technology usage tags (aggregated per cohort)
- Skill self-ratings (individual and cohort average)
- Mentor ratings (individual and cohort average)
- Completion status breakdown
- Document completeness percentage
- Organisation-wise statistics
- Department-wise statistics
- Internship-period statistics

All reports exportable as PDF or CSV from the mobile app.

---

## 8. Accessibility

- Minimum tap target: 44×44 pts (Apple HIG) / 48×48 dp (Material).
- Dynamic type / font scaling supported.
- All interactive elements have accessibility labels.
- Colour contrast meets WCAG 2.1 AA.
- Screen reader compatible (VoiceOver / TalkBack).
