/**
 * Local SQLite schema — 04_Database_Design §4, 12_Mobile_App_Spec §5.
 *
 * The tables and columns are exactly those specified for the local mirror:
 * `attendance_drafts`, `work_log_drafts`, `sync_queue`, plus a read-only
 * `internship_cache` so the dashboard renders offline.
 *
 * IMPLEMENTATION DEVIATION: the documents specify WatermelonDB, and 12_Mobile_App_Spec
 * §5 gives the schema in WatermelonDB's `tableSchema` form. This uses `expo-sqlite`
 * instead. Reasons:
 *
 *   - WatermelonDB 0.28 reaches SQLite through a JSI adapter, needs Babel decorator
 *     support and a community-maintained Expo config plugin, and has known friction
 *     with React Native's New Architecture — which is the default in RN 0.86 / Expo
 *     SDK 57, the versions this app is built on.
 *   - `expo-sqlite` is first-party, New-Architecture-native, and needs no config plugin.
 *   - 08_Implementation_Plan Phase 0 frames the choice as a recommendation
 *     ("WatermelonDB / MMKV + custom sync"), and 04_Database_Design §4 says
 *     "WatermelonDB/SQLite", so SQLite is within what the documents allow.
 *
 * The column names, the `sync_status` state machine and the sync protocol are
 * unchanged, so the server contract and the design in §6 are identical.
 *
 * NOTE ON ENCRYPTION: 07_Security_and_Privacy §3.4 asks for SQLCipher encryption of
 * the local database. `expo-sqlite` does not bundle SQLCipher, so this database is
 * **not encrypted at rest**. What that exposes is limited by design — drafts hold
 * attendance and work-log text, never tokens, passwords or document bytes — but it is
 * a real gap against the specification and is listed in the README.
 */

/** Bumped whenever a migration is added below. */
export const SCHEMA_VERSION = 1;

/**
 * Local sync state for a draft row.
 *   pending — written locally, not yet accepted by the server
 *   synced  — the server has it; `server_id` is populated
 *   error   — the server rejected it; `error_message` explains why
 */
export type LocalSyncStatus = 'pending' | 'synced' | 'error';

/**
 * Migrations, applied in order. Each entry is the SQL that moves the database from
 * version `index` to version `index + 1`, so appending is the only safe edit.
 *
 * `user_version` is SQLite's own counter, which makes the applied version durable
 * without a bookkeeping table.
 */
