/**
 * POST /api/sync — batch offline submission (03_TechSpec §5, 05_API_Spec "Batch Sync").
 *
 * Accepts queued attendance and work logs from a device that was offline and reports
 * a per-record outcome, so the device can mark each draft synced, reconcile a
 * duplicate, or surface an error against one row without losing the rest.
 *
 * Design decisions worth stating:
 *
 *  1. Records are processed independently, not in one transaction. 05_API_Spec
 *     returns a status *per record*, which is only meaningful if one bad record does
 *     not roll back the other nine. A student who fixes one day's entry should not
 *     have to resubmit the whole week.
 *
 *  2. Authorization is checked once per internship, not once per record, and the
 *     result cached for the request. A 30-record batch would otherwise issue 30
 *     identical permission queries.
 *
 *  3. `/api/sync` is "W own" for students only in the 05_API_Spec matrix — no other
 *     role may use it. Combined with the per-internship ownership check, this
 *     satisfies 09_Test_Plan §3: "Batch sync: clientIds from another student's
 *     device are rejected."
 *
 *  4. Errors are returned as `status: 'error'` entries rather than a 4xx for the
 *     whole request, unless the request itself is malformed. A partial success is
 *     the normal outcome after a long offline period.
 */

import type { NextRequest } from 'next/server';
import type { SyncResponse, SyncResult } from '@ims/shared-types';
import { syncRequestSchema } from '@ims/shared-validation';
import type {
  SyncAttendanceItemInput,
  SyncWorkLogItemInput,
} from '@ims/shared-validation';
import { ok, parseJson, withErrorHandling } from '@/lib/http';
import { requireAuth, type AuthContext } from '@/lib/auth/context';
import { assertInternshipAccess, requireStudentId } from '@/lib/auth/guards';
import { enforceRateLimit } from '@/lib/rateLimit';
import { ApiError, toApiError } from '@/lib/errors';
import { logger } from '@/lib/logger';
import { recordAudit } from '@/lib/audit';
import { upsertAttendance } from '@/server/attendance/attendanceService';
import { upsertWorkLog } from '@/server/workLogs/workLogService';

export const POST = withErrorHandling(async (request: NextRequest) => {
  const auth = await requireAuth(request);
  // Students only. Faculty and mentors have no offline write path.
  requireStudentId(auth);

  await enforceRateLimit('general', auth.userId);

  const batch = await parseJson(request, syncRequestSchema);

  // Cache per-internship authorization for the life of this request.
  const accessCache = new Map<string, Promise<void>>();
  const authorize = (internshipId: string, resource: 'attendance' | 'work_log'): Promise<void> => {
    const key = `${resource}:${internshipId}`;
    let pending = accessCache.get(key);
    if (!pending) {
      pending = assertInternshipAccess(auth, internshipId, resource, 'write').then(() => undefined);
      accessCache.set(key, pending);
    }
    return pending;
  };

  const attendance: SyncResult[] = [];
  for (const item of batch.attendance) {
    attendance.push(await processAttendance(auth, item, authorize));
  }

  const workLogs: SyncResult[] = [];
  for (const item of batch.workLogs) {
    workLogs.push(await processWorkLog(auth, item, authorize));
  }

  const response: SyncResponse = { attendance, workLogs };

  await recordAudit({
    action: 'sync_batch_processed',
    entityType: 'sync',
    entityId: null,
    actorUserId: auth.userId,
    context: auth.request,
    metadata: {
      attendance: summarise(attendance),
      workLogs: summarise(workLogs),
    },
  });

  return ok(response);
});

/**
 * Handles one attendance record.
 *
 * `clientId` is echoed back on every outcome, including errors, because it is the
 * only key the device can use to match a result to its local draft.
 */
async function processAttendance(
  auth: AuthContext,
  item: SyncAttendanceItemInput,
  authorize: (internshipId: string, resource: 'attendance') => Promise<void>,
): Promise<SyncResult> {
  try {
    await authorize(item.internshipId, 'attendance');

    const result = await upsertAttendance(auth, item, { fromSync: true });

    if (result.status === 'duplicate') {
      return {
        clientId: item.clientId,
        serverId: null,
        status: 'duplicate',
        existingId: result.record.id,
      };
    }

    return { clientId: item.clientId, serverId: result.record.id, status: 'created' };
  } catch (caught) {
    return toErrorResult(item.clientId, caught, 'attendance');
  }
}

async function processWorkLog(
  auth: AuthContext,
  item: SyncWorkLogItemInput,
  authorize: (internshipId: string, resource: 'work_log') => Promise<void>,
): Promise<SyncResult> {
  try {
    await authorize(item.internshipId, 'work_log');

    const result = await upsertWorkLog(auth, item, { fromSync: true });

    if (result.status === 'duplicate') {
      return {
        clientId: item.clientId,
        serverId: null,
        status: 'duplicate',
        existingId: result.record.id,
      };
    }

    return { clientId: item.clientId, serverId: result.record.id, status: 'created' };
  } catch (caught) {
    return toErrorResult(item.clientId, caught, 'work_log');
  }
}

/**
 * Converts a thrown error into a per-record error entry.
 *
 * Client errors (4xx) carry their message and field details through, so the device
 * can show the student what to fix. Server errors are logged and reported
 * generically — the same rule the global error handler follows.
 */
function toErrorResult(clientId: string, caught: unknown, kind: string): SyncResult {
  const error: ApiError = toApiError(caught);

  if (error.status >= 500) {
    logger.error({ clientId, kind, detail: error.detail }, 'Sync record failed unexpectedly');
    return {
      clientId,
      serverId: null,
      status: 'error',
      message: 'Could not sync this record. It will be retried.',
    };
  }

  return {
    clientId,
    serverId: null,
    status: 'error',
    message: error.message,
    ...(error.fields ? { fields: error.fields } : {}),
  };
}

/** Compact per-status counts for the audit row, without echoing record contents. */
function summarise(results: readonly SyncResult[]): Record<string, number> {
  const counts: Record<string, number> = {};
  for (const result of results) {
    counts[result.status] = (counts[result.status] ?? 0) + 1;
  }
  return counts;
}

export const dynamic = 'force-dynamic';
export const runtime = 'nodejs';
