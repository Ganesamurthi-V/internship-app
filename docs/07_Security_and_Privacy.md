# Security, Privacy & Compliance Baseline — Mobile App Enhanced

> **Version 2.0** | Additional mobile-specific security controls

---

## 1. Data Classification

### Sensitive (highest protection)
- Student contact details (email, mobile)
- Academic identifiers (register number, programme, section)
- Internship documents (offer letters, certificates)
- Mentor contact details
- Attendance records
- Evaluation records (mentor ratings, self-ratings)

### Potentially Confidential (organisational)
- Work evidence (screenshots, deliverables)
- Project reports
- Organisation-provided documents

### Source guide rule
> Do not collect confidential company information or proprietary source code. Any uploaded evidence must be organisation-permitted.

---

## 2. Access Control Matrix

| Resource | Student | Mentor | Faculty | Admin |
|---|---|---|---|---|
| Own profile | RW | — | R | RW |
| Own internship | RW | R | RW | RW |
| Own attendance | RW | R/Verify | RW | RW |
| Own work log | RW | R/Review | RW | RW |
| Own weekly report | RW | R | RW | RW |
| Mentor evaluation | R | RW own | R | RW |
| Documents | RW own | R assigned | RW scoped | RW |
| Reports | Own | Assigned | Scoped | All |
| Audit logs | — | — | R scoped | R |
| Device tokens | Own | Own | Own | RW |
| Push notifications | Own | Own | Own | All |

**All authorization enforced server-side.** UI hiding is cosmetic only; API always validates.

---

## 3. Mobile-Specific Security

### 3.1 Token Storage
- Access token and refresh token stored in **`expo-secure-store`** (iOS Keychain / Android Keystore).
- Never stored in AsyncStorage (plaintext) or Redux/Zustand without secure-store backing.
- Tokens wiped on logout and on uninstall (Keychain) / app data clear (Keystore).

### 3.2 Biometric / App Lock
- Optional biometric lock (Face ID / Touch ID / fingerprint) for app re-entry.
- App does not re-send credentials; biometric success unlocks locally stored token only.
- Falls back to device PIN/password if biometrics unavailable.

### 3.3 Network Security
- All API calls over HTTPS/TLS 1.2+.
- Certificate pinning (optional, high-security deployments): pin to institution domain certificate.
- `expo-build-properties` with `NSAllowsArbitraryLoads: false` (iOS) to block plain HTTP.
- Android `network_security_config.xml` set to `cleartextTrafficPermitted: false`.

### 3.4 Offline Data Security
- WatermelonDB/SQLite database encrypted using SQLCipher (via `@nozbe/watermelondb` with encryption plugin).
- Encryption key derived from user credentials + device key; not hardcoded.
- Offline queue does not store passwords, tokens, or raw document bytes longer than needed for upload.

### 3.5 Jailbreak/Root Detection (Optional)
- Use `expo-device` checks or a dedicated library for high-security deployments.
- If jailbreak/root detected: warn user, optionally restrict document download to on-device only.

### 3.6 Screenshot Prevention (Optional)
- Android: `FLAG_SECURE` via `expo-screen-capture` disables screenshot on sensitive screens (student profile, mentor evaluation).
- iOS: screen recording detection; blur overlay when app enters background.

---

## 4. File Security

- Private S3/MinIO bucket — no public access.
- Upload: presigned PUT URL (5-min TTL); client uploads directly — no file bytes pass through API server.
- Download: presigned GET URL (15-min TTL) returned by API — never expose raw storage credentials.
- File types allowed: PDF, JPG, PNG, HEIC only.
- File size limit: 10 MB per file.
- Storage key: random UUID — not derived from filename or student ID.
- MIME type validated on both client (before upload request) and server (before generating presigned URL).
- HEIC converted to JPEG client-side before upload.
- Optional: run uploaded files through antivirus/malware scan on server-side arrival.
- Never execute uploaded files.
- Deleted document: storage key marked `deleted`; S3 object deleted asynchronously; presigned URLs for that key will 404.

---

## 5. Authentication Security

- Password minimum: 8 characters, at least 1 uppercase, 1 number.
- bcrypt hashing with cost factor ≥ 12 (or argon2id).
- Login rate limit: 10 attempts per 15 minutes per IP + per email.
- Account lockout after 10 failed attempts; unlock via email.
- Refresh token rotation: every refresh issues a new refresh token; old one revoked.
- Token family invalidation on theft detection (refresh token reuse = compromise signal → revoke all sessions).
- Password reset: time-limited token (1 hour) sent to verified email only.
- MFA available for faculty and admin roles.

---

## 6. API Security

- Every request: validate schema (Zod), check authentication (JWT), check authorization (role + ownership).
- Never trust `userId`, `studentId`, `role` fields supplied by client — always derive from JWT subject.
- Parameterized queries via Prisma (no raw string concatenation in SQL).
- Rate limits:
  - Auth endpoints: 10/min per IP
  - Upload URL generation: 30/min per user
  - Report export: 5/min per user
  - General API: 200/min per user
- CORS: allow only app's registered origins; React Native uses `expo://` deep link origin.
- Input sanitization: strip control characters from free-text fields.
- Sensitive fields (password_hash, storage_key) never returned in API responses.

---

## 7. Push Notification Security

- Expo push tokens are user-specific and device-specific.
- Notification payload: never include sensitive data in the notification body (only "You have a pending submission" — not student name or record details).
- Full data fetched on app open via authenticated API.
- Tokens revoked on logout: `DELETE /api/device-tokens/:token`.

---

## 8. Privacy

- Collect only fields required by the internship process (source guide-aligned).
- Each role sees only the minimum necessary personal information.
- Faculty sees student name/register number — not mobile number unless needed.
- Mentor sees only assigned students.
- Define retention/deletion policy with the institution before go-live.
- Students may not request their own data deletion during an active internship (NBA evidence requirement).
- After internship period, data retention is institution-defined (recommend 5 years for NBA purposes).
- Do not expose student information through public URLs or unauthenticated endpoints.

---

## 9. Audit Events

All of the following must produce an `audit_logs` record:

| Event | Sensitivity |
|---|---|
| Login (success + failure) | Medium |
| Role change | High |
| Internship approval/rejection | High |
| Attendance edit (post-submission) | Medium |
| Mentor evaluation submit/edit | High |
| Document verification/rejection | Medium |
| Final assessment reopening | High |
| Report export | Medium |
| Document delete | High |
| Admin settings change | High |
| Refresh token reuse (theft signal) | Critical |
