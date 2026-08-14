/**
 * @ims/shared-validation — Zod schemas and pure domain calculations shared by the
 * Expo app and the backend, so a form and the route it posts to can never
 * disagree (03_TechSpec §2.1: "Consistent with backend validation schemas").
 *
 *   import { createAttendanceSchema, countWords } from '@ims/shared-validation';
 */

export * from './calculations';
export * from './common';
export * from './auth';
export * from './student';
export * from './internship';
export * from './attendance';
export * from './workLog';
export * from './sync';
export * from './weeklyReport';
export * from './finalAssessment';
export * from './mentorEvaluation';
export * from './document';
export * from './report';
