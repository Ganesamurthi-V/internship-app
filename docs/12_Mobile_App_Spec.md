# Mobile App Specification — React Native (iOS + Android)

> **New document** | Single codebase cross-platform mobile app

---

## 1. Overview

The Internship Management System mobile app is built with **React Native + Expo** — one codebase that produces:
- An **iOS app** (.ipa, distributed via App Store or TestFlight)
- An **Android app** (.apk / .aab, distributed via Play Store or direct install)

No separate iOS/Android teams needed. One JavaScript/TypeScript codebase shared 100% for business logic and ~90% for UI.

---

## 2. Screen Inventory

### Auth Screens
| Screen | File | Description |
|---|---|---|
| Login | `app/(auth)/login.tsx` | Email + password, biometric option |
| Forgot Password | `app/(auth)/forgot-password.tsx` | Email input → reset link |
| Reset Password | `app/(auth)/reset-password.tsx` | New password form |

### Student Screens
| Screen | File | Description |
|---|---|---|
| Dashboard | `app/(student)/dashboard.tsx` | Today's checklist, internship summary, quick actions |
| Internship Register | `app/(student)/internship/register.tsx` | 3-step wizard |
| Internship View | `app/(student)/internship/view.tsx` | Approved internship details |
| Documents | `app/(student)/internship/documents.tsx` | Upload checklist |
| Attendance Today | `app/(student)/attendance/today.tsx` | Daily attendance form |
| Attendance History | `app/(student)/attendance/history.tsx` | Calendar heatmap + list |
| Work Log Today | `app/(student)/work-log/today.tsx` | Daily work log form |
| Work Log History | `app/(student)/work-log/history.tsx` | Scrollable log cards |
| Weekly Reports | `app/(student)/weekly-report/list.tsx` | Timeline of reports |
| Weekly Report Form | `app/(student)/weekly-report/[week].tsx` | Submit/edit weekly report |
| Final Assessment | `app/(student)/final-assessment/index.tsx` | Part 1: completion details |
| Skill Ratings | `app/(student)/final-assessment/skill-ratings.tsx` | Part 2: 8 sliders |
| Final Docs | `app/(student)/final-assessment/documents.tsx` | Part 3: document checklist |
| Profile | `app/(student)/profile.tsx` | View/edit personal info |

### Faculty Screens
| Screen | File | Description |
|---|---|---|
| Dashboard | `app/(faculty)/dashboard.tsx` | Summary cards, alerts |
| Student List | `app/(faculty)/students/index.tsx` | Search + filter |
| Student Detail | `app/(faculty)/students/[id]/overview.tsx` | Tabbed detail view |
| Attendance Tab | `app/(faculty)/students/[id]/attendance.tsx` | Calendar + stats |
| Logs Tab | `app/(faculty)/students/[id]/work-logs.tsx` | Daily log cards |
| Docs Tab | `app/(faculty)/students/[id]/documents.tsx` | Verify/reject |
| Evidence Export | `app/(faculty)/evidence/export.tsx` | Generate + download |

### Mentor Screens
| Screen | File | Description |
|---|---|---|
| Dashboard | `app/(mentor)/dashboard.tsx` | Assigned students summary |
| Student List | `app/(mentor)/students/index.tsx` | Assigned students |
| Verify Attendance | `app/(mentor)/students/[id]/attendance.tsx` | Toggle verification |
| Review Logs | `app/(mentor)/students/[id]/work-logs.tsx` | Read-only log view |
| Evaluation Form | `app/(mentor)/evaluation/[internshipId].tsx` | 10 ratings + text + confirm |

---

## 3. Key Component Library

```
components/
├── forms/
│   ├── AttendanceForm.tsx           # Status chips, time pickers, optional upload
│   ├── WorkLogForm.tsx              # Textareas with counters, tag input, chips
│   ├── WeeklyReportForm.tsx         # Pre-populated hours, tags, PDF upload
│   ├── FinalAssessmentForm.tsx      # Multi-step with skill sliders
│   └── MentorEvaluationForm.tsx     # 10 rating sliders + text + confirm
├── ui/
│   ├── WordCounter.tsx              # Live word count display
│   ├── TagInput.tsx                 # Add/remove technology tags
│   ├── RatingSlider.tsx             # 1–5 slider with labels
│   ├── DocumentPicker.tsx           # Camera + file picker combo
│   ├── CalendarHeatmap.tsx          # Attendance calendar
│   ├── ProgressRing.tsx             # Attendance % ring
│   ├── OfflineBanner.tsx            # "Offline — syncing..." banner
│   ├── SyncBadge.tsx                # "Pending Sync (N)" badge
│   └── UploadProgress.tsx           # File upload progress bar
└── shared/
    ├── Screen.tsx                   # Safe area + scroll wrapper
    ├── Header.tsx                   # Screen header with back button
    └── EmptyState.tsx               # Illustration + CTA for empty lists
```

