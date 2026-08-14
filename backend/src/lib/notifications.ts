/**
 * In-app notifications — 02_SRS §4.
 *
 * Notifications are recorded in `notification_logs` and read by the client through
 * `GET /api/notifications`, plus the unread counter on the student dashboard.
 *
 * There is deliberately no OS-level push delivery. The Expo Push Service
 * integration that 03_TechSpec §3.4 and 12_Mobile_App_Spec §7 describe was removed
 * along with `device_tokens` and the `expo-notifications` client dependency, so the
 * in-app list is now the only channel. See the README for the rationale.
 *
 * The payload rule from 07_Security_and_Privacy §7 still applies: a notification
 * body must never carry sensitive data. "You have a pending submission" is fine; a
 * student's name or a record detail is not. `data` carries an in-app screen path
 * only, and the client fetches real content over the authenticated API.
 */

import type { NotificationType } from '@ims/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** In-app screen target, e.g. `{ screen: '/(student)/attendance/today' }`. */
  data?: Record<string, unknown>;
}

/**
 * Records a notification for one user.
 *
 * Errors propagate. This was already the behaviour when push existed — the row
 * write sat outside the delivery try/catch — and it is the right one: a caller that
 * believes it notified a student should not silently be wrong.
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  await prisma.notificationLog.create({
    data: {
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      // Cast is needed because Prisma's InputJsonValue does not accept a bare
      // index signature. The payload is screen metadata only, always
      // JSON-serialisable by construction.
      data: (payload.data ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    select: { id: true },
  });
}

/** Records the same notification for several users. */
export async function sendBulkNotification(
  userIds: readonly string[],
  notification: Omit<NotificationPayload, 'userId'>,
): Promise<void> {
  if (userIds.length === 0) return;

  await prisma.notificationLog.createMany({
    data: userIds.map((userId) => ({
      userId,
      type: notification.type,
      title: notification.title,
      body: notification.body,
      data: (notification.data ?? undefined) as Prisma.InputJsonValue | undefined,
    })),
  });
}

// ---------------------------------------------------------------------------
// Notification copy
// ---------------------------------------------------------------------------

/**
 * Centralised notification text for the events in 02_SRS §4.
 *
 * Kept together so the "no sensitive data in the body" rule is verifiable by
 * reading one block, rather than auditing every call site.
 */
export const NOTIFICATIONS = {
  internshipApproved: (): Omit<NotificationPayload, 'userId'> => ({
    type: 'internship_approved',
    title: 'Internship approved',
    body: 'Your internship registration has been approved. You can start daily logging.',
    data: { screen: '/(student)/dashboard' },
  }),

  internshipRejected: (): Omit<NotificationPayload, 'userId'> => ({
    type: 'internship_rejected',
    title: 'Registration needs changes',
    body: 'Your internship registration was returned. Open the app to see what to fix.',
    data: { screen: '/(student)/internship/register' },
  }),

  missingDailySubmission: (): Omit<NotificationPayload, 'userId'> => ({
    type: 'missing_daily_submission',
    title: 'Daily log missing',
    body: "Don't forget to submit today's attendance and work log.",
    data: { screen: '/(student)/attendance/today' },
  }),

  weeklyReportDue: (): Omit<NotificationPayload, 'userId'> => ({
    type: 'weekly_report_due',
    title: 'Weekly report due',
    body: 'This week is closing. Submit your weekly report.',
    data: { screen: '/(student)/weekly-report/list' },
  }),

  finalAssessmentDue: (daysRemaining: number): Omit<NotificationPayload, 'userId'> => ({
    type: 'final_assessment_due',
    title: 'Final assessment due',
    body:
      daysRemaining > 0
        ? `Your internship ends in ${daysRemaining} days. Complete your final assessment.`
        : 'Your internship has ended. Complete your final assessment.',
    data: { screen: '/(student)/final-assessment' },
  }),

  finalAssessmentReopened: (): Omit<NotificationPayload, 'userId'> => ({
    type: 'final_assessment_reopened',
    title: 'Final assessment reopened',
    body: 'Your final assessment has been reopened for edits.',
    data: { screen: '/(student)/final-assessment' },
  }),

  mentorEvaluationRequest: (): Omit<NotificationPayload, 'userId'> => ({
    type: 'mentor_evaluation_request',
    title: 'Evaluation requested',
    body: 'An internship evaluation is waiting for your input.',
    data: { screen: '/(mentor)/dashboard' },
  }),

  documentVerified: (): Omit<NotificationPayload, 'userId'> => ({
    type: 'document_verified',
    title: 'Document verified',
    body: 'One of your uploaded documents has been verified.',
    data: { screen: '/(student)/internship/documents' },
  }),

  documentRejected: (): Omit<NotificationPayload, 'userId'> => ({
    type: 'document_rejected',
    title: 'Document needs re-upload',
    body: 'A document was not accepted. Open the app to see why and upload again.',
    data: { screen: '/(student)/internship/documents' },
  }),
} as const;
