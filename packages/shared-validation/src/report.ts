/**
 * Reporting, export and notification schemas — 02_SRS §7, 05_API_Spec.
 */

import { z } from 'zod';
import { EXPORT_FORMATS, EXPORT_SCOPES, NOTIFICATION_TYPES } from '@ims/shared-types';
import { dateOnlySchema, paginationQuerySchema, uuidSchema } from './common';

export const reportQuerySchema = z.object({
  internshipId: uuidSchema,
});
export type ReportQueryInput = z.infer<typeof reportQuerySchema>;

/**
 * Export request. Each scope needs its own identifier, so the refinement makes
 * sure the caller supplied the one that matches — otherwise a `scope: 'student'`
 * request with no `studentId` would silently export nothing.
 */
export const createExportSchema = z
  .object({
    scope: z.enum(EXPORT_SCOPES, {
      errorMap: () => ({ message: 'Choose what to export.' }),
    }),
    format: z.enum(EXPORT_FORMATS).default('pdf'),
    studentId: uuidSchema.optional(),
    internshipId: uuidSchema.optional(),
    departmentId: uuidSchema.optional(),
    organisationId: uuidSchema.optional(),
    from: dateOnlySchema.optional(),
    to: dateOnlySchema.optional(),
  })
  .superRefine((value, ctx) => {
    const requiredField = {
      student: 'studentId',
      internship_period: 'from',
      department: 'departmentId',
      organisation: 'organisationId',
    }[value.scope] as 'studentId' | 'from' | 'departmentId' | 'organisationId';

    if (!value[requiredField]) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: `This export scope requires ${requiredField}.`,
        path: [requiredField],
      });
    }

    if (value.from && value.to && value.from > value.to) {
      ctx.addIssue({
        code: z.ZodIssueCode.custom,
        message: 'The "from" date must be on or before the "to" date.',
        path: ['from'],
      });
    }
  });
export type CreateExportInput = z.infer<typeof createExportSchema>;

export const exportJobParamsSchema = z.object({
  jobId: uuidSchema,
});
export type ExportJobParamsInput = z.infer<typeof exportJobParamsSchema>;

// ---------------------------------------------------------------------------
// Notifications
// ---------------------------------------------------------------------------

export const notificationListQuerySchema = paginationQuerySchema.extend({
  unreadOnly: z
    .union([z.boolean(), z.enum(['true', 'false'])])
    .transform((value) => (typeof value === 'boolean' ? value : value === 'true'))
    .default(false),
  type: z.enum(NOTIFICATION_TYPES).optional(),
});
export type NotificationListQueryInput = z.infer<typeof notificationListQuerySchema>;

/**
 * Admin-configurable notification schedule (02_SRS §4). Times are stored as local
 * `HH:MM` strings and interpreted in the institution's timezone by the scheduler.
 */
export const notificationSettingsSchema = z.object({
  missingDailySubmissionAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, { message: 'Enter a time in HH:MM format.' })
    .optional(),
  weeklyReportReminderDay: z.number().int().min(0).max(6).optional(),
  weeklyReportReminderAt: z
    .string()
    .regex(/^([01]\d|2[0-3]):[0-5]\d$/u, { message: 'Enter a time in HH:MM format.' })
    .optional(),
  finalAssessmentLeadDays: z.number().int().min(0).max(30).optional(),
  enabled: z.boolean().optional(),
});
export type NotificationSettingsInput = z.infer<typeof notificationSettingsSchema>;

// ---------------------------------------------------------------------------
// Audit log browsing — faculty (scoped) and admin
// ---------------------------------------------------------------------------

export const auditLogQuerySchema = paginationQuerySchema.extend({
  action: z.string().trim().max(64).optional(),
  entityType: z.string().trim().max(64).optional(),
  entityId: uuidSchema.optional(),
  actorUserId: uuidSchema.optional(),
  from: dateOnlySchema.optional(),
  to: dateOnlySchema.optional(),
});
export type AuditLogQueryInput = z.infer<typeof auditLogQuerySchema>;