---

## 4. State Management

### Zustand Stores

```typescript
// stores/authStore.ts
interface AuthStore {
  user: User | null;
  accessToken: string | null;
  isAuthenticated: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
  refreshToken: () => Promise<void>;
}

// stores/syncStore.ts
interface SyncStore {
  pendingCount: number;
  isSyncing: boolean;
  lastSyncAt: Date | null;
  triggerSync: () => Promise<void>;
}

// stores/notificationStore.ts
interface NotificationStore {
  unreadCount: number;
  notifications: Notification[];
  markRead: (id: string) => void;
}
```

### React Query Keys

```typescript
export const queryKeys = {
  student: {
    me: ['student', 'me'],
    internship: (studentId: string) => ['internship', studentId],
    attendance: (internshipId: string, from: string, to: string) =>
      ['attendance', internshipId, from, to],
    attendanceSummary: (internshipId: string) => ['attendance', 'summary', internshipId],
    workLog: (internshipId: string, date: string) => ['work-log', internshipId, date],
    weeklyReports: (internshipId: string) => ['weekly-reports', internshipId],
    currentWeek: (internshipId: string) => ['weekly-reports', 'current', internshipId],
    finalAssessment: (internshipId: string) => ['final-assessment', internshipId],
  },
  faculty: {
    students: (filters: object) => ['faculty', 'students', filters],
    student: (studentId: string) => ['faculty', 'student', studentId],
  },
  mentor: {
    students: ['mentor', 'students'],
    evaluation: (internshipId: string) => ['mentor', 'evaluation', internshipId],
  },
};
```

---

## 5. WatermelonDB Schema (Local SQLite)

```typescript
// lib/db/schema.ts
import { appSchema, tableSchema } from '@nozbe/watermelondb';

export const schema = appSchema({
  version: 1,
  tables: [
    tableSchema({
      name: 'attendance_drafts',
      columns: [
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'internship_id', type: 'string', isIndexed: true },
        { name: 'attendance_date', type: 'string', isIndexed: true },
        { name: 'status', type: 'string' },
        { name: 'reporting_time', type: 'string', isOptional: true },
        { name: 'leaving_time', type: 'string', isOptional: true },
        { name: 'mode', type: 'string', isOptional: true },
        { name: 'leave_reason', type: 'string', isOptional: true },
        { name: 'sync_status', type: 'string' }, // 'pending' | 'synced' | 'error'
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
    tableSchema({
      name: 'work_log_drafts',
      columns: [
        { name: 'client_id', type: 'string', isIndexed: true },
        { name: 'internship_id', type: 'string', isIndexed: true },
        { name: 'work_date', type: 'string', isIndexed: true },
        { name: 'activities', type: 'string' },
        { name: 'technologies', type: 'string' }, // JSON array stored as string
        { name: 'task_assigned', type: 'string', isOptional: true },
        { name: 'completion_status', type: 'string', isOptional: true },
        { name: 'learning', type: 'string', isOptional: true },
        { name: 'challenge', type: 'string', isOptional: true },
        { name: 'solution', type: 'string', isOptional: true },
        { name: 'deliverable_type', type: 'string', isOptional: true },
        { name: 'mentor_interaction', type: 'boolean' },
        { name: 'mentor_feedback', type: 'string', isOptional: true },
        { name: 'sync_status', type: 'string' },
        { name: 'server_id', type: 'string', isOptional: true },
        { name: 'created_at', type: 'number' },
      ],
    }),
  ],
});
```

---

## 6. Offline Sync Engine

```typescript
// lib/sync/syncEngine.ts
import NetInfo from '@react-native-community/netinfo';

export class SyncEngine {
  private isRunning = false;

  async start() {
    NetInfo.addEventListener(state => {
      if (state.isConnected && !this.isRunning) {
        this.runSync();
      }
    });
  }

  async runSync() {
    this.isRunning = true;
    try {
      const pendingAttendance = await AttendanceDraft
        .query(Q.where('sync_status', 'pending'))
        .fetch();
      
      const pendingWorkLogs = await WorkLogDraft
        .query(Q.where('sync_status', 'pending'))
        .fetch();

      const response = await api.post('/sync', {
        attendance: pendingAttendance.map(toApiShape),
        workLogs: pendingWorkLogs.map(toApiShape),
      });

      await db.write(async () => {
        for (const result of response.attendance) {
          const draft = pendingAttendance.find(d => d.clientId === result.clientId);
          await draft?.update(d => {
            d.syncStatus = result.status === 'error' ? 'error' : 'synced';
            d.serverId = result.serverId ?? d.serverId;
          });
        }
        // same for workLogs
      });

    } finally {
      this.isRunning = false;
    }
  }
}
```

