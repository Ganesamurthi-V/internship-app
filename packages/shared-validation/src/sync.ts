/**
 * Batch offline sync — 03_TechSpec §5, 05_API_Spec "Batch Sync".
 *
 * The one hard difference from the online endpoints: `clientId` is **required**
 * here. It is the idempotency key, and without it a retried batch after a flaky
 * response would create duplicates — the exact failure 09_Test_Plan §4 tests for
 * ("submit duplicate attendance while offline → only one record created").
 */

import { z } from 'zod';
import { MAX_SYNC_BATCH_SIZE, SYNC_RESULT_STATUSES } from '@ims/shared-types';
import { attendanceFields, refineAttendance } from './attendance';
import { workLogFields } from './workLog';
import { uuidSchema } from './common';

export const syncAttendanceItemSchema = z
  .object({
    ...attendanceFields,
    clientId: uuidSchema,
  })
  .superRefine(refineAttendance);
export type SyncAttendanceItemInput = z.infer<typeof syncAttendanceItemSchema>;

export const syncWorkLogItemSchema = z.object({
  ...workLogFields,
  clientId: uuidSchema,
});
export type SyncWorkLogItemInput = z.infer<typeof syncWorkLogItemSchema>;

/**
 * Batch size is capped so one device cannot submit an unbounded transaction.
 * The cap counts each collection separately, which is the simpler contract for
 * the client to respect while chunking.
 */
export const syncRequestSchema = z
  .object({
    attendance: z.array(syncAttendanceItemSchema).max(MAX_SYNC_BATCH_SIZE).default([]),
    workLogs: z.array(syncWorkLogItemSchema).max(MAX_SYNC_BATCH_SIZE).default([]),
  })
  .refine((value) => value.attendance.length > 0 || value.workLogs.length > 0, {
    message: 'Nothing to sync.',
  })
  .superRefine((value, ctx) => {
    // A batch that repeats a clientId is a client bug; failing loudly beats
    // silently collapsing records the device still thinks are distinct.
    assertUniqueClientIds(value.attendance, 'attendance', ctx);
    assertUniqueClientIds(value.workLogs, 'workLogs', ctx);
  });
export type SyncRequestInput = z.infer<typeof syncRequestSchema>;

function assertUniqueClientIds(
  items: readonly { clientId: string }[],
  field: 'attendance' | 'workLogs',
  ctx: z.RefinementCtx,
): void {
  const seen = new Set<string>();
  items.forEach((item, index) => {
    if (seen.has(item.clientId)) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'Duplicate clientId in the same batch.',
        path: [field, index, 'clientId'],
      });
    }
    seen.add(item.clientId);
  });
}

/** Shape of each entry in the sync response, mirrored by the mobile sync engine. */
export const syncResultSchema = z.object({
  clientId: uuidSchema,
  serverId: uuidSchema.nullable(),
  status: z.enum(SYNC_RESULT_STATUSES),
  existingId: uuidSchema.optional(),
  message: z.string().optional(),
  fields: z.record(z.string()).optional(),
});
export type SyncResultOutput = z.infer<typeof syncResultSchema>;

export const syncResponseSchema = z.object({
  attendance: z.array(syncResultSchema),
  workLogs: z.array(syncResultSchema),
});
export type SyncResponseOutput = z.infer<typeof syncResponseSchema>;
