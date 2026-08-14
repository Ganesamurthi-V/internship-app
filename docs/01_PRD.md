# Internship Management System — Product Requirements Document (Enhanced)

> **Version 2.0** | Enhanced for Cross-Platform Mobile App (iOS + Android) using React Native

---

## 1. Product Overview

A **cross-platform mobile-first Internship Management System** for colleges to collect, monitor, assess, and produce evidence for student internships. The system is built as a **single React Native codebase** that runs on both iOS and Android, sharing 100% of business logic and ~90% of UI.

The source guide defines three primary student workflows:
1. **Internship Registration** — once per internship
2. **Daily Internship Attendance & Work Log** — every working day
3. **Final Internship Assessment & Feedback** — at internship completion

The system maintains a master student record keyed by Register Number and generates evidence suitable for institutional/NBA review.

---

## 2. Goals

- Centralize all internship records in one mobile app usable on any phone.
- Eliminate repeated entry of student/internship information.
- Enable daily attendance and work-log submission from a mobile device.
- Capture daily work, technologies, tasks, challenges, learning, deliverables, and mentor interaction.
- Support weekly progress reporting with automatic hour aggregation.
- Collect final learning/outcome information and skill self-ratings.
- Collect industry mentor evaluation via secure invite link.
- Store documentary evidence (PDFs, photos) uploaded from phone.
- Generate student-wise and aggregate evidence reports exportable as PDF.
- Support **offline-first operation** — students can fill forms without internet; data syncs when connectivity returns.

---

## 3. Users

| Role | Platform | Primary Actions |
|---|---|---|
| Student | Mobile (iOS/Android) | Register, daily log, weekly report, final assessment, document upload |
| Faculty Coordinator | Mobile + Web | Review students, approve, download reports |
| Industry Mentor | Mobile or Web link | Verify attendance, review logs, submit evaluation |
| Department/Admin | Web (mobile-accessible) | Manage users, orgs, settings, export evidence |

---

## 4. Functional Scope

### 4.1 Registration (Once)
- Student personal and academic details
- Organisation details and location
- Internship domain (Software Development, Data Science/AI/ML, Cyber Security, Cloud Computing, Networking, Web Development, Business/Management, Other)
- Mode: Offline / Online / Hybrid
- Start and end dates, duration, working hours per day
- Industry mentor details (name, designation, email/contact)
- Faculty coordinator assignment
- Upload: Offer/Confirmation Letter (PDF from phone gallery or camera scan)
- Upload: Joining Proof (PDF/image)

### 4.2 Daily Attendance
- Internship date (auto-filled with today)
- Attendance status: Present, Absent, Permission/Leave, Holiday, Weekly Off
- Reporting time and leaving time (time picker)
- Total hours (auto-calculated)
- Attendance mode: Office / Online / Hybrid
- Optional attendance proof upload (photo/screenshot)
- Leave reason (if absent)
- Mentor verification flag

> **Design rule (from source guide):** Proof upload must remain optional. Do not block submission if proof is unavailable.

### 4.3 Daily Work Log
- Activities performed (150–200 word text input with live counter)
- Technologies/tools used (multi-tag input: Java, Python, SQL, Git, AWS, React, etc.)
- Task assigned today
- Task completion status: Yes / Partially / No
- Key learning (max 100 words with live counter)
- Problem/challenge faced
- Solution/approach taken
- Output/deliverable type: Code / Documentation / Design / Analysis / Testing / Presentation / Other
- Evidence upload (photo/screenshot, optional, organisation-permitting)
- Industry mentor interaction today: Yes / No
- Mentor feedback/remarks (short text)

### 4.4 Weekly Review
- Week number (auto-detected from internship dates)
- Week start and end dates (auto-filled)
- Days attended (auto-aggregated from attendance)
- Total hours (auto-aggregated)
- Major activities completed
- Technologies/tools learned
- Skills developed
- Major task/assignment completed
- Problems encountered
- Solutions/approach
- Key learning outcomes
- Industry mentor feedback
- Student self-assessment
- Upload weekly PDF report

### 4.5 Final Assessment (End of Internship)
- Internship completed successfully? Yes / No
- Total days attended and total hours (auto-filled)
- Major project/task completed
- Technologies mastered (tags)
- Skills developed
- Internship objectives achieved: Fully / Partially / No
- Usefulness rating 1–5
- Technical skill improvement (free text)
- Employability improvement (free text)
- Curriculum relationship (free text)
- Real-world engineering exposure (free text)
- Recommend organisation: Yes / No
- Suggestions for programme improvement

### 4.6 Learning & Outcome Ratings (Self-Assessment)
Student rates themselves 1–5 on:
- Technical knowledge
- Problem solving
- Communication
- Teamwork
- Time management
- Professional discipline
- Adaptability
- Industry awareness

### 4.7 Mentor Evaluation
- Ratings 1–5 on: Technical knowledge, Problem-solving, Communication, Teamwork, Professional behaviour, Punctuality/attendance, Ability to learn, Initiative, Quality of work, Overall performance
- Major strengths (free text)
- Areas for improvement (free text)
- Overall remarks
- Employment recommendation: Yes / No
- Mentor name, designation, organisation, date
- Digital confirmation (OTP or checkbox)

### 4.8 Final Documents Upload
Students upload from phone:
- Internship Completion Certificate
- Internship Report
- Project Report (if applicable)
- Offer/Joining Letter
- Attendance Certificate/Statement
- Mentor Evaluation (if separate doc)
- Final Presentation (if applicable)
- Any permitted evidence of project/work

> **Privacy rule:** Do not request confidential company information or proprietary source code.

---

## 5. Mobile-Specific Features

### 5.1 Offline Support
- Daily attendance and work logs can be drafted offline.
- Offline queue shown in a "Pending Sync" banner.
- Automatic sync when internet resumes.
- Conflict resolution: last-write-wins per record with timestamp.

### 5.2 Push Notifications
- Missing daily submission reminder (configurable time).
- Weekly report due reminder (Sunday evening).
- Final assessment reminder (3 days before internship end).
- Mentor evaluation request.
- Faculty approval status update.
- Document rejection/correction request.

### 5.3 Document Capture
- Camera integration: scan offer letters/certificates directly in-app.
- PDF generation from image scans.
- File picker for existing documents.
- Progress bar for file uploads.

### 5.4 Biometric / Device Auth
- App lock with Face ID / Touch ID / device PIN.
- Persistent login with secure token storage (Keychain/Keystore).

---

## 6. Non-Goals

- Do not require daily proof uploads when the organisation does not provide reliable proof.
- Do not collect confidential company information or proprietary source code.
- Do not replace an organisation's official attendance system.
- Do not build a separate iOS and Android codebase — single React Native codebase only.

---

## 7. Success Metrics

- >95% student records complete before internship start.
- Daily submission rate visible in faculty dashboard.
- Attendance percentage and total hours calculated automatically (not manual entry).
- Faculty can retrieve complete student evidence without manual spreadsheet consolidation.
- Final evidence package can be exported by student, department, organisation, and internship period.
- App installs and runs on iOS 15+ and Android 11+ from a single codebase.

---

## 8. Source Basis

This PRD is derived from the uploaded internship app guide (DOCX) and the original 11-document technical package. Mobile app architecture, offline sync, push notifications, and device auth are engineering proposals added during the mobile enhancement pass. Product flows map directly to the source guide's three-form recommendation: Registration → Daily Log → Final Assessment.
