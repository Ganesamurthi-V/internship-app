/**
 * Structured logging (08_Implementation_Plan Phase 1, step 10).
 *
 * Redaction is the important part: 07_Security_and_Privacy §6 forbids sensitive
 * fields from leaving the server, and logs are an easy accidental leak. Every
 * known secret-bearing path is redacted at the logger level so no individual call
 * site has to remember.
 */

import pino from 'pino';
import { env, isProduction, isTest } from './env';

export const logger = pino({
  level: isTest ? 'silent' : env.LOG_LEVEL,

  redact: {
    paths: [
      'password',
      'passwordHash',
      'password_hash',
      'currentPassword',
      'confirmPassword',
      'accessToken',
      'refreshToken',
      'token',
      'tokenHash',
      'inviteToken',
      'storageKey',
      'uploadUrl',
      'downloadUrl',
      'expoPushToken',
      'req.headers.authorization',
      'req.headers.cookie',
      '*.password',
      '*.refreshToken',
      '*.storageKey',
    ],
    censor: '[redacted]',
  },

  base: { service: 'ims-api' },

  // Pretty output locally; single-line JSON in production for log shipping.
  ...(isProduction
    ? {}
    : {
        transport: {
          target: 'pino/file',
          options: { destination: 1 },
        },
      }),
});

/** Child logger tagged with a request id, so one request's lines can be grouped. */
export function requestLogger(requestId: string, route: string) {
  return logger.child({ requestId, route });
}