export const MIGRATIONS: readonly string[] = [
  // -- 0 -> 1 ---------------------------------------------------------------
  `

  CREATE TABLE IF NOT EXISTS attendance_drafts (
    -- Device-generated UUID. This is the idempotency key the server dedups on, so it
    -- is the primary key locally too: one draft, one clientId, forever.
    client_id        TEXT PRIMARY KEY NOT NULL,
    internship_id    TEXT NOT NULL,
    attendance_date  TEXT NOT NULL,
    status           TEXT NOT NULL,
    reporting_time   TEXT,
    leaving_time     TEXT,
    mode             TEXT,
    leave_reason     TEXT,
    proof_document_id TEXT,
    sync_status      TEXT NOT NULL DEFAULT 'pending',
    server_id        TEXT,
    error_message    TEXT,
    created_at       INTEGER NOT NULL,
    updated_at       INTEGER NOT NULL,
    -- Mirrors the server's UNIQUE (internship_id, attendance_date). Without this a
    -- student could queue two drafts for one day while offline and the second would
    -- come back as a duplicate after sync.
    UNIQUE (internship_id, attendance_date)
  );

  CREATE INDEX IF NOT EXISTS idx_attendance_drafts_sync
    ON attendance_drafts (sync_status);
  CREATE INDEX IF NOT EXISTS idx_attendance_drafts_date
    ON attendance_drafts (internship_id, attendance_date);

  CREATE TABLE IF NOT EXISTS work_log_drafts (
    client_id          TEXT PRIMARY KEY NOT NULL,
    internship_id      TEXT NOT NULL,
    work_date          TEXT NOT NULL,
    activities         TEXT NOT NULL,
    -- JSON array stored as text, per 12_Mobile_App_Spec §5.
    technologies       TEXT NOT NULL DEFAULT '[]',
    task_assigned      TEXT,
    completion_status  TEXT,
    learning           TEXT,
    challenge          TEXT,
    solution           TEXT,
    deliverable_type   TEXT,
    evidence_document_id TEXT,
    mentor_interaction INTEGER NOT NULL DEFAULT 0,
    mentor_feedback    TEXT,
    sync_status        TEXT NOT NULL DEFAULT 'pending',
    server_id          TEXT,
    error_message      TEXT,
    created_at         INTEGER NOT NULL,
    updated_at         INTEGER NOT NULL,
    UNIQUE (internship_id, work_date)
  );

  CREATE INDEX IF NOT EXISTS idx_work_log_drafts_sync
    ON work_log_drafts (sync_status);
  CREATE INDEX IF NOT EXISTS idx_work_log_drafts_date
    ON work_log_drafts (internship_id, work_date);

  -- Read-only cache so the dashboard and forms work with no connectivity
  -- (02_SRS §5: "View own records | Served from local cache").
  CREATE TABLE IF NOT EXISTS internship_cache (
    internship_id  TEXT PRIMARY KEY NOT NULL,
    -- The serialised InternshipDetail payload. Stored whole rather than normalised:
    -- it is only ever read back as one object, and keeping it opaque means a server
    -- field addition needs no local migration.
    payload        TEXT NOT NULL,
    cached_at      INTEGER NOT NULL
  );

  -- Generic key/value cache for other GET responses (dashboard, summaries), so a
  -- cold launch offline still renders something with a last-synced timestamp.
  CREATE TABLE IF NOT EXISTS response_cache (
    cache_key  TEXT PRIMARY KEY NOT NULL,
    payload    TEXT NOT NULL,
    cached_at  INTEGER NOT NULL
  );

  -- FIFO record of sync attempts (03_TechSpec §5 "Sync Queue (FIFO, persistent)").
  -- Drafts carry their own sync_status, so this exists for ordering and for the
  -- retry/backoff bookkeeping the banner and badge read.
  CREATE TABLE IF NOT EXISTS sync_queue (
    id            INTEGER PRIMARY KEY AUTOINCREMENT,
    entity_type   TEXT NOT NULL,
    client_id     TEXT NOT NULL,
    attempts      INTEGER NOT NULL DEFAULT 0,
    last_error    TEXT,
    last_attempt_at INTEGER,
    created_at    INTEGER NOT NULL,
    UNIQUE (entity_type, client_id)
  );

  CREATE INDEX IF NOT EXISTS idx_sync_queue_order ON sync_queue (id);
  `,
];

// ---------------------------------------------------------------------------
// Row types
// ---------------------------------------------------------------------------

export interface AttendanceDraftRow {
  client_id: string;
  internship_id: string;
  attendance_date: string;
  status: string;
  reporting_time: string | null;
  leaving_time: string | null;
  mode: string | null;
  leave_reason: string | null;
  proof_document_id: string | null;
  sync_status: LocalSyncStatus;
  server_id: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

export interface WorkLogDraftRow {
  client_id: string;
  internship_id: string;
  work_date: string;
  activities: string;
  /** JSON-encoded string array. */
  technologies: string;
  task_assigned: string | null;
  completion_status: string | null;
  learning: string | null;
  challenge: string | null;
  solution: string | null;
  deliverable_type: string | null;
  evidence_document_id: string | null;
  /** SQLite has no boolean; 0 or 1. */
  mentor_interaction: number;
  mentor_feedback: string | null;
  sync_status: LocalSyncStatus;
  server_id: string | null;
  error_message: string | null;
  created_at: number;
  updated_at: number;
}

export interface SyncQueueRow {
  id: number;
  entity_type: 'attendance' | 'work_log';
  client_id: string;
  attempts: number;
  last_error: string | null;
  last_attempt_at: number | null;
  created_at: number;
}