---

## 7. Push Notification Setup

### Expo Configuration (app.json)
```json
{
  "expo": {
    "name": "Internship Manager",
    "slug": "internship-manager",
    "version": "1.0.0",
    "ios": {
      "bundleIdentifier": "edu.your-institution.internship",
      "supportsTablet": true,
      "infoPlist": {
        "NSCameraUsageDescription": "Used to scan and upload internship documents.",
        "NSPhotoLibraryUsageDescription": "Used to upload internship documents from your gallery.",
        "NSFaceIDUsageDescription": "Used to secure app access with Face ID."
      }
    },
    "android": {
      "package": "edu.your_institution.internship",
      "googleServicesFile": "./google-services.json",
      "permissions": [
        "CAMERA",
        "READ_EXTERNAL_STORAGE",
        "WRITE_EXTERNAL_STORAGE",
        "RECEIVE_BOOT_COMPLETED",
        "USE_BIOMETRIC",
        "USE_FINGERPRINT"
      ]
    },
    "plugins": [
      "expo-router",
      "expo-secure-store",
      ["expo-local-authentication", {
        "faceIDPermission": "Used to secure your app access."
      }],
      ["expo-notifications", {
        "icon": "./assets/notification-icon.png",
        "color": "#1e3a5f"
      }]
    ]
  }
}
```

### Server-side Push
```typescript
// backend/src/notifications/push.service.ts
async function sendPushNotification(expoPushToken: string, title: string, body: string, data?: object) {
  await fetch('https://exp.host/--/api/v2/push/send', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      to: expoPushToken,
      title,
      body,
      data,
      sound: 'default',
      priority: 'high',
    }),
  });
}

// Usage: missing submission reminder
await sendPushNotification(
  token,
  'Daily Log Missing',
  "Don't forget to submit today's attendance and work log.",
  { screen: '/(student)/attendance/today' }
);
```

---

## 8. EAS Build Configuration

```json
// eas.json
{
  "cli": { "version": ">= 7.0.0" },
  "build": {
    "development": {
      "developmentClient": true,
      "distribution": "internal",
      "env": { "APP_ENV": "development" }
    },
    "preview": {
      "distribution": "internal",
      "android": { "buildType": "apk" },
      "env": { "APP_ENV": "staging" }
    },
    "production": {
      "autoIncrement": true,
      "env": { "APP_ENV": "production" }
    }
  },
  "submit": {
    "production": {
      "ios": {
        "appleId": "your-apple-id@example.com",
        "ascAppId": "XXXXXXXXXX"
      },
      "android": {
        "serviceAccountKeyPath": "./google-play-key.json",
        "track": "internal"
      }
    }
  }
}
```

---

## 9. Accessibility Checklist

- [ ] All `<TouchableOpacity>` and `<Pressable>` have `accessibilityLabel` and `accessibilityRole`.
- [ ] All `<TextInput>` have `accessibilityLabel`.
- [ ] All error messages are announced via `AccessibilityInfo.announceForAccessibility`.
- [ ] Rating sliders have `accessibilityValue` with current rating.
- [ ] Loading states announced via `aria-busy` / `accessibilityState={{ busy: true }}`.
- [ ] Colour contrast ≥ 4.5:1 on all text.
- [ ] Minimum touch target 44×44 pt (iOS) / 48×48 dp (Android).
- [ ] Dynamic Type: wrap fonts in `useFontScale()` hook.
- [ ] Tested with VoiceOver (iOS) and TalkBack (Android).

---

## 10. App Store / Play Store Preparation

### iOS (App Store)
- Privacy policy URL required (covers camera, photos, biometrics, push).
- App category: Education.
- Age rating: 4+ (no mature content).
- In-app purchases: None.
- Encryption: uses standard iOS cryptography (Keychain) — answer Yes to export compliance, select standard encryption.

### Android (Google Play)
- Target API: 34 (Android 14) — required from August 2024.
- Permissions declared in `AndroidManifest.xml` via Expo config.
- Privacy policy URL required.
- Data safety form: declare camera, files, and push notification data usage.
- App category: Education.

---

## 11. Version Strategy

```
Major.Minor.Patch  (e.g., 1.2.3)
│      │     └── Bug fixes (OTA update — no store review)
│      └──────── New features (OTA or store update depending on native changes)
└─────────────── Breaking changes or new native modules (store review required)
```

Use `eas update` for Patch and Minor releases without native changes.
Use `eas build` + store submission for Major releases or any native module additions.
