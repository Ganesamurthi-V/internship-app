/**
 * @ims/shared-validation — Zod schemas and pure domain calculations shared by the
 * Expo app and the backend, so a form and the route it posts to can never disagree
 * about what is valid.
 *
 *   import { submitAnswersSchema, summariseSubmissions } from '@ims/shared-validation';
 */
export * from './calculations';
export * from './common';
export * from './auth';
export * from './student';
export * from './question';
export * from './submission';
export * from './retake';
export * from './document';
