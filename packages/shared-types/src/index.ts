/**
 * @ims/shared-types — the single source of truth for every shape that crosses
 * the boundary between the Expo app and the backend.
 *
 * Consumed by `@ims/backend` and `@ims/mobile`. Import from the package root:
 *
 *   import type { Attendance, ApiResponse } from '@ims/shared-types';
 *   import { ATTENDANCE_STATUSES, RATE_LIMITS } from '@ims/shared-types';
 */

export * from './enums';
export * from './limits';
export * from './entities';
export * from './api';
