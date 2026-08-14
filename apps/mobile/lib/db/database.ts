/**
 * Local database access.
 *
 * Opens the SQLite file once, applies migrations, and exposes repositories for the
 * draft tables. Every function here is offline-safe by construction — nothing in this
 * module touches the network.
 */

import * as SQLite from 'expo-sqlite';
import type {
  AttendanceDraftRow,
  LocalSyncStatus,
  SyncQueueRow,
  WorkLogDraftRow,
} from './schema';
import { MIGRATIONS } from './schema';

const DATABASE_NAME = 'ims.db';

let databasePromise: Promise<SQLite.SQLiteDatabase> | null = null;

/**
 * Opens the database and runs any outstanding migrations.
 *
 * The promise is cached, so concurrent callers during startup share one open handle
 * and migrations cannot run twice.
 */
export function getDatabase(): Promise<SQLite.SQLiteDatabase> {
  if (!databasePromise) {
    databasePromise = (async () => {
      const database = await SQLite.openDatabaseAsync(DATABASE_NAME);
      await migrate(database);
      return database;
    })();
  }
  return databasePromise;
}

/**
 * Applies migrations from the database's current `user_version` onward.
 *
 * Each migration runs inside a transaction, so a failure part-way leaves the version
 * counter untouched and the migration is retried on the next launch rather than
 * leaving a half-migrated schema.
 */
async function migrate(database: SQLite.SQLiteDatabase): Promise<void> {
  const result = await database.getFirstAsync<{ user_version: number }>(
    'PRAGMA user_version',
  );
  const current = result?.user_version ?? 0;

  for (let version = current; version < MIGRATIONS.length; version += 1) {
    const sql = MIGRATIONS[version]!;
    await database.withTransactionAsync(async () => {
      await database.execAsync(sql);
    });
    // PRAGMA cannot be parameterised, and `version + 1` is a loop counter, not input.
    await database.execAsync(`PRAGMA user_version = ${version + 1}`);
  }
}

/** Wipes local data. Used on logout so the next user sees nothing of the previous one. */
export async function clearLocalData(): Promise<void> {
  const database = await getDatabase();
  await database.withTransactionAsync(async () => {
    await database.execAsync(`
      DELETE FROM attendance_drafts;
      DELETE FROM work_log_drafts;
      DELETE FROM sync_queue;
      DELETE FROM internship_cache;
      DELETE FROM response_cache;
    `);
  });
}

const now = (): number => Date.now();

// ---------------------------------------------------------------------------
// Attendance drafts
// ---------------------------------------------------------------------------

export interface AttendanceDraftInput {
  clientId: string;
  internshipId: string;
  date: string;
  status: string;
  reportingTime?: string | null;
  leavingTime?: string | null;
  mode?: string | null;
  leaveReason?: string | null;
  proofDocumentId?: string | null;
}

