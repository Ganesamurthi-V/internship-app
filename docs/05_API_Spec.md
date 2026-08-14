# API Specification — Enhanced for Mobile App

> **Version 2.0** | REST JSON API consumed by React Native mobile app

---

## Base

```
Base URL:  https://api.your-institution.edu/api
Auth:      Bearer <access_token>  (JWT, 15-min TTL)
Content:   application/json
Versioning: /api/v1/ (add when breaking changes needed)
```

All protected endpoints require `Authorization: Bearer <token>` header.
Server validates role + ownership on every request.

---

## Authentication

```
POST   /api/auth/login
POST   /api/auth/refresh
POST   /api/auth/logout
GET    /api/auth/me
POST   /api/auth/forgot-password
POST   /api/auth/reset-password
```

### POST /api/auth/login
```json
Request:
{
  "email": "student@smvec.ac.in",
  "password": "secret"
}

Response 200:
{
  "accessToken": "eyJ...",
  "refreshToken": "rt_...",
  "expiresIn": 900,
  "user": {
    "id": "uuid",
    "email": "...",
    "role": "student",
    "name": "..."
  }
}
```

### POST /api/auth/refresh
```json
Request:  { "refreshToken": "rt_..." }
Response: { "accessToken": "eyJ...", "expiresIn": 900 }
```

---

## Device Tokens (Push Notifications)

```
POST   /api/device-tokens          — register Expo push token
DELETE /api/device-tokens/:token   — unregister on logout
```

### POST /api/device-tokens
```json
{
  "expoPushToken": "ExponentPushToken[...]",
  "platform": "android",
  "appVersion": "1.2.0"
}
```

---

## Students

```
GET    /api/students/me
PATCH  /api/students/me
GET    /api/students/:id          — faculty/admin only
GET    /api/students              — faculty/admin only (paginated)
```

---

## Internships

```
POST   /api/internships
GET    /api/internships/me        — student's own internship
GET    /api/internships/:id
PATCH  /api/internships/:id
POST   /api/internships/:id/submit
POST   /api/internships/:id/approve    — faculty only
POST   /api/internships/:id/reject     — faculty only
```

### POST /api/internships
```json
{
  "organisationId": "uuid-or-null",
  "organisationName": "Iinvsys Technologies",
  "organisationLocation": "Puducherry",
  "mentorName": "Raj Kumar",
  "mentorDesignation": "Senior Engineer",
  "mentorEmail": "raj@iinvsys.com",
  "mentorContact": "9876543210",
  "domain": "software_development",
  "mode": "offline",
  "startDate": "2026-06-01",
  "endDate": "2026-07-31",
  "workingHoursPerDay": 8,
  "facultyCoordinatorId": "uuid"
}
```

---

## Attendance

```
POST   /api/attendance
GET    /api/attendance?internshipId=&from=&to=
PATCH  /api/attendance/:id
POST   /api/attendance/:id/verify    — mentor/faculty only
GET    /api/attendance/summary?internshipId=
```

### POST /api/attendance
```json
{
  "internshipId": "uuid",
  "date": "2026-08-14",
  "status": "present",
  "reportingTime": "09:00",
  "leavingTime": "17:30",
  "mode": "office",
  "leaveReason": null,
  "proofDocumentId": null,
  "clientId": "device-generated-uuid"    ← idempotency key for offline sync
}
```

### GET /api/attendance/summary
```json
Response:
{
  "totalWorkingDays": 45,
  "daysAttended": 42,
  "daysAbsent": 1,
  "daysLeave": 1,
  "holidays": 1,
  "attendancePercentage": 93.3,
  "totalHours": 336.0
}
```

---

## Daily Work Logs

```
POST   /api/work-logs
GET    /api/work-logs?internshipId=&from=&to=
GET    /api/work-logs/:id
PATCH  /api/work-logs/:id
POST   /api/work-logs/:id/submit
```

### POST /api/work-logs
```json
{
  "internshipId": "uuid",
  "workDate": "2026-08-14",
  "activities": "Implemented JWT refresh token rotation in the Flask API...",
  "technologies": ["Python", "Flask", "JWT", "PostgreSQL"],
  "taskAssigned": "Implement secure authentication",
  "completionStatus": "yes",
  "learning": "Learned about token rotation and secure cookie storage...",
  "challenge": "Handling concurrent refresh token requests",
  "solution": "Added Redis-based token locking",
  "deliverableType": "code",
  "evidenceDocumentId": null,
  "mentorInteraction": true,
  "mentorFeedback": "Good implementation, suggested adding rate limiting",
  "clientId": "device-generated-uuid"
}
```

---

## Batch Sync (Offline)  ← NEW

```
POST   /api/sync
```

### POST /api/sync
Accepts batched offline records in one request.

