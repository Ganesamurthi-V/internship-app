# 12 — Mobile App Specification

## 1. Technology

| Component | Choice |
|-----------|--------|
| Framework | Expo SDK 57 |
| Runtime | React Native 0.86 (New Architecture) |
| Navigation | expo-router (file-based) |
| Server state | React Query (TanStack Query v5) |
| Client state | Zustand v5 |
| Forms | Controlled components + Zod validation |
| Styling | React Native StyleSheet + theme constants |

## 2. Navigation Structure

```
app/
├── _layout.tsx              # Root: auth gate + query provider
├── index.tsx                # Role-based redirect
├── (auth)/
│   ├── _layout.tsx          # Stack navigator
│   ├── login.tsx
│   └── forgot-password.tsx
├── (student)/
│   ├── _layout.tsx          # Bottom tab navigator
│   ├── dashboard.tsx        # "Today" tab
│   ├── answer.tsx           # Push screen from dashboard
│   ├── history.tsx          # "History" tab
│   └── profile.tsx          # "Profile" tab
└── (faculty)/
    ├── _layout.tsx          # Bottom tab navigator
    ├── dashboard.tsx        # "Overview" tab
    ├── questions.tsx        # "Questions" tab
    ├── review/              # "Review" tab
    │   ├── _layout.tsx      # Stack navigator
    │   ├── index.tsx        # Queue list
    │   └── [id].tsx         # Submission detail
    └── students/            # "Students" tab
        ├── _layout.tsx      # Stack navigator
        ├── index.tsx        # Student list
        └── [id].tsx         # Student detail
```

### Student Tabs
| Tab | Screen | Purpose |
|-----|--------|---------|
| Today | dashboard.tsx | Today's status, attendance ring, submit CTA |
| History | history.tsx | Past submissions with status badges |
| Profile | profile.tsx | View/edit personal info |

### Faculty/Admin Tabs
| Tab | Screen | Purpose |
|-----|--------|---------|
| Overview | dashboard.tsx | Summary cards (pending, students, today, stats) |
| Review | review/index.tsx | Pending submissions queue |
| Students | students/index.tsx | Student directory with search |
| Questions | questions.tsx | CRUD + reorder daily questions |

## 3. State Management

### 3.1 React Query Configuration
```typescript
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000,    // 5 minutes
      gcTime: 30 * 60 * 1000,       // 30 minutes
      retry: 2,
      refetchOnWindowFocus: true,
    },
  },
});
```

### 3.2 Query Keys
Structured query keys for cache management:
- `['dashboard']`
- `['submissions', { status, page }]`
- `['submissions', 'today']`
- `['submissions', id]`
- `['questions']`
- `['students', { page, search }]`
- `['students', id]`
- `['documents', { submissionId }]`

### 3.3 Zustand Stores
- **Auth store** — tokens, user profile, login/logout actions
- Uses curried `create<T>()(...)` form (Zustand v5 requirement)

## 4. API Integration

### 4.1 HTTP Client (`lib/api/client.ts`)
- Base URL from `EXPO_PUBLIC_API_URL`
- Authorization header injection from auth store
- Automatic 401 handling → token refresh → retry
- Response type safety via shared contracts

### 4.2 Hooks (`lib/api/hooks.ts`)
React Query hooks wrapping every endpoint:
- `useDashboard()`
- `useSubmissions(filters)`
- `useSubmissionToday()`
- `useSubmitAnswers()`
- `useReviewSubmission()`
- `useBulkReview()`
- `useQuestions()`
- `useCreateQuestion()`
- `useUpdateQuestion()`
- `useDeleteQuestion()`
- `useReorderQuestions()`
- `useStudents(filters)`
- `useStudentDetail(id)`
- `useStudentProfile()`
- `useUpdateProfile()`
- `useUploadDocument()`
- `useCompleteUpload()`
- `useDeleteDocument()`

### 4.3 Mutations & Cache Invalidation
- Submit answers → invalidate `['submissions', 'today']`, `['dashboard']`
- Review submission → invalidate `['submissions']`, `['dashboard']`
- Create/edit question → invalidate `['questions']`
- Upload document → invalidate `['documents']`

## 5. UI Components

### 5.1 Shared (`components/shared/`)
- **Screen** — Safe area wrapper with consistent padding and scroll behaviour

### 5.2 UI Library (`components/ui/`)
- **Button** — Primary/secondary/outline variants, loading state
- **Card** — Elevated container with optional header
- **Chips** — Selection chips for filters
- **ProgressRing** — Circular progress indicator (attendance percentage)
- **StatusPill** — Colored badge for submission status (pending/approved/declined)
- **TextField** — Text input with label, error state, character counter

### 5.3 Theme (`constants/theme.ts`)
Centralized design tokens:
- Colors (primary, surface, text, status indicators)
- Typography (font sizes, weights, line heights)
- Spacing scale
- Border radii

## 6. Key Screens

### 6.1 Student Dashboard
- Attendance progress ring (approved / total days)
- Today's status card:
  - None → "Submit today's log" button
  - Pending → "Awaiting review" badge
  - Approved → "Attended" badge with checkmark
  - Declined → "Declined" badge + review note + "Resubmit" button

### 6.2 Answer Screen
- List of active questions (sorted by sortOrder)
- TextInput per question (respects type: single-line, multiline, number, choice picker)
- Help text shown below each question
- Character counter (min 10, max 2000)
- Document attachment section (up to 5 files)
- Submit button with loading state

### 6.3 Faculty Review Detail
- Student name + register number
- Submission date
- List of answers (question prompt + answer text)
- Attached documents (tap to download)
- Action buttons: Approve / Decline
- Decline requires text input for reason (min 5 chars)

## 7. File Upload Flow

```
User taps "Attach File"
    │
    ▼
Document picker (PDF, JPG, PNG, HEIC)
    │
    ├── File > 10 MB → Error toast
    ├── Wrong type → Error toast
    │
    ▼ Valid file
POST /api/documents/upload-url
    │
    ▼ { documentId, uploadUrl }
PUT file to uploadUrl (progress indicator)
    │
    ▼ Upload complete
POST /api/documents/complete { documentId, submissionId }
    │
    ▼
File badge shown in form
```

## 8. Auth Flow

### 8.1 Login
1. User enters email + password
2. Supabase Auth `signInWithPassword()` → returns session with JWT
3. JWT stored in Zustand auth store (in-memory)
4. `GET /api/auth/me` → loads user profile + role
5. Router redirects based on role

### 8.2 Token Management
- Access token: 1 hour TTL
- Refresh: Supabase SDK handles refresh automatically
- On 401 from API: trigger refresh, retry request
- On refresh failure: clear store, redirect to login

### 8.3 Logout
- Clear Zustand auth store
- Call Supabase `signOut()`
- Navigate to login screen

## 9. Error Handling

| Scenario | Behaviour |
|----------|-----------|
| Network failure | Toast with "No connection" + retry option |
| 401 Unauthorized | Attempt token refresh → retry or redirect to login |
| 403 Forbidden | Toast with "Not allowed" message |
| 409 Conflict | Contextual message (e.g., "Already submitted today") |
| 422 Validation | Inline field errors from response details |
| 429 Rate limited | Toast with "Too many requests, try again later" |
| 500 Server error | Generic error toast |

## 10. Performance Considerations

- React Query staleTime (5 min) reduces unnecessary refetches
- FlatList with `getItemLayout` for submission lists
- Image documents not rendered inline (download on tap)
- No offline cache or SQLite — all data is server-fetched
- Minimal re-renders via Zustand selectors (curried form)
