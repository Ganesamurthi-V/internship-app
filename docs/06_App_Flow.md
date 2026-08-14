# Application Flow — Mobile App (React Native / Expo Router)

> **Version 2.0** | Screen-level flows for iOS + Android

---

## 1. Screen Map

```
/(auth)/
  login
  forgot-password
  reset-password

/(student)/
  dashboard
  internship/
    register          ← Registration wizard (3 steps)
    view              ← Approved internship summary
    documents         ← Upload checklist
  attendance/
    today             ← Primary daily action
    history           ← Calendar view + list
  work-log/
    today
    history/:date
  weekly-report/
    list
    [weekNumber]
  final-assessment/
    index
    skill-ratings
  profile

/(faculty)/
  dashboard
  students/
    index             ← Search + list
    [studentId]/
      overview
      attendance
      work-logs
      weekly-reports
      documents
      mentor-evaluation
      final-assessment
  evidence/
    export

/(mentor)/
  dashboard
  students/
    index
    [studentId]/
      attendance      ← Verify
      work-logs       ← Review
  evaluation/
    [internshipId]

/(admin)/
  users
  organisations
  departments
  settings
  audit
```

---

## 2. Student Onboarding Flow

```
App Launch
    │
    ▼
Token valid?
  ├── YES → Role check
  │           ├── student   → Student Dashboard
  │           ├── faculty   → Faculty Dashboard
  │           ├── mentor    → Mentor Dashboard
  │           └── admin     → Admin Panel
  │
  └── NO  → Login Screen
               │
               ▼
           Enter email + password
               │
               ▼
           POST /api/auth/login
               │
        ┌──────┴──────┐
       FAIL          SUCCESS
        │              │
    Show error     Store tokens
                   (expo-secure-store)
                       │
                       ▼
               Register push token
               POST /api/device-tokens
                       │
                       ▼
               First login?
               ├── YES → Profile completion prompt
               └── NO  → Dashboard
```

---

## 3. Internship Registration Flow (Student)

```
Dashboard — "Register Internship" CTA
    │
    ▼
Step 1: Organisation & Internship Details
    ├── Organisation name, location
    ├── Domain selection (chips)
    ├── Mode (offline/online/hybrid)
    ├── Start date, end date (date pickers)
    └── Working hours/day
    │
    ▼
Step 2: Mentor & Coordinator
    ├── Industry mentor name, designation, email, contact
    └── Faculty coordinator (select from list)
    │
    ▼
Step 3: Document Upload
    ├── Offer/Confirmation Letter → camera scan or file picker
    └── Joining Proof → camera scan or file picker
    │
    ▼
Review & Submit → POST /api/internships + POST /api/internships/:id/submit
    │
    ▼
Pending Approval screen (polling or push notification)
    │
    ▼
Push notification: "Your internship has been approved"
    │
    ▼
Student Dashboard (active internship mode)
```

---

## 4. Daily Workflow (Student)

```
App open (any day)
    │
    ▼
Dashboard — shows today's completion status:
    ┌─────────────────────────────┐
    │ Today — Mon, 14 Aug 2026    │
    │ ☐ Attendance  ☐ Work Log    │
    └─────────────────────────────┘
    │
    ▼
Tap "Mark Attendance"
    │
    ▼
Attendance Screen:
    ├── Date (auto-filled, read-only)
    ├── Status (Present/Absent/Leave/Holiday/Weekly Off)
    ├── If Present:
    │   ├── Reporting time (time picker)
    │   ├── Leaving time (time picker)
    │   ├── Mode (chips)
    │   └── Proof upload (optional — never required)
    ├── If Absent/Leave:
    │   └── Reason (text)
    └── Submit
    │
    ▼ (offline? → queued locally)
    │
    ▼
Work Log Screen:
    ├── Activities (textarea, 200-word counter)
    ├── Technologies (tag input)
    ├── Task assigned + completion status
    ├── Learning (textarea, 100-word counter)
    ├── Challenge + Solution
    ├── Deliverable type (chip selection)
    ├── Evidence (optional upload)
    ├── Mentor interaction? (toggle)
    └── Mentor feedback (text, shown if toggle = yes)
    │
    ▼ (offline? → queued locally)
    │
    ▼
Dashboard — both checkmarks green ✅
```

