/**
 * Offline sync engine — 03_TechSpec §5, 12_Mobile_App_Spec §6, 02_SRS §5.
 *
 * Flow, matching the diagram in 03_TechSpec §5:
 *
 *   write locally (draft, sync_status='pending')
 *     -> connectivity detected
 *     -> FIFO queue
 *     -> POST /api/sync  (one batch, both entity types)
 *     -> per-record results applied back to the local rows
 *
 * Behaviour the tests in 09_Test_Plan §4 require:
 *
 *   - "Reconnect → sync triggers automatically" — a NetInfo listener starts a run.
 *   - "Submit duplicate attendance while offline → only one record created" — the
 *     local UNIQUE (internship_id, date) prevents a second draft, and `clientId` makes
 *     the server side idempotent even if one slipped through.
 *   - "Background sync does not duplicate records already confirmed by server" — a
 *     `duplicate` result is treated as success and the draft is marked synced.
 *   - "Submit 10 consecutive offline logs → all appear in correct order" — drafts are
 *     read oldest-first and the batch preserves that order.
 *
 * Concurrency: `isRunning` guards against overlapping runs, which would send the same
 * drafts twice. Combined with `clientId` idempotency on the server, a race is
 * harmless, but avoiding it keeps the pending count honest.
 */

import NetInfo, { type NetInfoState } from '@react-native-community/netinfo';
import type { SyncResponse, SyncResult } from '@ims/shared-types';
import { MAX_SYNC_BATCH_SIZE } from '@ims/shared-types';
import { api, ApiError, hasSession } from '@/lib/api/client';
import {
  attendanceDrafts,
  syncQueue,
  workLogDrafts,
  type WorkLogDraftInput,
} from '@/lib/db/database';
import type { AttendanceDraftRow, WorkLogDraftRow } from '@/lib/db/schema';

export interface SyncOutcome {
  attempted: number;
  synced: number;
  duplicates: number;
  failed: number;
  /** True when the run was skipped because there was nothing to send. */
  skipped: boolean;
  error?: string;
}

type Listener = (state: {
  isSyncing: boolean;
  pendingCount: number;
  lastSyncAt: Date | null;
  lastOutcome: SyncOutcome | null;
}) => void;

class SyncEngine {
  private isRunning = false;
  private started = false;
  private lastSyncAt: Date | null = null;
  private lastOutcome: SyncOutcome | null = null;
  private pendingCount = 0;
  private isConnected = true;
  private listeners = new Set<Listener>();
  private unsubscribeNetInfo: (() => void) | null = null;
  private retryTimer: ReturnType<typeof setTimeout> | null = null;
  private consecutiveFailures = 0;

  /**
   * Begins watching connectivity. Idempotent, so calling it from a component mount is
   * safe across remounts.
   */
  start(): void {
    if (this.started) return;
    this.started = true;

    this.unsubscribeNetInfo = NetInfo.addEventListener((state: NetInfoState) => {
      const wasConnected = this.isConnected;
      // `isInternetReachable` is null while NetInfo is still determining it; treating
      // null as "connected" avoids blocking a sync on a slow probe.
      this.isConnected = Boolean(state.isConnected) && state.isInternetReachable !== false;

      // Only trigger on the offline -> online edge, not on every network change.
      if (!wasConnected && this.isConnected) {
        void this.run();
      }

      this.emit();
    });

    void this.refreshPendingCount();
  }

  stop(): void {
    this.unsubscribeNetInfo?.();
    this.unsubscribeNetInfo = null;
    if (this.retryTimer) clearTimeout(this.retryTimer);
    this.retryTimer = null;
    this.started = false;
  }

  subscribe(listener: Listener): () => void {
    this.listeners.add(listener);
    listener(this.snapshot());
    return () => this.listeners.delete(listener);
  }

  private snapshot() {
    return {
      isSyncing: this.isRunning,
      pendingCount: this.pendingCount,
      lastSyncAt: this.lastSyncAt,
      lastOutcome: this.lastOutcome,
    };
  }

  private emit(): void {
    const state = this.snapshot();
    for (const listener of this.listeners) listener(state);
  }

  async refreshPendingCount(): Promise<number> {
    this.pendingCount = await syncQueue.count();
    this.emit();
    return this.pendingCount;
  }

  getIsConnected(): boolean {
    return this.isConnected;
  }

