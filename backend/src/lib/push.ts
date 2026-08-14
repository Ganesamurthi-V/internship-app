/**
 * Push notifications via the Expo Push Service — 03_TechSpec §3.4, 12_Mobile_App_Spec §7.
 *
 * One `POST https://exp.host/--/api/v2/push/send` fans out to FCM (Android) and
 * APNs (iOS). Every send is also recorded in `notification_logs` so the in-app
 * notification list works even when the OS-level push was dropped.
 *
 * Payload rule from 07_Security_and_Privacy §7: the notification body must never
 * carry sensitive data. "You have a pending submission" is acceptable; a student's
 * name or a record detail is not. Callers pass a `data` payload for deep linking
 * only, and the app fetches the real content over the authenticated API on open.
 */

import type { NotificationType } from '@ims/shared-types';
import type { Prisma } from '@prisma/client';
import { prisma } from './prisma';
import { env } from './env';
import { logger } from './logger';

interface ExpoPushMessage {
  to: string;
  title: string;
  body: string;
  data?: Record<string, unknown>;
  sound: 'default';
  priority: 'high';
  channelId?: string;
}

interface ExpoPushTicket {
  status: 'ok' | 'error';
  id?: string;
  message?: string;
  details?: { error?: string };
}

export interface NotificationPayload {
  userId: string;
  type: NotificationType;
  title: string;
  body: string;
  /** Deep-link target, e.g. `{ screen: '/(student)/attendance/today' }`. */
  data?: Record<string, unknown>;
}

/**
 * Records a notification and attempts delivery to all of the user's devices.
 *
 * The database row is written first and unconditionally: the in-app list is the
 * reliable channel, and push is best-effort. Delivery failure never propagates —
 * a student must not fail to get their internship approved because Expo is down.
 */
export async function sendNotification(payload: NotificationPayload): Promise<void> {
  const log = await prisma.notificationLog.create({
    data: {
      userId: payload.userId,
      type: payload.type,
      title: payload.title,
      body: payload.body,
      // Cast is needed because Prisma's InputJsonValue does not accept a bare
      // index signature. The payload is deep-link metadata only, always
      // JSON-serialisable by construction.
      data: (payload.data ?? undefined) as Prisma.InputJsonValue | undefined,
    },
    select: { id: true },
  });

  try {
    const tokens = await prisma.deviceToken.findMany({
      where: { userId: payload.userId },
      select: { id: true, expoPushToken: true },
    });

    if (tokens.length === 0) return;

    const tickets = await pushToExpo(
      tokens.map((token) => ({
        to: token.expoPushToken,
        title: payload.title,
        body: payload.body,
        data: { ...payload.data, notificationId: log.id },
        sound: 'default' as const,
        priority: 'high' as const,
        channelId: 'default',
      })),
    );

    await handleTickets(tokens, tickets);

    if (tickets.some((ticket) => ticket.status === 'ok')) {
      await prisma.notificationLog.update({
        where: { id: log.id },
        data: { deliveredAt: new Date() },
      });
    }
  } catch (error) {
    logger.error(
      { userId: payload.userId, type: payload.type, error: describe(error) },
      'Push delivery failed; in-app notification was still recorded',
    );
  }
}

/** Sends the same notification to several users, one Expo request per 100 tokens. */
export async function sendBulkNotification(
  userIds: readonly string[],
  notification: Omit<NotificationPayload, 'userId'>,
): Promise<void> {
  await Promise.all(userIds.map((userId) => sendNotification({ ...notification, userId })));
}

/**
 * Posts to Expo in batches of 100, which is the service's documented maximum per
 * request.
 */
async function pushToExpo(messages: ExpoPushMessage[]): Promise<ExpoPushTicket[]> {
  const BATCH_SIZE = 100;
  const tickets: ExpoPushTicket[] = [];

  for (let index = 0; index < messages.length; index += BATCH_SIZE) {
    const batch = messages.slice(index, index + BATCH_SIZE);

    const response = await fetch(env.EXPO_PUSH_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Accept: 'application/json',
        ...(env.EXPO_ACCESS_TOKEN ? { Authorization: `Bearer ${env.EXPO_ACCESS_TOKEN}` } : {}),
      },
      body: JSON.stringify(batch),
    });

    if (!response.ok) {
      logger.warn({ status: response.status }, 'Expo push request was rejected');
      tickets.push(...batch.map(() => ({ status: 'error' as const, message: 'Request rejected' })));
      continue;
    }

    const parsed = (await response.json()) as { data?: ExpoPushTicket[] };
    tickets.push(...(parsed.data ?? []));
  }

  return tickets;
}

/**
 * Prunes tokens Expo reports as unregistered.
 *
 * `DeviceNotRegistered` means the app was uninstalled or the token rotated. Left
 * in place, these accumulate and every future send wastes a slot in the batch.
 */
async function handleTickets(
  tokens: readonly { id: string; expoPushToken: string }[],
  tickets: readonly ExpoPushTicket[],
): Promise<void> {
  const deadTokenIds: string[] = [];

  tickets.forEach((ticket, index) => {
    if (ticket.status === 'error' && ticket.details?.error === 'DeviceNotRegistered') {
      const token = tokens[index];
      if (token) deadTokenIds.push(token.id);
    }
  });

  if (deadTokenIds.length > 0) {
    await prisma.deviceToken.deleteMany({ where: { id: { in: deadTokenIds } } });
    logger.info({ count: deadTokenIds.length }, 'Removed unregistered push tokens');
  }
}

function describe(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
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
