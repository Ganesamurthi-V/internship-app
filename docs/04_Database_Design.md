# Database Design — Enhanced for Mobile App

> **Version 2.0** | PostgreSQL (server) + WatermelonDB/SQLite (mobile local)

---

## 1. Entity Model

```
User
 ├── Student
 │    └── Internship
 │         ├── Attendance
 │         ├── DailyWorkLog
 │         ├── WeeklyReport
 │         ├── FinalAssessment
 │         │    └── SkillRating
 │         ├── MentorEvaluation
 │         └── InternshipDocument
 │
 ├── Faculty/Admin
 │
 └── Mentor

Organisation
 └── Internship

Department
 └── Student

DeviceToken         ← NEW: push notifications
SyncQueue           ← NEW: offline sync tracking
AuditLog
```

---

## 2. Server Database Tables (PostgreSQL)

### users
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
email           TEXT UNIQUE NOT NULL
password_hash   TEXT                          -- null if SSO
role            TEXT NOT NULL CHECK (role IN ('student','faculty','mentor','admin'))
status          TEXT NOT NULL DEFAULT 'active' CHECK (status IN ('active','suspended','pending'))
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### user_sessions
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
refresh_token   TEXT UNIQUE NOT NULL
client_platform TEXT CHECK (client_platform IN ('ios','android','web'))
client_version  TEXT
expires_at      TIMESTAMPTZ NOT NULL
revoked_at      TIMESTAMPTZ
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### device_tokens  ← NEW (push notifications)
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE
expo_push_token TEXT NOT NULL
platform        TEXT NOT NULL CHECK (platform IN ('ios','android'))
app_version     TEXT
last_active_at  TIMESTAMPTZ NOT NULL DEFAULT now()
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (user_id, expo_push_token)
```

### departments
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
name            TEXT NOT NULL
institution     TEXT NOT NULL DEFAULT 'Sri Manakula Vinayagar Engineering College'
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### students
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID UNIQUE NOT NULL REFERENCES users(id)
register_number TEXT UNIQUE NOT NULL
name            TEXT NOT NULL
programme       TEXT NOT NULL
department_id   UUID REFERENCES departments(id)
year            INTEGER CHECK (year BETWEEN 1 AND 5)
section         TEXT
student_email   TEXT NOT NULL
mobile          TEXT
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### organisations
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
name            TEXT NOT NULL
location        TEXT
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### mentors
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID REFERENCES users(id)   -- null until mentor creates account
name            TEXT NOT NULL
designation     TEXT
email           TEXT
contact         TEXT
organisation_id UUID REFERENCES organisations(id)
invite_token    TEXT UNIQUE                 -- secure invite link token
invite_expires  TIMESTAMPTZ
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### internships
```sql
id                       UUID PRIMARY KEY DEFAULT gen_random_uuid()
student_id               UUID NOT NULL REFERENCES students(id)
organisation_id          UUID REFERENCES organisations(id)
mentor_id                UUID REFERENCES mentors(id)
faculty_coordinator_id   UUID REFERENCES users(id)
domain                   TEXT NOT NULL CHECK (domain IN (
                           'software_development','data_science_ai_ml',
                           'cyber_security','cloud_computing','networking',
                           'web_development','business_management','other'))
mode                     TEXT NOT NULL CHECK (mode IN ('offline','online','hybrid'))
start_date               DATE NOT NULL
end_date                 DATE NOT NULL
duration_days            INTEGER GENERATED ALWAYS AS (end_date - start_date) STORED
working_hours_per_day    NUMERIC(4,2) NOT NULL
status                   TEXT NOT NULL DEFAULT 'pending'
                           CHECK (status IN ('pending','approved','active','completed','rejected'))
approved_by              UUID REFERENCES users(id)
approved_at              TIMESTAMPTZ
rejection_reason         TEXT
created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
CONSTRAINT valid_dates CHECK (end_date >= start_date)
```

### attendance
```sql
id                   UUID PRIMARY KEY DEFAULT gen_random_uuid()
internship_id        UUID NOT NULL REFERENCES internships(id)
student_id           UUID NOT NULL REFERENCES students(id)
attendance_date      DATE NOT NULL
status               TEXT NOT NULL CHECK (status IN (
                       'present','absent','permission_leave','holiday','weekly_off'))
reporting_time       TIME
leaving_time         TIME
total_hours          NUMERIC(5,2) GENERATED ALWAYS AS (
                       EXTRACT(EPOCH FROM (leaving_time - reporting_time))/3600
                     ) STORED