export const attendanceDrafts = {
  /**
   * Inserts or replaces the draft for a given day.
   *
   * `ON CONFLICT (internship_id, attendance_date)` keeps the original `client_id`,
   * which matters: if the student edits an unsent draft, it must still sync as the
   * same record rather than becoming a second one the server would reject as a
   * duplicate.
   */
  async upsert(input: AttendanceDraftInput): Promise<void> {
    const database = await getDatabase();
    const timestamp = now();

    await database.runAsync(
      `INSERT INTO attendance_drafts (
         client_id, internship_id, attendance_date, status, reporting_time, leaving_time,
         mode, leave_reason, proof_document_id, sync_status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
       ON CONFLICT (internship_id, attendance_date) DO UPDATE SET
         status = excluded.status,
         reporting_time = excluded.reporting_time,
         leaving_time = excluded.leaving_time,
         mode = excluded.mode,
         leave_reason = excluded.leave_reason,
         proof_document_id = excluded.proof_document_id,
         sync_status = 'pending',
         error_message = NULL,
         updated_at = excluded.updated_at`,
      [
        input.clientId,
        input.internshipId,
        input.date,
        input.status,
        input.reportingTime ?? null,
        input.leavingTime ?? null,
        input.mode ?? null,
        input.leaveReason ?? null,
        input.proofDocumentId ?? null,
        timestamp,
        timestamp,
      ],
    );

    await syncQueue.enqueue('attendance', input.clientId);
  },

  async findPending(): Promise<AttendanceDraftRow[]> {
    const database = await getDatabase();
    return database.getAllAsync<AttendanceDraftRow>(
      // Oldest first: FIFO, per 03_TechSpec §5.
      `SELECT * FROM attendance_drafts WHERE sync_status = 'pending' ORDER BY created_at ASC`,
    );
  },

  async findByDate(internshipId: string, date: string): Promise<AttendanceDraftRow | null> {
    const database = await getDatabase();
    return database.getFirstAsync<AttendanceDraftRow>(
      `SELECT * FROM attendance_drafts WHERE internship_id = ? AND attendance_date = ?`,
      [internshipId, date],
    );
  },

  async listForInternship(internshipId: string): Promise<AttendanceDraftRow[]> {
    const database = await getDatabase();
    return database.getAllAsync<AttendanceDraftRow>(
      `SELECT * FROM attendance_drafts WHERE internship_id = ? ORDER BY attendance_date DESC`,
      [internshipId],
    );
  },

  async markSynced(clientId: string, serverId: string | null): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      `UPDATE attendance_drafts
         SET sync_status = 'synced', server_id = COALESCE(?, server_id),
             error_message = NULL, updated_at = ?
       WHERE client_id = ?`,
      [serverId, now(), clientId],
    );
    await syncQueue.remove('attendance', clientId);
  },

  async markError(clientId: string, message: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      `UPDATE attendance_drafts SET sync_status = 'error', error_message = ?, updated_at = ?
       WHERE client_id = ?`,
      [message, now(), clientId],
    );
  },

  async countPending(): Promise<number> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM attendance_drafts WHERE sync_status = 'pending'`,
    );
    return row?.count ?? 0;
  },
};

// ---------------------------------------------------------------------------
// Work log drafts
// ---------------------------------------------------------------------------

export interface WorkLogDraftInput {
  clientId: string;
  internshipId: string;
  workDate: string;
  activities: string;
  technologies: string[];
  taskAssigned?: string | null;
  completionStatus?: string | null;
  learning?: string | null;
  challenge?: string | null;
  solution?: string | null;
  deliverableType?: string | null;
  evidenceDocumentId?: string | null;
  mentorInteraction: boolean;
  mentorFeedback?: string | null;
}

export const workLogDrafts = {
  async upsert(input: WorkLogDraftInput): Promise<void> {
    const database = await getDatabase();
    const timestamp = now();

    await database.runAsync(
      `INSERT INTO work_log_drafts (
         client_id, internship_id, work_date, activities, technologies, task_assigned,
         completion_status, learning, challenge, solution, deliverable_type,
         evidence_document_id, mentor_interaction, mentor_feedback,
         sync_status, created_at, updated_at
       ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'pending', ?, ?)
       ON CONFLICT (internship_id, work_date) DO UPDATE SET
         activities = excluded.activities,
         technologies = excluded.technologies,
         task_assigned = excluded.task_assigned,
         completion_status = excluded.completion_status,
         learning = excluded.learning,
         challenge = excluded.challenge,
         solution = excluded.solution,
         deliverable_type = excluded.deliverable_type,
         evidence_document_id = excluded.evidence_document_id,
         mentor_interaction = excluded.mentor_interaction,
         mentor_feedback = excluded.mentor_feedback,
         sync_status = 'pending',
         error_message = NULL,
         updated_at = excluded.updated_at`,
      [
        input.clientId,
        input.internshipId,
        input.workDate,
        input.activities,
        JSON.stringify(input.technologies),
        input.taskAssigned ?? null,
        input.completionStatus ?? null,
        input.learning ?? null,
        input.challenge ?? null,
        input.solution ?? null,
        input.deliverableType ?? null,
        input.evidenceDocumentId ?? null,
        input.mentorInteraction ? 1 : 0,
        input.mentorFeedback ?? null,
        timestamp,
        timestamp,
      ],
    );

    await syncQueue.enqueue('work_log', input.clientId);
  },

  async findPending(): Promise<WorkLogDraftRow[]> {
    const database = await getDatabase();
    return database.getAllAsync<WorkLogDraftRow>(
      `SELECT * FROM work_log_drafts WHERE sync_status = 'pending' ORDER BY created_at ASC`,
    );
  },

  async findByDate(internshipId: string, workDate: string): Promise<WorkLogDraftRow | null> {
    const database = await getDatabase();
    return database.getFirstAsync<WorkLogDraftRow>(
      `SELECT * FROM work_log_drafts WHERE internship_id = ? AND work_date = ?`,
      [internshipId, workDate],
    );
  },

  async listForInternship(internshipId: string): Promise<WorkLogDraftRow[]> {
    const database = await getDatabase();
    return database.getAllAsync<WorkLogDraftRow>(
      `SELECT * FROM work_log_drafts WHERE internship_id = ? ORDER BY work_date DESC`,
      [internshipId],
    );
  },

  async markSynced(clientId: string, serverId: string | null): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      `UPDATE work_log_drafts
         SET sync_status = 'synced', server_id = COALESCE(?, server_id),
             error_message = NULL, updated_at = ?
       WHERE client_id = ?`,
      [serverId, now(), clientId],
    );
    await syncQueue.remove('work_log', clientId);
  },

  async markError(clientId: string, message: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      `UPDATE work_log_drafts SET sync_status = 'error', error_message = ?, updated_at = ?
       WHERE client_id = ?`,
      [message, now(), clientId],
    );
  },

  async countPending(): Promise<number> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM work_log_drafts WHERE sync_status = 'pending'`,
    );
    return row?.count ?? 0;
  },

  /** Decodes the JSON `technologies` column, tolerating a corrupted value. */
  parseTechnologies(row: WorkLogDraftRow): string[] {
    try {
      const parsed = JSON.parse(row.technologies) as unknown;
      return Array.isArray(parsed) ? parsed.filter((v): v is string => typeof v === 'string') : [];
    } catch {
      return [];
    }
  },
};