  /**
   * Sends every pending draft.
   *
   * Returns rather than throwing on failure: sync is a background concern and a failed
   * run is an expected state, not an error the caller must handle.
   */
  async run(): Promise<SyncOutcome> {
    if (this.isRunning) {
      return { attempted: 0, synced: 0, duplicates: 0, failed: 0, skipped: true };
    }

    // Nothing to send without a session — the endpoint is student-scoped.
    if (!hasSession()) {
      return { attempted: 0, synced: 0, duplicates: 0, failed: 0, skipped: true };
    }

    this.isRunning = true;
    this.emit();

    try {
      const [pendingAttendance, pendingWorkLogs] = await Promise.all([
        attendanceDrafts.findPending(),
        workLogDrafts.findPending(),
      ]);

      if (pendingAttendance.length === 0 && pendingWorkLogs.length === 0) {
        this.consecutiveFailures = 0;
        const outcome: SyncOutcome = {
          attempted: 0,
          synced: 0,
          duplicates: 0,
          failed: 0,
          skipped: true,
        };
        this.lastOutcome = outcome;
        return outcome;
      }

      // The server caps each collection at MAX_SYNC_BATCH_SIZE. Chunking here keeps a
      // long offline period (say 90 days of drafts) from being rejected wholesale.
      const attendanceBatch = pendingAttendance.slice(0, MAX_SYNC_BATCH_SIZE);
      const workLogBatch = pendingWorkLogs.slice(0, MAX_SYNC_BATCH_SIZE);

      const response = await api.post<SyncResponse>('/sync', {
        attendance: attendanceBatch.map(toAttendancePayload),
        workLogs: workLogBatch.map(toWorkLogPayload),
      });

      const attendanceOutcome = await this.applyResults('attendance', response.attendance);
      const workLogOutcome = await this.applyResults('work_log', response.workLogs);

      const outcome: SyncOutcome = {
        attempted: attendanceBatch.length + workLogBatch.length,
        synced: attendanceOutcome.synced + workLogOutcome.synced,
        duplicates: attendanceOutcome.duplicates + workLogOutcome.duplicates,
        failed: attendanceOutcome.failed + workLogOutcome.failed,
        skipped: false,
      };

      this.lastSyncAt = new Date();
      this.lastOutcome = outcome;
      this.consecutiveFailures = 0;

      await this.refreshPendingCount();

      // More drafts than one batch could carry: go again immediately.
      if (
        pendingAttendance.length > attendanceBatch.length ||
        pendingWorkLogs.length > workLogBatch.length
      ) {
        this.isRunning = false;
        return this.run();
      }

      return outcome;
    } catch (error) {
      const message =
        error instanceof ApiError
          ? error.message
          : error instanceof Error
            ? error.message
            : 'Sync failed.';

      const outcome: SyncOutcome = {
        attempted: 0,
        synced: 0,
        duplicates: 0,
        failed: 0,
        skipped: false,
        error: message,
      };
      this.lastOutcome = outcome;

      // A network error means the drafts are untouched and still pending — retry with
      // backoff rather than dropping them.
      if (error instanceof ApiError && error.isNetworkError) {
        this.scheduleRetry();
      }

      return outcome;
    } finally {
      this.isRunning = false;
      this.emit();
    }
  }

  /**
   * Applies per-record results.
   *
   * `created`, `updated` and `duplicate` are all successes from the device's point of
   * view: the record is on the server. Only `error` leaves the draft unsynced, and it
   * is marked `error` rather than left `pending` so it stops being retried forever and
   * surfaces to the student instead.
   */
  private async applyResults(
    entityType: 'attendance' | 'work_log',
    results: readonly SyncResult[],
  ): Promise<{ synced: number; duplicates: number; failed: number }> {
    let synced = 0;
    let duplicates = 0;
    let failed = 0;

    const markSynced =
      entityType === 'attendance' ? attendanceDrafts.markSynced : workLogDrafts.markSynced;
    const markError =
      entityType === 'attendance' ? attendanceDrafts.markError : workLogDrafts.markError;

    for (const result of results) {
      switch (result.status) {
        case 'created':
        case 'updated':
          await markSynced(result.clientId, result.serverId);
          synced += 1;
          break;

        case 'duplicate':
          // The server already holds this day. Adopt its id and stop resending.
          await markSynced(result.clientId, result.existingId ?? result.serverId);
          duplicates += 1;
          break;

        case 'error':
          await markError(result.clientId, result.message ?? 'The server rejected this record.');
          await syncQueue.recordAttempt(entityType, result.clientId, result.message ?? 'error');
          failed += 1;
          break;
      }
    }

    return { synced, duplicates, failed };
  }

  /**
   * Exponential backoff, capped at five minutes.
   *
   * Without a cap, a device offline overnight would schedule an absurd delay; without
   * backoff, it would hammer the radio and drain the battery.
   */
  private scheduleRetry(): void {
    if (this.retryTimer) clearTimeout(this.retryTimer);

    this.consecutiveFailures = Math.min(this.consecutiveFailures + 1, 6);
    const delay = Math.min(2 ** this.consecutiveFailures * 1000, 5 * 60 * 1000);

    this.retryTimer = setTimeout(() => {
      this.retryTimer = null;
      if (this.isConnected) void this.run();
    }, delay);
  }
}

/**
 * Maps a local draft row to the `POST /api/sync` payload.
 *
 * `clientId` is mandatory in the sync schema — it is the idempotency key — which is
 * why it is the local primary key too.
 */
function toAttendancePayload(row: AttendanceDraftRow) {
  return {
    clientId: row.client_id,
    internshipId: row.internship_id,
    date: row.attendance_date,
    status: row.status,
    reportingTime: row.reporting_time,
    leavingTime: row.leaving_time,
    mode: row.mode,
    leaveReason: row.leave_reason,
    proofDocumentId: row.proof_document_id,
  };
}

function toWorkLogPayload(row: WorkLogDraftRow) {
  return {
    clientId: row.client_id,
    internshipId: row.internship_id,
    workDate: row.work_date,
    activities: row.activities,
    technologies: workLogDrafts.parseTechnologies(row),
    taskAssigned: row.task_assigned,
    completionStatus: row.completion_status,
    learning: row.learning,
    challenge: row.challenge,
    solution: row.solution,
    deliverableType: row.deliverable_type,
    evidenceDocumentId: row.evidence_document_id,
    mentorInteraction: row.mentor_interaction === 1,
    mentorFeedback: row.mentor_feedback,
  } satisfies Omit<WorkLogDraftInput, 'technologies'> & { technologies: string[] };
}

export const syncEngine = new SyncEngine();