```json
Request:
{
  "attendance": [
    { "clientId": "uuid1", ...attendance fields... },
    { "clientId": "uuid2", ...attendance fields... }
  ],
  "workLogs": [
    { "clientId": "uuid3", ...work log fields... }
  ]
}

Response 200:
{
  "attendance": [
    { "clientId": "uuid1", "serverId": "uuid-a", "status": "created" },
    { "clientId": "uuid2", "serverId": null, "status": "duplicate", "existingId": "uuid-b" }
  ],
  "workLogs": [
    { "clientId": "uuid3", "serverId": "uuid-c", "status": "created" }
  ]
}
```

Possible statuses: `created`, `updated`, `duplicate`, `error`.

---

## Weekly Reports

```
POST   /api/weekly-reports
GET    /api/weekly-reports?internshipId=
GET    /api/weekly-reports/:id
PATCH  /api/weekly-reports/:id
POST   /api/weekly-reports/:id/submit
GET    /api/weekly-reports/current?internshipId=    ← returns current week number + pre-aggregated hours
```

### GET /api/weekly-reports/current
```json
Response:
{
  "weekNumber": 5,
  "weekStartDate": "2026-08-10",
  "weekEndDate": "2026-08-16",
  "daysAttended": 4,
  "totalHours": 32.5,
  "reportExists": false
}
```

---

## Final Assessment

```
POST   /api/final-assessment
GET    /api/final-assessment?internshipId=
PATCH  /api/final-assessment/:id
POST   /api/final-assessment/:id/submit
POST   /api/final-assessment/:id/unlock    — faculty only (early access)
```

---

## Mentor Evaluation

```
GET    /api/mentor/students
POST   /api/mentor-evaluations
GET    /api/mentor-evaluations/:internshipId
PATCH  /api/mentor-evaluations/:id
POST   /api/mentor-evaluations/:id/submit
GET    /api/mentor/invite/:token            — public; validates invite token
```

---

## Documents

```
POST   /api/documents/upload-url         — returns presigned PUT URL
POST   /api/documents/complete           — confirm upload complete
GET    /api/documents/:id                — returns presigned GET URL (redirect)
DELETE /api/documents/:id
POST   /api/documents/:id/verify         — faculty only
POST   /api/documents/:id/reject         — faculty only
GET    /api/documents?internshipId=&type=
```

### POST /api/documents/upload-url
```json
Request:  { "filename": "offer_letter.pdf", "mimeType": "application/pdf", "sizeBytes": 524288, "documentType": "offer_letter" }
Response: { "uploadUrl": "https://...", "storageKey": "uuid/...", "expiresIn": 300 }
```

---

## Reports

```
GET    /api/reports/student/:studentId           — full student evidence summary
GET    /api/reports/attendance?internshipId=
GET    /api/reports/weekly-progress?internshipId=
GET    /api/reports/mentor-evaluation?internshipId=
GET    /api/reports/evidence?internshipId=
POST   /api/reports/export                       — async; returns job ID
GET    /api/reports/export/:jobId                — poll job status / download URL
```

---

## Notifications

```
GET    /api/notifications              — list for current user
PATCH  /api/notifications/:id/read
PATCH  /api/notifications/read-all
```

---

## Standard Response Shapes

### Success (single resource)
```json
{ "data": { ... } }
```

### Success (list)
```json
{
  "data": [ ... ],
  "pagination": { "page": 1, "pageSize": 20, "total": 143, "totalPages": 8 }
}
```

### Error
```json
{
  "error": {
    "code": "VALIDATION_ERROR",
    "message": "Invalid request",
    "fields": {
      "startDate": "Start date is required",
      "workingHoursPerDay": "Must be a positive number"
    }
  }
}
```

### Common error codes
| Code | HTTP | Meaning |
|---|---|---|
| `UNAUTHORIZED` | 401 | Missing or invalid token |
| `FORBIDDEN` | 403 | Valid token, insufficient permission |
| `NOT_FOUND` | 404 | Resource does not exist |
| `CONFLICT` | 409 | Duplicate record (same date) |
| `VALIDATION_ERROR` | 422 | Request body failed validation |
| `RATE_LIMITED` | 429 | Too many requests |
| `SERVER_ERROR` | 500 | Unexpected internal error |

---

## Authorization Matrix

| Endpoint group | Student | Mentor | Faculty | Admin |
|---|---|---|---|---|
| `/api/students/me` | RW | — | — | — |
| `/api/students/:id` | — | — | R | RW |
| `/api/internships/me` | RW | — | — | — |
| `/api/internships/:id` | R own | R assigned | RW scoped | RW |
| `/api/attendance` | RW own | R/Verify assigned | RW scoped | RW |
| `/api/work-logs` | RW own | R assigned | RW scoped | RW |
| `/api/weekly-reports` | RW own | R assigned | RW scoped | RW |
| `/api/final-assessment` | RW own | — | R/Unlock | RW |
| `/api/mentor-evaluations` | R own | RW assigned | R scoped | RW |
| `/api/documents` | RW own | R assigned | RW scoped | RW |
| `/api/reports` | Own | Assigned | Scoped | All |
| `/api/sync` | W own | — | — | — |
| `/api/device-tokens` | RW own | RW own | RW own | RW |