mode                 TEXT CHECK (mode IN ('office','online','hybrid'))
proof_document_id    UUID REFERENCES documents(id)
leave_reason         TEXT
mentor_verified      BOOLEAN NOT NULL DEFAULT false
mentor_verified_at   TIMESTAMPTZ
client_id            UUID UNIQUE        -- device-generated UUID for offline dedup
synced_at            TIMESTAMPTZ        -- when offline record was synced
created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (internship_id, attendance_date)
CONSTRAINT valid_times CHECK (leaving_time IS NULL OR leaving_time > reporting_time)
```

### daily_work_logs
```sql
id                   UUID PRIMARY KEY DEFAULT gen_random_uuid()
internship_id        UUID NOT NULL REFERENCES internships(id)
student_id           UUID NOT NULL REFERENCES students(id)
work_date            DATE NOT NULL
activities           TEXT NOT NULL
technologies         TEXT[]              -- array of tags
task_assigned        TEXT
completion_status    TEXT CHECK (completion_status IN ('yes','partially','no'))
learning             TEXT
challenge            TEXT
solution             TEXT
deliverable_type     TEXT CHECK (deliverable_type IN (
                       'code','documentation','design','analysis',
                       'testing','presentation','other'))
evidence_document_id UUID REFERENCES documents(id)
mentor_interaction   BOOLEAN NOT NULL DEFAULT false
mentor_feedback      TEXT
client_id            UUID UNIQUE
synced_at            TIMESTAMPTZ
created_at           TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at           TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (internship_id, work_date)
```

### weekly_reports
```sql
id                     UUID PRIMARY KEY DEFAULT gen_random_uuid()
internship_id          UUID NOT NULL REFERENCES internships(id)
student_id             UUID NOT NULL REFERENCES students(id)
week_number            INTEGER NOT NULL
week_start_date        DATE NOT NULL
week_end_date          DATE NOT NULL
days_attended          INTEGER          -- auto-aggregated from attendance
total_hours            NUMERIC(6,2)     -- auto-aggregated from attendance
major_activities       TEXT
technologies_learned   TEXT[]
skills_developed       TEXT[]
major_assignment       TEXT
problems               TEXT
solutions              TEXT
learning_outcomes      TEXT
mentor_feedback        TEXT
student_self_assessment TEXT
report_document_id     UUID REFERENCES documents(id)
submitted_at           TIMESTAMPTZ
created_at             TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at             TIMESTAMPTZ NOT NULL DEFAULT now()
UNIQUE (internship_id, week_number)
```

### final_assessments
```sql
id                         UUID PRIMARY KEY DEFAULT gen_random_uuid()
internship_id              UUID UNIQUE NOT NULL REFERENCES internships(id)
student_id                 UUID NOT NULL REFERENCES students(id)
completed_successfully     BOOLEAN
total_days_attended        INTEGER
total_hours                NUMERIC(6,2)
major_project              TEXT
technologies_mastered      TEXT[]
skills_developed           TEXT[]
objectives_status          TEXT CHECK (objectives_status IN ('fully','partially','no'))
usefulness_rating          INTEGER CHECK (usefulness_rating BETWEEN 1 AND 5)
technical_improvement      TEXT
employability_improvement  TEXT
curriculum_relation        TEXT
real_world_exposure        TEXT
recommend_organisation     BOOLEAN
suggestions                TEXT
submitted_at               TIMESTAMPTZ
created_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at                 TIMESTAMPTZ NOT NULL DEFAULT now()
```

### skill_ratings  (self-assessment, linked to final_assessment)
```sql
id                   UUID PRIMARY KEY DEFAULT gen_random_uuid()
final_assessment_id  UUID NOT NULL REFERENCES final_assessments(id)
skill_type           TEXT NOT NULL CHECK (skill_type IN (
                       'technical_knowledge','problem_solving','communication',
                       'teamwork','time_management','professional_discipline',
                       'adaptability','industry_awareness'))
