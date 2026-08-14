/**
 * Outbound email.
 *
 * NOT WIRED TO A PROVIDER. The documents require email for two flows — password
 * reset (07_Security_and_Privacy §5) and the mentor invite link (02_SRS §1.4) —
 * but Phase 0 of 08_Implementation_Plan never selects a mail provider, so there is
 * nothing to configure against.
 *
 * This module therefore defines the seam and ships a development transport that
 * logs the message instead of sending it. Swapping in Resend, SES or SMTP means
 * implementing `MailTransport` and passing it to `setMailTransport` at startup.
 *
 * Consequence to be aware of: on a fresh deployment, password reset and mentor
 * invite links appear in the server log rather than in an inbox. That is safe for
 * development and unacceptable for production, so `sendMail` refuses to fall back
 * to the log transport when NODE_ENV is production.
 */

import { env, isProduction } from './env';
import { logger } from './logger';
import { serverError } from './errors';

export interface MailMessage {
  to: string;
  subject: string;
  /** Plain-text body. Kept text-only so no HTML templating layer is implied. */
  text: string;
}

export interface MailTransport {
  send(message: MailMessage): Promise<void>;
}

/**
 * Development transport: logs the message body, including any link, at info level
 * so a developer can copy the reset or invite URL out of the console.
 */
const logTransport: MailTransport = {
  async send(message) {
    logger.info(
      { to: message.to, subject: message.subject, body: message.text },
      'Email not sent — no mail transport configured. Body logged for development.',
    );
  },
};

const globalForMail = globalThis as unknown as { mailTransport: MailTransport | undefined };

export function setMailTransport(transport: MailTransport): void {
  globalForMail.mailTransport = transport;
}

export async function sendMail(message: MailMessage): Promise<void> {
  const transport = globalForMail.mailTransport;

  if (!transport) {
    if (isProduction) {
      // Failing loudly is the right call: silently logging a password reset token
      // in production would be a security incident, not a degraded feature.
      throw serverError('No mail transport is configured. Cannot send email.');
    }
    await logTransport.send(message);
    return;
  }

  await transport.send(message);
}

// ---------------------------------------------------------------------------
// Message templates
// ---------------------------------------------------------------------------

export function passwordResetEmail(options: { to: string; token: string }): MailMessage {
  const url = `${env.WEB_APP_URL}/reset-password?token=${encodeURIComponent(options.token)}`;
  const validForMinutes = Math.round(env.AUTH_RESET_TOKEN_EXPIRY / 60);

  return {
    to: options.to,
    subject: 'Reset your Internship Manager password',
    text: [
      'A password reset was requested for your Internship Manager account.',
      '',
      `Open this link to choose a new password: ${url}`,
      '',
      `The link is valid for ${validForMinutes} minutes and can be used once.`,
      'If you did not request this, you can ignore this email — your password is unchanged.',
    ].join('\n'),
  };
}

export function mentorInviteEmail(options: {
  to: string;
  mentorName: string;
  studentName: string;
  token: string;
  expiresAt: Date;
}): MailMessage {
  const url = `${env.WEB_APP_URL}/mentor/invite/${encodeURIComponent(options.token)}`;

  return {
    to: options.to,
    subject: `Internship evaluation request — ${env.INSTITUTION_NAME}`,
    text: [
      `Dear ${options.mentorName},`,
      '',
      `${env.INSTITUTION_NAME} would like your evaluation of ${options.studentName}, who is`,
      'completing an internship under your supervision.',
      '',
      `You can complete the short evaluation form here, with no app install required: ${url}`,
      '',
      `The link expires on ${options.expiresAt.toDateString()}.`,
      '',
      'Thank you for supporting our students.',
    ].join('\n'),
  };
}
