# Test Plan — Mobile App Enhanced

> **Version 2.0** | Covers mobile-specific testing in addition to original API/unit tests

---

## 1. Unit Tests (Vitest / Jest)

### Business Logic
- Internship duration calculation (calendar days vs working days).
- Attendance hour calculation from reporting/leaving time.
- Attendance percentage calculation from status counts.
- Week number derivation from internship start date.
- Word count enforcement (200 words activities, 100 words learning).
- Rating validation (integer 1–5).
- Role permission functions.
- Document type/size validation.
- Date validation (start ≤ end, within internship period).
- Offline queue ordering (FIFO, idempotent by clientId).

### Validation Schemas (Zod)
- All Zod schemas have unit tests covering valid and invalid inputs.
- Shared schemas imported by both backend and mobile app.

---

## 2. Integration Tests

- Registration → database → internship record created.
- Faculty approval → student status updated → push notification queued.
- Attendance POST → total_hours auto-calculated → summary endpoint returns correct percentage.
- Work log → mentor_interaction flag → mentor sees in review.
- Weekly aggregation → days/hours match attendance records exactly.
- Final assessment → skill_ratings rows created.
- Mentor evaluation → locked after digital confirmation.
- Document upload-url → S3 presigned URL → complete → metadata stored.
- Batch sync → 5 offline attendance records → all land with correct clientIds → duplicates handled.
- Push notification → FCM/APNs delivery confirmed (sandbox).

---

## 3. Authorization Tests

Verify that:
- Student A cannot read Student B's attendance, work logs, or assessment.
- Student cannot access faculty or mentor endpoints.
- Mentor cannot evaluate a student not assigned to them.
- Mentor cannot approve internships.
- Faculty cannot access records outside their department scope.
- Unauthenticated requests to all private endpoints return 401.
- Expired access token returns 401; valid refresh token returns new access token.
- Revoked refresh token returns 401 and does not issue new token.
- Direct object reference bypass: GET /api/attendance/:id with another student's ID returns 403.
- Batch sync: clientIds from another student's device are rejected.

---

## 4. Mobile-Specific Tests

### Device Tests (run on real devices: iPhone + Android mid-range)
- App cold start < 2 seconds.
- Smooth list scrolling at 60 fps with 100+ attendance records.
- Time picker renders correctly on iOS 15, iOS 17, Android 11, Android 14.
- Date picker respects locale (DD/MM/YYYY for India).
- Camera integration: document scan produces readable PDF.
- File picker: selects and uploads PDF, JPG, PNG, HEIC.
- HEIC → JPEG conversion before upload.
- Push notification received in foreground and background.
- Push notification deep-links to correct screen on tap.
- Biometric lock prompts on app resume from background.
- expo-secure-store: token survives app restart; wiped on logout.

### Offline Tests
- Submit attendance with airplane mode ON → stored locally → no crash.
- Reconnect → sync triggers automatically → record appears on server.
- Submit duplicate attendance (same date, same student) while offline → only one record created on server.
- Submit 10 consecutive offline logs → all appear in correct order after sync.
- SQLite encryption: raw SQLite file cannot be read without decryption key.
- Background sync does not duplicate records already confirmed by server.

---

## 5. E2E Scenarios (Maestro or Detox)

Run on iOS Simulator + Android Emulator in CI:

1. **Student Registration:** login → complete profile → register internship (3 steps) → upload 2 documents → submit.
2. **Faculty Approval:** faculty login → see pending → approve → student receives push notification.
3. **Student Submits Attendance:** student login → mark present → enter times → submit → dashboard shows ✅.
4. **Offline Attendance:** airplane mode → mark attendance → reconnect → verify on server.
5. **Student Submits Work Log:** fill all fields (with word counters) → submit → faculty sees it.
6. **Weekly Report:** student sees current week auto-aggregated → fills report → uploads PDF → submits.
7. **Mentor Verifies Attendance:** mentor opens app → assigned student → toggle verify → confirmed.
8. **Mentor Submits Evaluation:** fill all 10 ratings + text fields → digital confirmation → immutable.
9. **Student Final Assessment:** 3-step form → skill ratings (8 sliders) → final documents upload → submit.
10. **Faculty Evidence Export:** select student → export evidence → PDF downloaded with all sections.
11. **Push Notification Flow:** miss daily log → receive reminder → tap notification → land on work log screen.

---

## 6. File Upload Tests

- Valid PDF (< 10 MB) accepted.
- Valid JPG/PNG/HEIC accepted.
- Unsupported type (`.exe`, `.zip`, `.docx`) rejected at client + server.
- Oversized file (> 10 MB) rejected at client before network call.
- Malicious filename (`../../../etc/passwd.pdf`) neutralised — storage key is UUID.
- Private file: presigned URL expires → 403 after TTL.
- Deleted document: GET after delete returns 404.
- Concurrent uploads: 3 documents simultaneously without race condition.

---

## 7. Performance Tests

- Faculty dashboard loads with 200 students in < 3 seconds.
- Attendance list (90 days) renders in < 1 second (WatermelonDB query).
- Batch sync of 30 offline records completes in < 15 seconds on 3G.
- PDF export generation (full student evidence) completes in < 10 seconds.
- PostgreSQL: attendance summary query (single student, 90 days) < 100 ms with indexes.

---

## 8. Accessibility Tests

- All screens pass iOS Accessibility Inspector.
- All interactive elements have `accessibilityLabel`.
- Minimum touch target 44×44 pts (iOS) / 48×48 dp (Android).
- Dynamic Type: text scales from "Large" to "Accessibility XXL" without overflow.
- Colour contrast ≥ 4.5:1 for all text (WCAG 2.1 AA).
- Screen reader: VoiceOver reads forms in logical order. TalkBack equivalent.

---

## 9. Acceptance Criteria

MVP is ready when:

1. A complete student internship lifecycle executes from registration through final evidence export without manual database editing.
2. The app installs and runs correctly on iOS 15+ and Android 11+ from a single React Native codebase.
3. Offline attendance and work logs sync correctly after connectivity is restored, with no duplicates.
4. Faculty can generate a student evidence package as a downloadable PDF.
5. No Authorization Test fails (student cannot read another student's data).
6. All E2E scenarios pass in CI on both iOS Simulator and Android Emulator.
