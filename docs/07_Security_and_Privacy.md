# 07 — Security and Privacy

## 1. Authentication

### 1.1 Identity Provider
- Supabase Auth handles user registration, login, and password management
- Email + password authentication
- Password reset via Supabase's transactional email

### 1.2 Token Verification
- Supabase issues JWTs signed with the project's JWT secret
- Backend verifies tokens locally using the `jose` library and Supabase's JWKS endpoint
- No network call to Supabase per request (JWKS cached)
- LRU cache maps verified `auth_id` → User record to avoid per-request DB lookups

### 1.3 Token Lifecycle
- Access token: 1 hour (Supabase default)
- Refresh token: managed by Supabase client SDK
- Mobile client refreshes automatically on 401

### 1.4 Current Limitation
- Tokens are stored in memory (Zustand store), not in Keychain/Keystore
- Session is lost when the app is killed (but survives hot reload)
- Production deployment should use expo-secure-store with chunked storage

## 2. Authorization

### 2.1 Role-Based Access Control
Three roles with escalating data scope:
- **Student** — access to own data only
- **Faculty** — access to own department's data
- **Admin** — access to all data (institution-wide)

### 2.2 Scope Enforcement
- Faculty scope is determined by `user.departmentId`
- Faculty with null department sees nothing (fails closed)
- Every query filters by department scope for faculty
- Admin bypasses department filter

### 2.3 Authorization Matrix

| Action | Who |
|--------|-----|
| Submit answers | Student (owner only) |
| Edit own submission | Student (pending/declined only) |
| Review submission | Faculty (same dept) + Admin |
| Create/edit/retire question | Faculty (same dept) + Admin |
| Edit student profile | Student (self) + Admin |
| Upload/delete documents | Student (owner only) |
| View documents | Owner + reviewer of parent submission |
| Create department | Admin only |

### 2.4 Immutability Rules
- Faculty cannot edit student answers (enforced at authorization layer)
- Approved submissions cannot be modified by anyone
- promptSnapshot on answers is write-once

## 3. Data Protection

### 3.1 Data at Rest
- PostgreSQL on Supabase (encrypted at rest by Supabase infrastructure)
- File storage in private Supabase Storage bucket (encrypted at rest)
- No sensitive data stored locally on device (no offline database)

### 3.2 Data in Transit
- All API calls over HTTPS (TLS 1.2+)
- Signed upload/download URLs for direct storage access
- No sensitive data in URL query parameters

### 3.3 Storage Key Design
- Document storage keys are random UUIDs
- Never derived from student name, register number, or filename
- Storage key excluded from all API responses (server-only field)
- Prevents enumeration attacks on the storage bucket

### 3.4 Soft Delete
- Documents: `deleted_at` timestamp set, then storage object removed
- Questions: `is_active = false` (never hard-deleted)
- Prevents orphaned references

## 4. Row-Level Security

### 4.1 Defense in Depth
- RLS enabled on all tables in Supabase
- No permissive policies defined (deny-all by default)
- Application connects as `postgres` role (BYPASSRLS)
- Authorization enforced in application code

### 4.2 Purpose
Supabase exposes a public REST API via the `anon` key. Without RLS, that key could read all tables. RLS with no permissive policies means the auto-generated REST endpoint returns nothing for any table, even if the anon key is compromised.

## 5. Input Validation

### 5.1 Schema Validation
- All request bodies validated with Zod schemas (shared package)
- Type coercion and sanitization at parse boundary
- Invalid requests rejected with 422 + field-level error details

### 5.2 Limits

| Parameter | Value |
|-----------|-------|
| Answer min length | 10 chars |
| Answer max length | 2,000 chars |
| Review note min length | 5 chars |
| Max active questions | 20 |
| Max files per submission | 5 |
| Max file size | 10 MB |
| Allowed file types | PDF, JPG, PNG, HEIC |

### 5.3 File Validation
- MIME type checked against allowlist before issuing upload URL
- File size checked before issuing upload URL
- Content-type verified at storage level

## 6. Rate Limiting

### 6.1 Implementation
- In-process rate limiter (`src/lib/rateLimit.ts`)
- Per-user and per-IP sliding windows
- Returns 429 with `Retry-After` header

### 6.2 Current Limitation
- In-memory counters (per-instance)
- Correct for single-instance deployment
- Multi-instance: implement `RateLimitStore` interface backed by Redis

### 6.3 Auth Rate Limiting
- Login attempts throttled by Supabase Auth (server-side)
- No `failed_login_attempts` column in app database

## 7. Audit Trail

### 7.1 AuditLog Table
Every security-relevant action is logged:
- Login success/failure
- Submission CRUD
- Review decisions
- Question management
- Document upload/delete/download
- Profile changes
- User status changes

### 7.2 Audit Fields
- Actor user ID (nullable for unauthenticated events)
- Action name (enumerated, not free text)
- Entity type + ID
- Client platform (ios/android/web)
- Client version
- IP address
- Arbitrary metadata (JSONB)

## 8. Privacy

### 8.1 Data Minimization
- Only collect data necessary for the daily submission workflow
- No tracking beyond audit logging
- No analytics SDKs

### 8.2 Access Control
- Students see only their own data
- Faculty see only their department
- API never exposes one student's data to another student

### 8.3 File Privacy
- All files in a private bucket (no public URLs)
- Download requires authentication + authorization check
- Signed URLs are time-limited