rating               INTEGER NOT NULL CHECK (rating BETWEEN 1 AND 5)
UNIQUE (final_assessment_id, skill_type)
```

### mentor_evaluations
```sql
id                       UUID PRIMARY KEY DEFAULT gen_random_uuid()
internship_id            UUID UNIQUE NOT NULL REFERENCES internships(id)
mentor_id                UUID NOT NULL REFERENCES mentors(id)
technical_knowledge      INTEGER CHECK (technical_knowledge BETWEEN 1 AND 5)
problem_solving          INTEGER CHECK (problem_solving BETWEEN 1 AND 5)
communication            INTEGER CHECK (communication BETWEEN 1 AND 5)
teamwork                 INTEGER CHECK (teamwork BETWEEN 1 AND 5)
professional_behaviour   INTEGER CHECK (professional_behaviour BETWEEN 1 AND 5)
punctuality_attendance   INTEGER CHECK (punctuality_attendance BETWEEN 1 AND 5)
ability_to_learn         INTEGER CHECK (ability_to_learn BETWEEN 1 AND 5)
initiative               INTEGER CHECK (initiative BETWEEN 1 AND 5)
quality_of_work          INTEGER CHECK (quality_of_work BETWEEN 1 AND 5)
overall_performance      INTEGER CHECK (overall_performance BETWEEN 1 AND 5)
strengths                TEXT
improvement_areas        TEXT
remarks                  TEXT
employment_recommendation BOOLEAN
digital_confirmation     BOOLEAN NOT NULL DEFAULT false
submitted_at             TIMESTAMPTZ
created_at               TIMESTAMPTZ NOT NULL DEFAULT now()
updated_at               TIMESTAMPTZ NOT NULL DEFAULT now()
```

### documents
```sql
id                  UUID PRIMARY KEY DEFAULT gen_random_uuid()
owner_user_id       UUID NOT NULL REFERENCES users(id)
document_type       TEXT NOT NULL CHECK (document_type IN (
                      'offer_letter','joining_proof','completion_certificate',
                      'internship_report','project_report','attendance_statement',
                      'mentor_evaluation_doc','presentation','work_evidence',
                      'attendance_proof','weekly_report_pdf','other'))
storage_key         TEXT UNIQUE NOT NULL    -- random UUID path in S3/MinIO
original_filename   TEXT NOT NULL
mime_type           TEXT NOT NULL
size_bytes          INTEGER NOT NULL
checksum            TEXT                    -- SHA-256 for integrity
uploaded_at         TIMESTAMPTZ NOT NULL DEFAULT now()
verified_at         TIMESTAMPTZ
verification_status TEXT NOT NULL DEFAULT 'pending'
                      CHECK (verification_status IN ('pending','verified','rejected'))
rejection_reason    TEXT
```

### audit_logs
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
actor_user_id   UUID REFERENCES users(id)
action          TEXT NOT NULL
entity_type     TEXT NOT NULL
entity_id       UUID
client_platform TEXT
client_version  TEXT
ip_address      INET
metadata        JSONB
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

### notification_logs
```sql
id              UUID PRIMARY KEY DEFAULT gen_random_uuid()
user_id         UUID NOT NULL REFERENCES users(id)
type            TEXT NOT NULL
title           TEXT NOT NULL
body            TEXT
delivered_at    TIMESTAMPTZ
read_at         TIMESTAMPTZ
created_at      TIMESTAMPTZ NOT NULL DEFAULT now()
```

---

## 3. Recommended Indexes

```sql
-- Core lookups
CREATE INDEX ON students(register_number);
CREATE INDEX ON internships(student_id, status);
CREATE INDEX ON internships(start_date, end_date);
CREATE INDEX ON internships(faculty_coordinator_id);

-- Daily operations
CREATE INDEX ON attendance(internship_id, attendance_date);
CREATE INDEX ON attendance(student_id, attendance_date);
CREATE INDEX ON daily_work_logs(internship_id, work_date);
CREATE INDEX ON weekly_reports(internship_id, week_number);

-- Reporting
CREATE INDEX ON documents(owner_user_id, document_type);
CREATE INDEX ON mentor_evaluations(internship_id);
CREATE INDEX ON audit_logs(entity_type, entity_id);
CREATE INDEX ON audit_logs(created_at);

-- Offline sync
CREATE INDEX ON attendance(client_id);
CREATE INDEX ON daily_work_logs(client_id);

-- Notifications
CREATE INDEX ON device_tokens(user_id);
CREATE INDEX ON notification_logs(user_id, read_at);
```

---

## 4. Local Mobile Database (WatermelonDB / SQLite)

WatermelonDB mirrors a subset of the server schema for offline support.

**Local tables (mobile only):**
- `attendance_drafts` — offline attendance records pending sync
- `work_log_drafts` — offline work logs pending sync
- `internship_cache` — read-only cache of approved internship
- `weekly_report_drafts` — offline weekly report drafts
- `sync_queue` — ordered list of pending API calls

Schema defined in `apps/mobile/lib/db/schema.ts` using WatermelonDB's `tableSchema`.

---

## 5. Data Integrity Rules

- Attendance percentage: always computed from `COUNT(status='present') / total_working_days`; never stored as a raw number.
- Total hours: computed from reporting/leaving time or summed from attendance records.
- Week number: computed from `(work_date - internship.start_date) / 7` on the server; sent to mobile in attendance summary.
- All ratings: enforced as `INTEGER BETWEEN 1 AND 5` at DB level and Zod level.