### Offline Banner Behaviour
```
No internet detected
    │
    ▼
Yellow banner: "You're offline — submissions will sync automatically"
    │
User fills and submits form
    │
Stored in WatermelonDB SQLite
    │
"Pending Sync (2 items)" badge on dashboard
    │
Internet restored → auto POST /api/sync
    │
Badge clears → confirmation toast
```

---

## 5. Weekly Report Flow

```
Sunday (or any day of the week)
    │
    ▼
Dashboard → "Weekly Report Due" card (if week is closing)
    │
    ▼
Weekly Report Screen:
    ├── Week number + dates (auto-filled, read-only)
    ├── Days attended + hours (auto-aggregated, read-only)
    ├── Major activities, technologies, skills (free text + tags)
    ├── Major assignment
    ├── Problems + solutions
    ├── Key learning outcomes
    ├── Mentor feedback
    ├── Self-assessment
    └── Upload weekly PDF (required for submission)
    │
    ▼
Submit → POST /api/weekly-reports/:id/submit
    │
    ▼
"Weekly report submitted" success screen
```

---

## 6. Final Assessment Flow

```
Internship end date reached
(or faculty unlocks early)
    │
    ▼
Push notification: "Complete your final assessment"
    │
    ▼
Dashboard → "Final Assessment" card (highlighted)
    │
    ▼
Final Assessment Screen — Part 1: Completion Details
    ├── Completed successfully? (Yes/No)
    ├── Total days attended (auto-filled)
    ├── Total hours (auto-filled)
    ├── Major project/task
    ├── Technologies mastered (tags)
    ├── Skills developed
    └── Objectives achieved (Fully/Partially/No)
    │
    ▼
Part 2: Self-Rating (8 sliders, 1–5)
    ├── Technical knowledge
    ├── Problem solving
    ├── Communication
    ├── Teamwork
    ├── Time management
    ├── Professional discipline
    ├── Adaptability
    └── Industry awareness
    │
    ▼
Part 3: Feedback
    ├── Usefulness rating 1–5 (star picker)
    ├── Technical improvement (text)
    ├── Employability improvement (text)
    ├── Curriculum relation (text)
    ├── Real-world exposure (text)
    ├── Recommend organisation? (Yes/No)
    └── Suggestions (text)
    │
    ▼
Final Documents Upload Checklist:
    ├── ☐ Completion Certificate
    ├── ☐ Internship Report
    ├── ☐ Project Report (if applicable)
    ├── ☐ Offer/Joining Letter (may already be uploaded)
    ├── ☐ Attendance Certificate
    ├── ☐ Mentor Evaluation doc
    └── ☐ Final Presentation (if applicable)
    │
    ▼
Submit All → POST /api/final-assessment/:id/submit
    │
    ▼
"Internship Completed" celebration screen
Faculty notified via push + dashboard update
```

---

## 7. Faculty Dashboard Flow

```
Faculty Login
    │
    ▼
Faculty Dashboard — Summary Cards:
    ├── Active Internships: 48
    ├── Missing Today's Log: 12
    ├── Pending Document Review: 5
    ├── Pending Approval: 3
    └── Evaluations Outstanding: 7
    │
    ▼
Tap "Missing Today's Log"
    │
    ▼
Student list (sorted by last submission)
    │
    ▼
Tap student → Student Detail View:
    ├── Overview tab (internship summary, progress ring)
    ├── Attendance tab (calendar heatmap)
    ├── Work Logs tab (daily cards, searchable)
    ├── Weekly Reports tab
    ├── Documents tab (checklist with verify/reject)
    ├── Mentor Evaluation tab
    └── Final Assessment tab
    │
    ▼
Evidence Export:
    └── Tap "Export Evidence Package" → PDF or ZIP
        POST /api/reports/export
        (async; progress indicator; download when ready)
```

---

## 8. Evidence Package Content

Student-wise package:
1. Registration & internship details
2. Attendance calendar + summary (percentage, total hours)
3. All daily work logs (chronological)
4. All weekly reports
5. Mentor evaluation
6. Final assessment + skill ratings
7. All uploaded certificates/documents

Aggregate package (NBA-ready):
- A. Planning: objectives, org list, student allocation, schedule
- B. Participation: student-wise attendance, headcount, duration, total hours
- C. Activities: daily logs, weekly summaries, technologies, tasks
- D. Assessment: mentor evaluation aggregate, faculty evaluation, post-assessment
- E. Impact Analysis: pre/post skill ratings, student feedback, mentor feedback, learning outcomes
- F. Documentary Evidence: offer letters, completion certificates, reports, photos