// ---------------------------------------------------------------------------
// Sync queue
// ---------------------------------------------------------------------------

export const syncQueue = {
  async enqueue(entityType: 'attendance' | 'work_log', clientId: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT INTO sync_queue (entity_type, client_id, created_at) VALUES (?, ?, ?)
       ON CONFLICT (entity_type, client_id) DO NOTHING`,
      [entityType, clientId, now()],
    );
  },

  async remove(entityType: 'attendance' | 'work_log', clientId: string): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(`DELETE FROM sync_queue WHERE entity_type = ? AND client_id = ?`, [
      entityType,
      clientId,
    ]);
  },

  async recordAttempt(
    entityType: 'attendance' | 'work_log',
    clientId: string,
    error: string | null,
  ): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      `UPDATE sync_queue
         SET attempts = attempts + 1, last_error = ?, last_attempt_at = ?
       WHERE entity_type = ? AND client_id = ?`,
      [error, now(), entityType, clientId],
    );
  },

  async list(): Promise<SyncQueueRow[]> {
    const database = await getDatabase();
    return database.getAllAsync<SyncQueueRow>(`SELECT * FROM sync_queue ORDER BY id ASC`);
  },

  async count(): Promise<number> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ count: number }>(
      `SELECT COUNT(*) AS count FROM sync_queue`,
    );
    return row?.count ?? 0;
  },
};

// ---------------------------------------------------------------------------
// Response cache — 02_SRS §5 ("stale cache shown with last-sync timestamp")
// ---------------------------------------------------------------------------

export const responseCache = {
  async set(key: string, payload: unknown): Promise<void> {
    const database = await getDatabase();
    await database.runAsync(
      `INSERT INTO response_cache (cache_key, payload, cached_at) VALUES (?, ?, ?)
       ON CONFLICT (cache_key) DO UPDATE SET payload = excluded.payload, cached_at = excluded.cached_at`,
      [key, JSON.stringify(payload), now()],
    );
  },

  async get<T>(key: string): Promise<{ value: T; cachedAt: number } | null> {
    const database = await getDatabase();
    const row = await database.getFirstAsync<{ payload: string; cached_at: number }>(
      `SELECT payload, cached_at FROM response_cache WHERE cache_key = ?`,
      [key],
    );
    if (!row) return null;

    try {
      return { value: JSON.parse(row.payload) as T, cachedAt: row.cached_at };
    } catch {
      return null;
    }
  },
};
